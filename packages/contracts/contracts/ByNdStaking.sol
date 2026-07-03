// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title  ByNdStaking — Multi-token staking for veBYND holders
/// @notice Users stake veBYND here to earn any ERC-20 rewards harvested from
///         Mezo gauge bribes. Supports unlimited reward tokens simultaneously
///         using the Synthetix rewardPerToken accounting pattern per token.
///
/// Reward accounting per token (Synthetix pattern):
///   rewardData[token].rewardPerTokenStored  — cumulative reward per staked veBYND (scaled 1e18)
///   userRewardPerTokenPaid[token][user]     — snapshot at last user interaction
///   rewards[token][user]                   — accrued but unclaimed balance
///
/// Only ByNdVoter (the distributor) can call notifyRewardAmount().
contract ByNdStaking is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    IERC20  public immutable stakingToken; // veBYND
    address public distributor;            // ByNdVoter

    struct RewardData {
        uint256 rewardPerTokenStored;
    }

    // reward token address → reward accounting state
    mapping(address => RewardData) public rewardData;
    // reward token address → user address → reward per token paid snapshot
    mapping(address => mapping(address => uint256)) public userRewardPerTokenPaid;
    // reward token address → user address → accrued reward balance
    mapping(address => mapping(address => uint256)) public rewards;

    // ordered list of reward tokens ever added (for UI enumeration)
    address[] public rewardTokens;
    mapping(address => bool) public isRewardToken;

    uint256 public totalStaked;
    mapping(address => uint256) public stakedBalance;

    event Staked(address indexed user, uint256 amount);
    event Unstaked(address indexed user, uint256 amount);
    event RewardClaimed(address indexed user, address indexed token, uint256 amount);
    event RewardNotified(address indexed token, uint256 amount);
    event RewardTokenAdded(address indexed token);
    event DistributorUpdated(address indexed newDistributor);

    constructor(
        address _stakingToken,
        address _musd,          // MUSD added as first reward token at deploy
        address _distributor
    ) Ownable(msg.sender) {
        stakingToken = IERC20(_stakingToken);
        distributor  = _distributor;
        _addRewardToken(_musd);
    }

    // ── Modifiers ────────────────────────────────────────────────────────────

    modifier updateRewards(address account) {
        uint256 len = rewardTokens.length;
        for (uint256 i = 0; i < len; i++) {
            address token = rewardTokens[i];
            rewardData[token].rewardPerTokenStored = _rewardPerToken(token);
            if (account != address(0)) {
                rewards[token][account]              = claimable(token, account);
                userRewardPerTokenPaid[token][account] = rewardData[token].rewardPerTokenStored;
            }
        }
        _;
    }

    // ── Staking ──────────────────────────────────────────────────────────────

    /// @notice Stake veBYND to start earning all active reward tokens.
    function stake(uint256 amount) external nonReentrant updateRewards(msg.sender) {
        require(amount > 0, "ByNdStaking: amount = 0");
        totalStaked               += amount;
        stakedBalance[msg.sender] += amount;
        stakingToken.safeTransferFrom(msg.sender, address(this), amount);
        emit Staked(msg.sender, amount);
    }

    /// @notice Unstake veBYND. Does NOT auto-claim — call claimAll() first.
    function unstake(uint256 amount) external nonReentrant updateRewards(msg.sender) {
        require(amount > 0,                          "ByNdStaking: amount = 0");
        require(stakedBalance[msg.sender] >= amount, "ByNdStaking: insufficient");
        totalStaked               -= amount;
        stakedBalance[msg.sender] -= amount;
        stakingToken.safeTransfer(msg.sender, amount);
        emit Unstaked(msg.sender, amount);
    }

    // ── Claiming ─────────────────────────────────────────────────────────────

    /// @notice Claim rewards for a specific token.
    function claimReward(address token) external nonReentrant updateRewards(msg.sender) {
        uint256 amount = rewards[token][msg.sender];
        if (amount > 0) {
            rewards[token][msg.sender] = 0;
            IERC20(token).safeTransfer(msg.sender, amount);
            emit RewardClaimed(msg.sender, token, amount);
        }
    }

    /// @notice Claim all pending rewards across every reward token in one tx.
    function claimAll() external nonReentrant updateRewards(msg.sender) {
        uint256 len = rewardTokens.length;
        for (uint256 i = 0; i < len; i++) {
            address token  = rewardTokens[i];
            uint256 amount = rewards[token][msg.sender];
            if (amount > 0) {
                rewards[token][msg.sender] = 0;
                IERC20(token).safeTransfer(msg.sender, amount);
                emit RewardClaimed(msg.sender, token, amount);
            }
        }
    }

    /// @notice Legacy alias so ByNdVoter's existing claimRewards() call still works.
    function claimRewards() external nonReentrant updateRewards(msg.sender) {
        uint256 len = rewardTokens.length;
        for (uint256 i = 0; i < len; i++) {
            address token  = rewardTokens[i];
            uint256 amount = rewards[token][msg.sender];
            if (amount > 0) {
                rewards[token][msg.sender] = 0;
                IERC20(token).safeTransfer(msg.sender, amount);
                emit RewardClaimed(msg.sender, token, amount);
            }
        }
    }

    // ── Reward Distribution ──────────────────────────────────────────────────

    /// @notice Called by ByNdVoter after each harvest to distribute rewards.
    ///         Automatically registers new tokens on first call.
    /// @param  token   ERC-20 token address (any bribe token)
    /// @param  amount  Amount to distribute to stakers
    function notifyRewardAmount(address token, uint256 amount)
        external
        updateRewards(address(0))
    {
        require(msg.sender == distributor, "ByNdStaking: not distributor");
        if (totalStaked == 0 || amount == 0) return;

        if (!isRewardToken[token]) {
            _addRewardToken(token);
        }

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        rewardData[token].rewardPerTokenStored += (amount * 1e18) / totalStaked;

        emit RewardNotified(token, amount);
    }

    // ── Views ────────────────────────────────────────────────────────────────

    /// @notice Pending reward for a user in a specific token.
    function claimable(address token, address user) public view returns (uint256) {
        return rewards[token][user] + (
            stakedBalance[user] * (_rewardPerToken(token) - userRewardPerTokenPaid[token][user])
        ) / 1e18;
    }

    /// @notice Legacy view — pending MUSD specifically (first reward token).
    function claimableMUSD(address user) external view returns (uint256) {
        if (rewardTokens.length == 0) return 0;
        return claimable(rewardTokens[0], user);
    }

    /// @notice All pending rewards for a user across every token.
    function claimableAll(address user)
        external
        view
        returns (address[] memory tokens, uint256[] memory amounts)
    {
        uint256 len = rewardTokens.length;
        tokens  = new address[](len);
        amounts = new uint256[](len);
        for (uint256 i = 0; i < len; i++) {
            tokens[i]  = rewardTokens[i];
            amounts[i] = claimable(rewardTokens[i], user);
        }
    }

    /// @notice Legacy alias kept for ABI compatibility.
    function earned(address user) external view returns (uint256) {
        if (rewardTokens.length == 0) return 0;
        return claimable(rewardTokens[0], user);
    }

    function rewardTokenCount() external view returns (uint256) {
        return rewardTokens.length;
    }

    // ── Admin ────────────────────────────────────────────────────────────────

    function setDistributor(address _distributor) external onlyOwner {
        distributor = _distributor;
        emit DistributorUpdated(_distributor);
    }

    // ── Internal ─────────────────────────────────────────────────────────────

    function _addRewardToken(address token) internal {
        require(token != address(0), "ByNdStaking: zero address");
        if (!isRewardToken[token]) {
            isRewardToken[token] = true;
            rewardTokens.push(token);
            emit RewardTokenAdded(token);
        }
    }

    function _rewardPerToken(address token) internal view returns (uint256) {
        return rewardData[token].rewardPerTokenStored;
    }
}
