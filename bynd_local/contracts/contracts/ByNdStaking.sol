// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title  ByNdStaking — Synthetix-style MUSD staking for veBYND holders
/// @notice Users stake veBYND here to earn MUSD (from gauge bribes).
// Reward accounting (Synthetix pattern):
// rewardPerTokenStored  — cumulative MUSD per staked veBYND (scaled 1e18)
// userRewardPerTokenPaid[user] — snapshot at last interaction
// Only ByNdVoter (the distributor) can call notifyRewardAmount().
contract ByNdStaking is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable stakingToken;
    IERC20 public immutable musd;        
    address public distributor; // ByNdVoter

    uint256 public musdRewardPerTokenStored;
    mapping(address => uint256) public musdUserRewardPerTokenPaid;
    mapping(address => uint256) public musdRewards;

    uint256 public totalStaked;
    mapping(address => uint256) public stakedBalance;

    event Staked(address indexed user, uint256 amount);
    event Unstaked(address indexed user, uint256 amount);
    event RewardClaimed(address indexed user, uint256 musdAmount);
    event RewardNotified(uint256 musdAmount);
    event DistributorUpdated(address indexed newDistributor);

    constructor(
        address _stakingToken, 
        address _musd,
        address _distributor   // ByNdVoter (set after voter deployed)
    ) Ownable(msg.sender) {
        stakingToken = IERC20(_stakingToken);
        musd = IERC20(_musd);
        distributor  = _distributor;
    }

    modifier updateReward(address account) {
        musdRewardPerTokenStored = _musdRewardPerToken();
        if (account != address(0)) {
            musdRewards[account] = claimableMUSD(account);
            musdUserRewardPerTokenPaid[account] = musdRewardPerTokenStored;
        }
        _;
    }

    /// @notice Stake veBYND to start earning MUSD rewards.
    function stake(uint256 amount) external nonReentrant updateReward(msg.sender) {
        require(amount > 0, "ByNdStaking: amount = 0");
        totalStaked               += amount;
        stakedBalance[msg.sender] += amount;
        stakingToken.safeTransferFrom(msg.sender, address(this), amount);
        emit Staked(msg.sender, amount);
    }

    /// @notice Unstake veBYND. Stops reward accrual.Does NOT auto-claim pending MUSD — call claimRewards() separately.
    function unstake(uint256 amount) external nonReentrant updateReward(msg.sender) {
        require(amount > 0,                          "ByNdStaking: amount = 0");
        require(stakedBalance[msg.sender] >= amount, "ByNdStaking: insufficient");
        totalStaked               -= amount;
        stakedBalance[msg.sender] -= amount;
        stakingToken.safeTransfer(msg.sender, amount);
        emit Unstaked(msg.sender, amount);
    }

    function claimRewards() external nonReentrant updateReward(msg.sender) {
        uint256 earnedAmount = musdRewards[msg.sender];
        if (earnedAmount > 0) {
            musdRewards[msg.sender] = 0;
            musd.safeTransfer(msg.sender, earnedAmount);
            emit RewardClaimed(msg.sender, earnedAmount);
        }
    }

    /// @param  musdAmount  MUSD to distribute to stakers.
    function notifyRewardAmount(uint256 musdAmount)
        external
        updateReward(address(0))
    {
        require(msg.sender == distributor, "ByNdStaking: not distributor");
        if (totalStaked == 0 || musdAmount == 0) return;

        musd.safeTransferFrom(msg.sender, address(this), musdAmount);
        musdRewardPerTokenStored += (musdAmount * 1e18) / totalStaked;

        emit RewardNotified(musdAmount);
    }

    function claimableMUSD(address user) public view returns (uint256) {
        return musdRewards[user] + (
            stakedBalance[user] * (_musdRewardPerToken() - musdUserRewardPerTokenPaid[user])
        ) / 1e18;
    }

    function earned(address user) external view returns (uint256) {
        return claimableMUSD(user);
    }

    function setDistributor(address _distributor) external onlyOwner {
        distributor = _distributor;
        emit DistributorUpdated(_distributor);
    }

    function _musdRewardPerToken() internal view returns (uint256) {
        return musdRewardPerTokenStored;
    }
}