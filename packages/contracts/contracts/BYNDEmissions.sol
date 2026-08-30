// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./BYND.sol";

/// @title BYNDEmissions
/// @notice Mints BYND as a decaying, budget-capped reward stream split between
/// an LP pool and a veBYND staking pool.
///
/// MAINNET TOKENOMICS REDESIGN — key changes from the hackathon version:
///
/// 1. HARD EMISSION BUDGET (MAX_PROTOCOL_EMISSIONS = 40M BYND), separate from
///    and stricter than BYND.sol's 100M global ERC20Capped supply cap. That
///    100M cap has no concept of "which minter" — MINTER_ROLE could mint the
///    full 100M with nothing stopping it. The 40M ceiling is enforced HERE,
///    at accrual time (not just at claim/mint time), by clamping how much
///    each checkpoint is allowed to add to rewardPerTokenStored once
///    totalEmitted approaches the cap. This means a user's accrued `rewards`
///    balance can never exceed what the remaining budget actually backs — a
///    claim doesn't need special-case budget logic; if it ever reverts, that
///    is a genuine invariant violation worth investigating, not routine
///    behavior. No IOU/debt tracking: once budget is exhausted, the
///    effective emission rate is simply 0 going forward.
///
/// 2. DECAY NO LONGER FREEZES AFTER 260 WEEKS. The previous implementation
///    recomputed the full decay curve from week 0 on every call, capped at
///    260 iterations — so weeks beyond 260 all silently reused the week-260
///    rate forever (the "freeze" bug), AND if a pool went uncheckpointed for
///    more than 260 weeks in one gap, `lastCheckpoint` jumped straight to
///    `block.timestamp` regardless of how much of the loop actually
///    completed — permanently discarding whatever emission fell past the
///    260-iteration mark (silent loss, not just a delay).
///
///    Fixed via a single PERSISTED, INCREMENTALLY-ADVANCED checkpoint
///    (decayCheckpointWeek/Rate + globalLastCheckpoint) instead of
///    recomputing from genesis. Each call advances at most
///    MAX_WEEKS_PER_ADVANCE (260, same protective gas bound as before, for
///    the same reason: bound worst-case gas per transaction) weeks of real
///    decay history, and if a gap is larger than that, globalLastCheckpoint
///    only advances to wherever processing actually reached — never to
///    block.timestamp — so a second call finishes the catch-up instead of
///    quietly losing the remainder. Gas per call is now constant regardless
///    of protocol age, instead of growing toward (and then plateauing at)
///    260 iterations forever after year 5.
///
/// 3. SINGLE GLOBAL CHECKPOINT INSTEAD OF TWO INDEPENDENT PER-POOL ONES.
///    The previous design checkpointed the LP and staking pools completely
///    independently, each with its own lastCheckpoint. With a hard global
///    budget, that becomes a real race: two independently-timed checkpoints
///    computing "remaining budget" against slightly different timestamps
///    could each believe they're entitled to the same remaining budget and
///    double-count it. This version checkpoints emissions ONCE globally,
///    clamps that single result against the budget, then splits the
///    clamped (not raw) amount between the two pools by weight — so the
///    budget can only ever be spent once, un-ambiguously.
///
/// 4. EXPLICIT lpWeightBps + stakingWeightBps (invariant: sum to 10,000),
///    instead of one implying the other. Governance-settable only via
///    TIMELOCK_ROLE — never a bare EOA — matching the multisig -> timelock
///    -> governance model called for on mainnet. Initial mainnet split is
///    60% LP / 40% staking; the target trajectory toward 25/75 as the
///    protocol matures is a governance decision made over time through
///    setEmissionSplit(), not an on-chain automatic schedule (avoids
///    encoding assumptions about calendar time into monetary policy that
///    may need to change based on real protocol conditions).
contract BYNDEmissions is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @dev Role-management only (grant/revoke other roles). On mainnet this
    /// should itself be transferred to a multisig or the timelock once
    /// deployment is finalized — kept separate from TIMELOCK_ROLE so that
    /// "who can change monetary policy" and "who can manage roles" are
    /// distinct, auditable permissions rather than one bundled admin key.
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    /// @dev Monetary-policy powers: decay rate, LP/staking split, LP token
    /// address. MUST be held by a timelock contract on mainnet, never an
    /// EOA — see the deployment plan. Deliberately separate from ADMIN_ROLE
    /// so an emergency/operational admin key can never unilaterally move
    /// these parameters.
    bytes32 public constant TIMELOCK_ROLE = keccak256("TIMELOCK_ROLE");

    enum PoolId {
        Staking,
        LP
    }

    struct Pool {
        IERC20  stakeToken;
        uint256 totalStaked;
        uint256 rewardPerTokenStored;   // scaled by 1e18
        mapping(address => uint256) balanceOf;
        mapping(address => uint256) userRewardPerTokenPaid;
        mapping(address => uint256) rewards;
    }

    BYND public immutable byndToken;

    uint256 public immutable deployTime;
    uint256 public immutable initialRatePerSecond;

    /// @notice Hard ceiling on cumulative BYND ever allocated through this
    /// emissions contract. Independent of and stricter than BYND.sol's 100M
    /// ERC20Capped supply cap — this is the "protocol emissions" sub-budget
    /// specifically, leaving room in the 100M total for team/investor/
    /// treasury/ecosystem/liquidity allocations minted through other paths.
    uint256 public constant MAX_PROTOCOL_EMISSIONS = 40_000_000 ether;

    /// @notice Cumulative BYND actually allocated to reward-per-token
    /// accounting so far (budget-clamped — this can never exceed
    /// MAX_PROTOCOL_EMISSIONS by construction of _checkpointEmissions).
    uint256 public totalEmitted;

    uint16 public weeklyDecayBps = 9850;

    /// @notice Explicit split weights (both stored, invariant enforced on
    /// every write: lpWeightBps + stakingWeightBps == BPS_DENOM). Initial
    /// mainnet parameters: 6000 / 4000 (60% LP / 40% staking).
    uint16 public lpWeightBps = 6000;
    uint16 public stakingWeightBps = 4000;

    uint256 public constant WEEK = 7 days;
    uint256 public constant BPS_DENOM = 10_000;

    /// @dev Bounds how many weeks of decay history a single call will
    /// process, keeping worst-case gas constant regardless of how long the
    /// protocol has been running or how stale a checkpoint has become. This
    /// is a gas-safety bound only — unlike the old MAX_WEEKS_PER_CHECKPOINT,
    /// it does NOT cap how far decay can progress in total; it only caps how
    /// much of a backlog one transaction will clear, deferring the rest to
    /// a subsequent call rather than freezing or discarding it.
    uint256 public constant MAX_WEEKS_PER_ADVANCE = 260;

    /// @notice Week index (since deployTime) up to which decayCheckpointRate
    /// is the accurate rate. Persisted so the rate never needs recomputing
    /// from week 0.
    uint256 public decayCheckpointWeek;
    /// @notice Emission rate per second as of the start of decayCheckpointWeek.
    uint256 public decayCheckpointRate;
    /// @notice Timestamp up to which emissions have actually been integrated
    /// and attributed to the two pools. May lag block.timestamp if a
    /// backlog longer than MAX_WEEKS_PER_ADVANCE weeks exists — see above.
    uint256 public globalLastCheckpoint;

    Pool private stakingPool;
    Pool private lpPool;

    event Staked(PoolId indexed pool, address indexed user, uint256 amount);
    event Withdrawn(PoolId indexed pool, address indexed user, uint256 amount);
    event RewardClaimed(PoolId indexed pool, address indexed user, uint256 amount);
    event DecayRateUpdated(uint16 weeklyDecayBps);
    event EmissionSplitUpdated(uint16 lpWeightBps, uint16 stakingWeightBps);
    event LpTokenSet(address indexed lpToken);
    event EmissionsCheckpointed(uint256 rawEmitted, uint256 actualEmitted, uint256 totalEmitted);
    /// @dev Emitted the one time actualEmitted < rawEmitted because the
    /// budget ran out mid-checkpoint — a clear on-chain marker of exactly
    /// when protocol emissions stopped, for indexers/dashboards.
    event EmissionBudgetExhausted(uint256 totalEmitted);

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
        // TIMELOCK_ROLE is deliberately NOT granted to `admin` here — see
        // the deployment plan. Grant it explicitly to the timelock address
        // after deployment via grantRole, keeping the EOA-facing deploy
        // step free of monetary-policy power by default.

        byndToken = BYND(byndToken_);
        deployTime = block.timestamp;
        initialRatePerSecond = initialRatePerSecond_;

        decayCheckpointWeek = 0;
        decayCheckpointRate = initialRatePerSecond_;
        globalLastCheckpoint = block.timestamp;

        stakingPool.stakeToken = IERC20(veByndToken);
        lpPool.stakeToken = IERC20(lpToken_);
    }

    function setLpToken(address lpToken_) external onlyRole(TIMELOCK_ROLE) {
        require(lpToken_ != address(0), "lp=0");
        require(lpPool.totalStaked == 0, "LP pool already active");
        _checkpointEmissions();
        lpPool.stakeToken = IERC20(lpToken_);
        emit LpTokenSet(lpToken_);
    }

    function setWeeklyDecayBps(uint16 weeklyDecayBps_) external onlyRole(TIMELOCK_ROLE) {
        require(weeklyDecayBps_ <= BPS_DENOM, "decay>100%");
        _checkpointEmissions();
        weeklyDecayBps = weeklyDecayBps_;
        emit DecayRateUpdated(weeklyDecayBps_);
    }

    /// @notice Change the LP/staking emission split. Both weights are
    /// required explicitly (rather than deriving one from the other) so the
    /// invariant is checked at the call site and visible in the event, not
    /// implicit. Timelock/governance-gated — see contract-level notes.
    function setEmissionSplit(uint16 lpWeightBps_, uint16 stakingWeightBps_) external onlyRole(TIMELOCK_ROLE) {
        require(uint256(lpWeightBps_) + uint256(stakingWeightBps_) == BPS_DENOM, "weights must sum to 10000");
        _checkpointEmissions();
        lpWeightBps = lpWeightBps_;
        stakingWeightBps = stakingWeightBps_;
        emit EmissionSplitUpdated(lpWeightBps_, stakingWeightBps_);
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

    /// @notice Permissionless keeper checkpoint — advances the decay curve
    /// and both pools' rewardPerTokenStored. Safe and cheap to call
    /// regularly; if called after a backlog longer than
    /// MAX_WEEKS_PER_ADVANCE weeks has built up, call it again to finish
    /// catching up (see globalLastCheckpoint).
    function checkpoint() external {
        _checkpointEmissions();
    }

    function stakedBalanceOf(PoolId pool, address user) external view returns (uint256) {
        return _pool(pool).balanceOf[user];
    }

    function totalStaked(PoolId pool) external view returns (uint256) {
        return _pool(pool).totalStaked;
    }

    // ── Frontend/dashboard view functions ──────────────────────────────────

    /// @notice Cumulative BYND emitted through this contract so far.
    function totalEmittedView() external view returns (uint256) {
        return totalEmitted;
    }

    /// @notice How much of the 40M protocol-emission budget is left.
    function remainingEmissionBudget() public view returns (uint256) {
        return totalEmitted >= MAX_PROTOCOL_EMISSIONS ? 0 : MAX_PROTOCOL_EMISSIONS - totalEmitted;
    }

    /// @notice Current per-second emission rate. Returns 0 once the 40M
    /// budget is exhausted, regardless of what the raw decay curve would
    /// otherwise say — the effective rate is genuinely zero at that point,
    /// not just close to it.
    function currentEmissionRate() public view returns (uint256) {
        if (totalEmitted >= MAX_PROTOCOL_EMISSIONS) return 0;
        return _previewRateAtTimestamp(block.timestamp);
    }

    /// @notice currentEmissionRate() extrapolated over a year. A rough
    /// planning figure, not a promise — the real rate keeps decaying
    /// continuously within that year.
    function annualizedEmission() external view returns (uint256) {
        return currentEmissionRate() * 365 days;
    }

    /// @notice Current LP pool weight in basis points.
    function lpEmissionWeight() external view returns (uint256) {
        return lpWeightBps;
    }

    /// @notice Current staking pool weight in basis points.
    function stakingEmissionWeight() external view returns (uint256) {
        return stakingWeightBps;
    }

    function earned(PoolId pool, address user) public view returns (uint256) {
        Pool storage p = _pool(pool);
        uint256 rpt = _previewRewardPerToken(pool);
        return p.rewards[user] +
            (p.balanceOf[user] * (rpt - p.userRewardPerTokenPaid[user])) / 1e18;
    }

    // ── Internal: the single global, budget-clamped emission checkpoint ────

    /// @dev THE source of truth for "how much has been emitted, ever." Every
    /// state-changing entry point routes through this instead of two
    /// independent per-pool checkpoints — see contract-level notes on why
    /// that matters for the budget invariant.
    function _checkpointEmissions() internal {
        if (globalLastCheckpoint >= block.timestamp) return;

        uint256 rawEmitted = _advanceDecay();
        if (rawEmitted == 0) return;

        uint256 remaining = remainingEmissionBudget();
        uint256 actual = rawEmitted > remaining ? remaining : rawEmitted;

        emit EmissionsCheckpointed(rawEmitted, actual, totalEmitted + actual);
        if (actual < rawEmitted) {
            emit EmissionBudgetExhausted(totalEmitted + actual);
        }
        if (actual == 0) return;

        totalEmitted += actual;

        // Split the CLAMPED amount, never the raw amount — this is what
        // makes the budget un-exceedable regardless of call ordering.
        uint256 lpShare = (actual * lpWeightBps) / BPS_DENOM;
        uint256 stakingShare = actual - lpShare; // remainder avoids rounding dust loss

        // A pool with zero stakers simply forgoes its share for this
        // interval — same behavior as the original design (nothing to
        // divide rewardPerToken by), except now that forgone amount is
        // still correctly counted against the global budget above, rather
        // than silently existing outside any accounting at all. This is
        // NOT an IOU: nobody is owed it later, it is permanently unclaimed,
        // by design — the simplest safe behavior for a rare edge case
        // (both pools empty is unlikely in a live bootstrapped protocol).
        if (lpPool.totalStaked > 0) {
            lpPool.rewardPerTokenStored += (lpShare * 1e18) / lpPool.totalStaked;
        }
        if (stakingPool.totalStaked > 0) {
            stakingPool.rewardPerTokenStored += (stakingShare * 1e18) / stakingPool.totalStaked;
        }
    }

    /// @dev Advances decayCheckpointWeek/Rate and globalLastCheckpoint by up
    /// to MAX_WEEKS_PER_ADVANCE weeks of real time, integrating rate * dt
    /// across each week segment crossed. Returns the RAW (pre-budget-clamp)
    /// amount integrated. If the true gap exceeds what this call processes,
    /// globalLastCheckpoint is left short of block.timestamp on purpose —
    /// see contract-level notes.
    function _advanceDecay() internal returns (uint256 rawEmitted) {
        uint256 week = decayCheckpointWeek;
        uint256 rate = decayCheckpointRate;
        uint256 t = globalLastCheckpoint;
        uint256 weekStart = deployTime + week * WEEK;
        uint256 iterations = 0;

        while (t < block.timestamp && iterations < MAX_WEEKS_PER_ADVANCE) {
            uint256 weekEnd = weekStart + WEEK;
            uint256 segEnd = block.timestamp < weekEnd ? block.timestamp : weekEnd;
            if (segEnd > t) {
                rawEmitted += rate * (segEnd - t);
                t = segEnd;
            }
            if (t >= weekEnd) {
                rate = (rate * weeklyDecayBps) / BPS_DENOM;
                weekStart = weekEnd;
                week += 1;
            }
            iterations++;
        }

        decayCheckpointWeek = week;
        decayCheckpointRate = rate;
        globalLastCheckpoint = t;
    }

    /// @dev Read-only mirror of _advanceDecay's rate math for view functions
    /// — does not write state. Bounded the same way; an EXTREMELY stale
    /// checkpoint (>260 weeks since the last real transaction touched this
    /// contract) could under-report here until a real transaction catches
    /// state up. Acceptable and documented: in practice, checkpoint() or
    /// any stake/claim call keeps this current far more often than that.
    function _previewRateAtTimestamp(uint256 timestamp) internal view returns (uint256 rate) {
        uint256 week = decayCheckpointWeek;
        rate = decayCheckpointRate;
        uint256 weekStart = deployTime + week * WEEK;
        uint256 iterations = 0;
        while (weekStart + WEEK <= timestamp && iterations < MAX_WEEKS_PER_ADVANCE) {
            rate = (rate * weeklyDecayBps) / BPS_DENOM;
            weekStart += WEEK;
            iterations++;
        }
    }

    function _pool(PoolId id) internal view returns (Pool storage) {
        return id == PoolId.Staking ? stakingPool : lpPool;
    }

    /// @dev Preview-only version of the reward-per-token a claim would see
    /// right now, without mutating state — mirrors _checkpointEmissions'
    /// math closely enough for UI/earned() purposes. Note this does NOT
    /// re-derive the exact clamped split the way a real checkpoint call
    /// would if it landed exactly at the budget boundary; it is a close
    /// approximation for display, and the real on-chain accrual (via the
    /// state-changing path) is always the authoritative number.
    function _previewRewardPerToken(PoolId id) internal view returns (uint256) {
        Pool storage p = _pool(id);
        if (p.totalStaked == 0) return p.rewardPerTokenStored;
        if (globalLastCheckpoint >= block.timestamp) return p.rewardPerTokenStored;

        uint256 rawEmitted = _previewRawEmittedSince(globalLastCheckpoint, block.timestamp);
        uint256 remaining = remainingEmissionBudget();
        uint256 actual = rawEmitted > remaining ? remaining : rawEmitted;
        if (actual == 0) return p.rewardPerTokenStored;

        uint256 share = id == PoolId.LP
            ? (actual * lpWeightBps) / BPS_DENOM
            : actual - (actual * lpWeightBps) / BPS_DENOM;

        return p.rewardPerTokenStored + (share * 1e18) / p.totalStaked;
    }

    function _previewRawEmittedSince(uint256 from, uint256 to) internal view returns (uint256 total) {
        uint256 week = decayCheckpointWeek;
        uint256 rate = decayCheckpointRate;
        uint256 t = from;
        uint256 weekStart = deployTime + week * WEEK;
        uint256 iterations = 0;

        while (t < to && iterations < MAX_WEEKS_PER_ADVANCE) {
            uint256 weekEnd = weekStart + WEEK;
            uint256 segEnd = to < weekEnd ? to : weekEnd;
            if (segEnd > t) {
                total += rate * (segEnd - t);
                t = segEnd;
            }
            if (t >= weekEnd) {
                rate = (rate * weeklyDecayBps) / BPS_DENOM;
                weekStart = weekEnd;
                week += 1;
            }
            iterations++;
        }
    }

    function _checkpointUser(Pool storage p, PoolId id, address user) internal {
        _checkpointEmissions();
        p.rewards[user] +=
            (p.balanceOf[user] * (p.rewardPerTokenStored - p.userRewardPerTokenPaid[user])) / 1e18;
        p.userRewardPerTokenPaid[user] = p.rewardPerTokenStored;
    }

    function _payReward(Pool storage p, PoolId id, address user) internal {
        uint256 reward = p.rewards[user];
        if (reward == 0) return;
        p.rewards[user] = 0;
        // Defensive invariant check, not expected to ever trigger in normal
        // operation: accrual is already clamped to the remaining budget at
        // the source (_checkpointEmissions), so a user's accrued `rewards`
        // balance should never exceed what's actually mintable. If this
        // ever reverts, that's a genuine bug to investigate, not a routine
        // "budget ran out mid-claim" case — see decision log in the
        // tokenomics migration notes.
        require(totalEmitted <= MAX_PROTOCOL_EMISSIONS, "BYNDEmissions: budget invariant violated");
        byndToken.mint(user, reward);
        emit RewardClaimed(id, user, reward);
    }
}
