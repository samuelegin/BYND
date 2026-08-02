// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./BYND.sol";

/// @title BYNDEmissions
contract BYNDEmissions is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    enum PoolId {
        Staking, 
        LP 
    }

    struct Pool {
        IERC20  stakeToken;
        uint256 totalStaked;
        uint256 rewardPerTokenStored;   // scaled by 1e18
        uint256 lastCheckpoint; 
        mapping(address => uint256) balanceOf;
        mapping(address => uint256) userRewardPerTokenPaid;
        mapping(address => uint256) rewards;
    }

    BYND public immutable byndToken;

    uint256 public immutable deployTime;
    uint256 public immutable initialRatePerSecond;

    uint16 public weeklyDecayBps = 9850;
    uint16 public lpPoolWeightBps = 7000;

    uint256 public constant WEEK = 7 days;
    uint256 public constant BPS_DENOM = 10_000;
    uint256 public constant MAX_WEEKS_PER_CHECKPOINT = 260; 

    Pool private stakingPool;
    Pool private lpPool;

    event Staked(PoolId indexed pool, address indexed user, uint256 amount);
    event Withdrawn(PoolId indexed pool, address indexed user, uint256 amount);
    event RewardClaimed(PoolId indexed pool, address indexed user, uint256 amount);
    event ParamsUpdated(uint16 weeklyDecayBps, uint16 lpPoolWeightBps);
    event LpTokenSet(address indexed lpToken);

    constructor(
        address admin,
        address byndToken_,
        address veByndToken,
        address lpToken_,
        uint256 initialRatePerSecond_
    ) {
        require(admin != address(0), "admin=0");
        require(byndToken_ != address(0), "bynd=0");
        require(veByndToken != address(0), "veBYND=0");

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);

        byndToken = BYND(byndToken_);
        deployTime = block.timestamp;
        initialRatePerSecond = initialRatePerSecond_;

        stakingPool.stakeToken = IERC20(veByndToken);
        stakingPool.lastCheckpoint = block.timestamp;

        lpPool.stakeToken = IERC20(lpToken_);
        lpPool.lastCheckpoint = block.timestamp;
    }

    function setLpToken(address lpToken_) external onlyRole(ADMIN_ROLE) {
        require(lpToken_ != address(0), "lp=0");
        require(lpPool.totalStaked == 0, "LP pool already active");
        _checkpointPool(lpPool, PoolId.LP);
        lpPool.stakeToken = IERC20(lpToken_);
        emit LpTokenSet(lpToken_);
    }

    function setParams(uint16 weeklyDecayBps_, uint16 lpPoolWeightBps_) external onlyRole(ADMIN_ROLE) {
        require(weeklyDecayBps_ <= BPS_DENOM, "decay>100%");
        require(lpPoolWeightBps_ <= BPS_DENOM, "weight>100%");
        _checkpointPool(stakingPool, PoolId.Staking);
        _checkpointPool(lpPool, PoolId.LP);
        weeklyDecayBps = weeklyDecayBps_;
        lpPoolWeightBps = lpPoolWeightBps_;
        emit ParamsUpdated(weeklyDecayBps_, lpPoolWeightBps_);
    }

    function stakeForRewards(uint256 amount) external nonReentrant {
        require(amount > 0, "amount=0");
        _checkpointUser(stakingPool, PoolId.Staking, msg.sender);
        stakingPool.totalStaked += amount;
        stakingPool.balanceOf[msg.sender] += amount;
        stakingPool.stakeToken.safeTransferFrom(msg.sender, address(this), amount);
        emit Staked(PoolId.Staking, msg.sender, amount);
    }

    function withdrawStaked(uint256 amount) external nonReentrant {
        require(amount > 0, "amount=0");
        require(stakingPool.balanceOf[msg.sender] >= amount, "insufficient balance");
        _checkpointUser(stakingPool, PoolId.Staking, msg.sender);
        stakingPool.totalStaked -= amount;
        stakingPool.balanceOf[msg.sender] -= amount;
        stakingPool.stakeToken.safeTransfer(msg.sender, amount);
        emit Withdrawn(PoolId.Staking, msg.sender, amount);
    }

    function claimStakingReward() external nonReentrant {
        _checkpointUser(stakingPool, PoolId.Staking, msg.sender);
        _payReward(stakingPool, PoolId.Staking, msg.sender);
    }

    function stakeLp(uint256 amount) external nonReentrant {
        require(address(lpPool.stakeToken) != address(0), "LP token not set");
        require(amount > 0, "amount=0");
        _checkpointUser(lpPool, PoolId.LP, msg.sender);
        lpPool.totalStaked += amount;
        lpPool.balanceOf[msg.sender] += amount;
        lpPool.stakeToken.safeTransferFrom(msg.sender, address(this), amount);
        emit Staked(PoolId.LP, msg.sender, amount);
    }

    function withdrawLp(uint256 amount) external nonReentrant {
        require(amount > 0, "amount=0");
        require(lpPool.balanceOf[msg.sender] >= amount, "insufficient balance");
        _checkpointUser(lpPool, PoolId.LP, msg.sender);
        lpPool.totalStaked -= amount;
        lpPool.balanceOf[msg.sender] -= amount;
        lpPool.stakeToken.safeTransfer(msg.sender, amount);
        emit Withdrawn(PoolId.LP, msg.sender, amount);
    }

    function claimLpReward() external nonReentrant {
        _checkpointUser(lpPool, PoolId.LP, msg.sender);
        _payReward(lpPool, PoolId.LP, msg.sender);
    }

    /// @notice Claim from both pools in a single call.
    function claimAll() external nonReentrant {
        _checkpointUser(stakingPool, PoolId.Staking, msg.sender);
        _payReward(stakingPool, PoolId.Staking, msg.sender);
        _checkpointUser(lpPool, PoolId.LP, msg.sender);
        _payReward(lpPool, PoolId.LP, msg.sender);
    }

    function checkpoint() external {
        _checkpointPool(stakingPool, PoolId.Staking);
        _checkpointPool(lpPool, PoolId.LP);
    }

    function stakedBalanceOf(PoolId pool, address user) external view returns (uint256) {
        return _pool(pool).balanceOf[user];
    }

    function totalStaked(PoolId pool) external view returns (uint256) {
        return _pool(pool).totalStaked;
    }

    function currentEmissionRate() public view returns (uint256) {
        uint256 weekIndex = (block.timestamp - deployTime) / WEEK;
        return _rateAtWeek(weekIndex);
    }

    function earned(PoolId pool, address user) public view returns (uint256) {
        Pool storage p = _pool(pool);
        uint256 rpt = _previewRewardPerToken(p, pool);
        return p.rewards[user] +
            (p.balanceOf[user] * (rpt - p.userRewardPerTokenPaid[user])) / 1e18;
    }

    function _rateAtWeek(uint256 weekIndex) internal view returns (uint256) {
        uint256 iterations = weekIndex > MAX_WEEKS_PER_CHECKPOINT ? MAX_WEEKS_PER_CHECKPOINT : weekIndex;
        uint256 rate = initialRatePerSecond;
        for (uint256 i = 0; i < iterations; i++) {
            rate = (rate * weeklyDecayBps) / BPS_DENOM;
        }
        return rate;
    }

    function _emittedBetween(uint256 from, uint256 to) internal view returns (uint256 total) {
        if (to <= from) return 0;
        uint256 startWeek = (from - deployTime) / WEEK;
        uint256 weekStart = deployTime + startWeek * WEEK;
        uint256 rate = _rateAtWeek(startWeek);
        uint256 iterations = 0;

        while (weekStart < to && iterations < MAX_WEEKS_PER_CHECKPOINT) {
            uint256 weekEnd = weekStart + WEEK;
            uint256 segStart = from > weekStart ? from : weekStart;
            uint256 segEnd = to < weekEnd ? to : weekEnd;
            if (segEnd > segStart) {
                total += rate * (segEnd - segStart);
            }
            rate = (rate * weeklyDecayBps) / BPS_DENOM;
            weekStart = weekEnd;
            iterations++;
        }
    }

    function _pool(PoolId id) internal view returns (Pool storage) {
        return id == PoolId.Staking ? stakingPool : lpPool;
    }

    function _poolShareBps(PoolId id) internal view returns (uint256) {
        return id == PoolId.LP ? lpPoolWeightBps : (BPS_DENOM - lpPoolWeightBps);
    }

    function _previewRewardPerToken(Pool storage p, PoolId id) internal view returns (uint256) {
        if (p.totalStaked == 0) return p.rewardPerTokenStored;
        uint256 combined = _emittedBetween(p.lastCheckpoint, block.timestamp);
        uint256 poolShare = (combined * _poolShareBps(id)) / BPS_DENOM;
        return p.rewardPerTokenStored + (poolShare * 1e18) / p.totalStaked;
    }

    function _checkpointPool(Pool storage p, PoolId id) internal {
        if (block.timestamp <= p.lastCheckpoint) return;
        if (p.totalStaked > 0) {
            uint256 combined = _emittedBetween(p.lastCheckpoint, block.timestamp);
            uint256 poolShare = (combined * _poolShareBps(id)) / BPS_DENOM;
            p.rewardPerTokenStored += (poolShare * 1e18) / p.totalStaked;
        }
        p.lastCheckpoint = block.timestamp;
    }

    function _checkpointUser(Pool storage p, PoolId id, address user) internal {
        _checkpointPool(p, id);
        p.rewards[user] +=
            (p.balanceOf[user] * (p.rewardPerTokenStored - p.userRewardPerTokenPaid[user])) / 1e18;
        p.userRewardPerTokenPaid[user] = p.rewardPerTokenStored;
    }

    function _payReward(Pool storage p, PoolId id, address user) internal {
        uint256 reward = p.rewards[user];
        if (reward == 0) return;
        p.rewards[user] = 0;
        byndToken.mint(user, reward);
        emit RewardClaimed(id, user, reward);
    }
}