// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/// @title  ByNdStaking multi-token staking for veBYND holders
/// @notice Users stake veBYND to earn any ERC-20 rewards harvested from gauge fees and supports unlimited simultaneous reward tokens (Synthetix rewardPerToken pattern).
contract ByNdStaking is
    Initializable,
    ReentrancyGuardUpgradeable,
    OwnableUpgradeable,
    UUPSUpgradeable
{
    using SafeERC20Upgradeable for IERC20Upgradeable;

    IERC20Upgradeable public stakingToken;
    address public distributor;

    /// @dev Appending members here is layout-safe: `rewardData` is a mapping, so
    ///      each entry lives at keccak(key, slot) and the new members occupy the
    ///      following slots, which were previously unallocated. Do NOT reorder or
    ///      remove existing members.
    struct RewardData {
        uint256 rewardPerTokenStored;
        uint256 rewardRate;      // tokens per second, scaled by RATE_PRECISION
        uint256 lastUpdateTime;
        uint256 periodFinish;
    }

    /// @dev rewardRate carries 1e36 rather than the usual 1e18 of extra scale.
    ///      The rate is a truncating division by rewardsDuration (604800), and
    ///      that truncation is then multiplied back up by the elapsed seconds, so
    ///      every bit of headroom here is a bit of reward that reaches stakers
    ///      instead of being stranded. Overflow is not a concern: the widest
    ///      intermediate is amount * 1e36, leaving room for ~1e41 wei of a single
    ///      notify (1e23 whole 18-decimal tokens).
    uint256 private constant RATE_PRECISION = 1e36;

    mapping(address => RewardData) public rewardData;
    mapping(address => mapping(address => uint256))  public userRewardPerTokenPaid;
    mapping(address => mapping(address => uint256))  public rewards;

    address[] public rewardTokens;
    mapping(address => bool) public isRewardToken;

    uint256 public totalStaked;
    mapping(address => uint256) public stakedBalance;

    /// @notice Window over which a notified reward is streamed to stakers.
    /// @dev Appended after `stakedBalance` — new slot, layout-safe. Fixed at
    ///      7 days; there is deliberately no setter (see initializeV2).
    uint256 public rewardsDuration;

    event Staked(address indexed user, uint256 amount);
    event Unstaked(address indexed user, uint256 amount);
    event RewardClaimed(address indexed user, address indexed token, uint256 amount);
    event RewardNotified(address indexed token, uint256 amount);
    event RewardTokenAdded(address indexed token);
    event DistributorUpdated(address indexed newDistributor);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _stakingToken, address _distributor) public initializer {
        __ReentrancyGuard_init();
        __Ownable_init(); 
        __UUPSUpgradeable_init();

        require(_stakingToken != address(0), "ByNdStaking: zero staking token");
        require(_distributor != address(0), "ByNdStaking: zero distributor");

        stakingToken = IERC20Upgradeable(_stakingToken);
        distributor = _distributor;
        rewardsDuration = 7 days;
    }

    /// @notice Migration hook for proxies deployed before reward streaming existed.
    /// @dev Those proxies have `rewardsDuration == 0`, which would make
    ///      notifyRewardAmount divide by zero. It also stamps `lastUpdateTime` on
    ///      every already-registered reward token so the first post-upgrade accrual
    ///      measures from now rather than from the epoch. `periodFinish` stays 0:
    ///      everything notified under the old instant-distribution model is already
    ///      fully credited in `rewardPerTokenStored`, so there is nothing to stream.
    function initializeV2() public reinitializer(2) onlyOwner {
        rewardsDuration = 7 days;
        uint256 len = rewardTokens.length;
        for (uint256 i = 0; i < len; i++) {
            rewardData[rewardTokens[i]].lastUpdateTime = block.timestamp;
        }
    }

    modifier updateRewards(address account) {
        uint256 len = rewardTokens.length;
        uint256 supply = totalStaked;
        for (uint256 i = 0; i < len; i++) {
            address token = rewardTokens[i];
            RewardData storage d = rewardData[token];

            if (supply == 0) {
                // Nothing can accrue with no stakers. Simply advancing
                // lastUpdateTime would silently burn that slice of the stream, so
                // push periodFinish out by the same amount instead: the stream
                // pauses rather than leaks. This cannot be gamed —
                // rewardPerTokenStored does not jump when stakers return, it just
                // resumes accruing at the unchanged rewardRate.
                if (d.periodFinish > d.lastUpdateTime) {
                    d.periodFinish += block.timestamp - d.lastUpdateTime;
                }
                d.lastUpdateTime = block.timestamp;
            } else {
                d.rewardPerTokenStored = _rewardPerToken(token);
                d.lastUpdateTime = _lastTimeRewardApplicable(d.periodFinish);
            }

            if (account != address(0)) {
                // lastUpdateTime is already advanced above, so _rewardPerToken
                // inside claimable() returns the stored value and cannot
                // double-count the slice we just credited.
                rewards[token][account] = claimable(token, account);
                userRewardPerTokenPaid[token][account] = d.rewardPerTokenStored;
            }
        }
        _;
    }

    function stake(uint256 amount) external nonReentrant updateRewards(msg.sender) {
        require(amount > 0, "ByNdStaking: amount = 0");
        totalStaked += amount;
        stakedBalance[msg.sender] += amount;
        stakingToken.safeTransferFrom(msg.sender, address(this), amount);
        emit Staked(msg.sender, amount);
    }

    function unstake(uint256 amount) external nonReentrant updateRewards(msg.sender) {
        require(amount > 0, "ByNdStaking: amount = 0");
        require(stakedBalance[msg.sender] >= amount, "ByNdStaking: insufficient balance");
        totalStaked -= amount;
        stakedBalance[msg.sender] -= amount;
        stakingToken.safeTransfer(msg.sender, amount);
        emit Unstaked(msg.sender, amount);
    }

    function claimAll() external nonReentrant updateRewards(msg.sender) {
        uint256 len = rewardTokens.length;
        for (uint256 i = 0; i < len; i++) {
            address token  = rewardTokens[i];
            uint256 amount = rewards[token][msg.sender];
            if (amount > 0) {
                rewards[token][msg.sender] = 0;
                IERC20Upgradeable(token).safeTransfer(msg.sender, amount);
                emit RewardClaimed(msg.sender, token, amount);
            }
        }
    }

    function claimReward(address token) external nonReentrant updateRewards(msg.sender) {
        uint256 amount = rewards[token][msg.sender];
        if (amount > 0) {
            rewards[token][msg.sender] = 0;
            IERC20Upgradeable(token).safeTransfer(msg.sender, amount);
            emit RewardClaimed(msg.sender, token, amount);
        }
    }

    function notifyRewardAmount(address token, uint256 amount)
        external
        nonReentrant
        updateRewards(address(0))
    {
        require(msg.sender == distributor, "ByNdStaking: not distributor");
        if (totalStaked == 0 || amount == 0) return;

        if (!isRewardToken[token]) {
            isRewardToken[token] = true;
            rewardTokens.push(token);
            emit RewardTokenAdded(token);
        }

        IERC20Upgradeable(token).safeTransferFrom(msg.sender, address(this), amount);

        // Standard Synthetix rate computation with leftover carry-over: whatever
        // has not yet streamed from the previous period is folded into the new
        // one, so no notified value is ever dropped.
        RewardData storage d = rewardData[token];
        uint256 duration = rewardsDuration;
        if (block.timestamp >= d.periodFinish) {
            d.rewardRate = (amount * RATE_PRECISION) / duration;
        } else {
            uint256 remaining = d.periodFinish - block.timestamp;
            uint256 leftover = (remaining * d.rewardRate) / RATE_PRECISION;
            d.rewardRate = ((amount + leftover) * RATE_PRECISION) / duration;
        }
        d.lastUpdateTime = block.timestamp;
        d.periodFinish = block.timestamp + duration;

        emit RewardNotified(token, amount);
    }

    /// @notice Rewards accrued but not yet claimed by `user` for `token`.
    function claimable(address token, address user) public view returns (uint256) {
        return rewards[token][user] + (
            stakedBalance[user] *
            (_rewardPerToken(token) - userRewardPerTokenPaid[token][user])
        ) / 1e18;
    }

    function claimableAll(address user)
        external view
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

    function rewardTokenCount() external view returns (uint256) {
        return rewardTokens.length;
    }

    function setDistributor(address _distributor) external onlyOwner {
        require(_distributor != address(0), "ByNdStaking: zero address");
        distributor = _distributor;
        emit DistributorUpdated(_distributor);
    }

    /// @notice Timestamp up to which `token`'s stream has value left to accrue.
    function lastTimeRewardApplicable(address token) external view returns (uint256) {
        return _lastTimeRewardApplicable(rewardData[token].periodFinish);
    }

    function _lastTimeRewardApplicable(uint256 periodFinish) internal view returns (uint256) {
        return block.timestamp < periodFinish ? block.timestamp : periodFinish;
    }

    function _rewardPerToken(address token) internal view returns (uint256) {
        RewardData storage d = rewardData[token];
        uint256 supply = totalStaked;
        if (supply == 0) return d.rewardPerTokenStored;

        uint256 applicable = _lastTimeRewardApplicable(d.periodFinish);
        if (applicable <= d.lastUpdateTime) return d.rewardPerTokenStored;

        // rewardPerToken carries 1e18 of scale while rewardRate carries 1e36, so
        // dividing by 1e18 after the elapsed-seconds multiply lands the result in
        // rewardPerToken's units.
        return d.rewardPerTokenStored
            + ((applicable - d.lastUpdateTime) * d.rewardRate) / (supply * 1e18);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}