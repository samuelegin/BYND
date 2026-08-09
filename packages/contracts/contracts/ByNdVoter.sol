// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "./ByNdStaking.sol";

interface IBoostVoter {
    function vote(uint256 _tokenId, address[] calldata _gaugeVote, uint256[] calldata _weights) external;
    function claimBribes(address[] calldata _bribes, address[][] calldata _tokens, uint256 _tokenId) external;
    function gauges(uint256 index) external view returns (address);
    function length() external view returns (uint256);
    function gaugeToBribe(address gauge) external view returns (address);
    function isAlive(address gauge) external view returns (bool);
    function claimable(address gauge) external view returns (uint256);
    function epochNext(uint256 _timestamp) external view returns (uint256);
    function epochStart(uint256 _timestamp) external view returns (uint256);
}

interface IReward {
    function tokenRewardsPerEpoch(address token, uint256 epochStart) external view returns (uint256);
}

/// @notice The gauge-selection scan, extracted into an external library so its
/// bytecode is deployed once and DELEGATECALLed rather than inlined into
/// ByNdVoter — which sits hard against the EIP-170 24576-byte limit.
/// @dev Stateless: everything it needs is passed in, so linking a new copy
/// changes only the ranking maths, never storage.
library GaugeScan {
    /// @param bv the BoostVoter to scan
    /// @param cap max gauges to examine, so the loop stays under the block gas
    /// limit (656 gauges live today; a full scan measures ~11.6M gas vs a 10M
    /// block limit)
    /// @param vt valued reward tokens
    /// @param vw their weights in bps of the value reference, index-aligned
    /// with `vt`
    /// @return bestGauge highest-scoring gauge, or zero if none scored
    /// @return bestScore its value-weighted bribe total
    /// @return examined how many gauges the loop actually looked at
    /// @return total how many exist on the boost voter
    /// @dev `examined` and `total` are returned rather than emitted because this
    /// function is `view` -- a view cannot log. The non-view caller compares them
    /// and emits ScanTruncated, so a partial scan is distinguishable from a
    /// complete one (BYND-11). The cap itself is deliberate and stays: 656 gauges
    /// live today and a full scan measures ~11.6M gas against a 10M block limit.
    function best(
        IBoostVoter bv,
        uint256 cap,
        address[] memory vt,
        uint256[] memory vw
    ) external view returns (address bestGauge, uint256 bestScore, uint256 examined, uint256 total) {
        total = bv.length();
        examined = total > cap ? cap : total;
        uint256 n = vt.length;
        uint256 epoch = bv.epochStart(block.timestamp);

        for (uint256 i = 0; i < examined; i++) {
            address g = bv.gauges(i);
            if (!bv.isAlive(g)) continue;

            address b = bv.gaugeToBribe(g);
            if (b == address(0) || b.code.length == 0) continue;

            uint256 score;
            for (uint256 v = 0; v < n; v++) {
                if (vw[v] == 0) continue;
                try IReward(b).tokenRewardsPerEpoch(vt[v], epoch) returns (uint256 c) {
                    score += (c * vw[v]) / 10_000;
                } catch {
                }
            }
            if (score > bestScore) { bestScore = score; bestGauge = g; }
        }
    }

    /// @notice First alive gauge, used as the fallback when nothing scored.
    function firstAlive(IBoostVoter bv) external view returns (address) {
        uint256 total = bv.length();
        for (uint256 i = 0; i < total; i++) {
            address g = bv.gauges(i);
            if (bv.isAlive(g)) return g;
        }
        return address(0);
    }
}

/// @notice The end-of-epoch settlement, extracted into an external library for
/// the same reason as GaugeScan: ByNdVoter sits hard against EIP-170 and the
/// remediation work needs the room.
/// @dev Unlike GaugeScan this library *writes* — it moves tokens and updates
/// `carriedOver`. That is safe because ByNdVoter reaches it by DELEGATECALL, so
/// the library body executes in ByNdVoter's own storage and balance context: the
/// `carriedOver` pointer resolves to ByNdVoter's slot, and `address(this)` inside
/// a transfer is ByNdVoter. No layout change, no migration.
///
/// The events below are declared here so the library can emit them, and again in
/// ByNdVoter so they appear in its ABI. Identical signatures give identical
/// topics, and DELEGATECALL logs carry ByNdVoter's address, so an off-chain
/// consumer sees exactly what it saw before this extraction.
library HarvestLib {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    uint256 private constant MAX_BPS = 10_000;

    event KeeperPaid(uint256 indexed epoch, address indexed keeper, address token, uint256 amount);
    event ProtocolFeeCollected(uint256 indexed epoch, address indexed token, uint256 amount);
    event HarvestSkippedBelowThreshold(uint256 indexed epoch, address indexed token, uint256 harvested);
    event StakerRewardDeferred(uint256 indexed epoch, address indexed token, uint256 amount);

    /// @dev Everything the settlement reads out of ByNdVoter that is not a
    /// mapping, bundled so the call site stays legible and the stack stays shallow.
    struct Params {
        uint256 epoch;
        address[] uniqueTokens;
        uint256[] balancesBefore;
        address[5] keepers;
        address treasury;
        ByNdStaking staking;
        uint256 protocolFeeBps;
        uint256 bountyBps;
        uint256 minHarvestThreshold;
    }

    /// @param carriedOver ByNdVoter's `carriedOver` mapping, by storage pointer.
    ///        Value that has NOT yet paid the protocol fee or keeper bounty:
    ///        below-threshold harvests and forceCloseEpoch banking. Taxed once,
    ///        on the epoch that finally clears it.
    /// @param carriedOverNet ByNdVoter's `carriedOverNet` mapping. Value that has
    ///        ALREADY been taxed — the deferred staker share from an epoch where
    ///        nobody was staked. It passes straight through to stakers on the next
    ///        clearing; taxing it again is the BYND-04 double-tax.
    /// @param tokenMinThreshold ByNdVoter's per-token threshold override mapping
    /// @param carriedOverTokens Persistent registry of every token with a live
    ///        carry. `epochUniqueTokens` is rebuilt from currently-configured
    ///        gauges each epoch, so dropping a gauge via setGauges used to orphan
    ///        any token unique to it — its carry was never read again and the
    ///        balance was unrecoverable (BYND-05). This set is walked regardless
    ///        of gauge configuration.
    /// @param carryIndex 1-based index into `carriedOverTokens`; 0 means absent
    function distribute(
        mapping(address => uint256) storage carriedOver,
        mapping(address => uint256) storage carriedOverNet,
        mapping(address => uint256) storage tokenMinThreshold,
        address[] storage carriedOverTokens,
        mapping(address => uint256) storage carryIndex,
        Params memory p
    ) external returns (uint256 totalBountyPaid) {
        // Walk this epoch's harvested tokens UNION every token still carrying a
        // balance. Built up front, in memory, so the registry can be mutated
        // freely below without the iteration tripping over its own swap-and-pop.
        // Built in a helper to keep this frame's stack shallow -- `distribute`
        // already carries five storage pointers and hits "stack too deep"
        // without the optimizer's IR pipeline if it holds the builder's locals
        // as well.
        uint256 uniqueCount = p.uniqueTokens.length;
        (address[] memory walk, uint256 n) = _buildWalk(carriedOverTokens, p.uniqueTokens);

        bool anyValue;

        for (uint256 i = 0; i < n; i++) {
            // Only tokens from this epoch's snapshot have a balanceBefore; a
            // carry-only token was not harvested this epoch, so its delta is 0.
            uint256 gross = carriedOver[walk[i]];
            if (i < uniqueCount) {
                gross +=
                    IERC20Upgradeable(walk[i]).balanceOf(address(this)) - p.balancesBefore[i];
            }
            if (gross + carriedOverNet[walk[i]] == 0) continue;
            anyValue = true;
            // Processed in its own frame: holding the per-token locals here as
            // well as five storage pointers overruns the 16-slot stack.
            totalBountyPaid += _processToken(
                carriedOver, carriedOverNet, tokenMinThreshold,
                carriedOverTokens, carryIndex, p, walk[i], gross
            );
        }

        require(anyValue, "ByNdVoter: nothing harvested this epoch");
    }

    /// One token's settlement: carry it if the combined balance is under the
    /// threshold, otherwise clear the books and pay it out.
    function _processToken(
        mapping(address => uint256) storage carriedOver,
        mapping(address => uint256) storage carriedOverNet,
        mapping(address => uint256) storage tokenMinThreshold,
        address[] storage carriedOverTokens,
        mapping(address => uint256) storage carryIndex,
        Params memory p,
        address token,
        uint256 gross
    ) private returns (uint256) {
        uint256 net = carriedOverNet[token];
        uint256 threshold = tokenMinThreshold[token] > 0
            ? tokenMinThreshold[token]
            : p.minHarvestThreshold;

        if (gross + net < threshold) {
            carriedOver[token] = gross;
            _register(carriedOverTokens, carryIndex, token);
            emit HarvestSkippedBelowThreshold(p.epoch, token, gross + net);
            return 0;
        }

        carriedOver[token] = 0;
        carriedOverNet[token] = 0;
        _deregister(carriedOverTokens, carryIndex, token);
        return _settle(carriedOverNet, carriedOverTokens, carryIndex, p, token, gross, net);
    }

    /// Union of `uniqueTokens` (this epoch's snapshot, order preserved so index
    /// i < uniqueTokens.length still lines up with `balancesBefore[i]`) and the
    /// persistent carry registry, deduplicated.
    function _buildWalk(
        address[] storage carriedOverTokens,
        address[] memory uniqueTokens
    ) private view returns (address[] memory walk, uint256 n) {
        uint256 uniqueCount = uniqueTokens.length;
        uint256 carryLen = carriedOverTokens.length;
        walk = new address[](uniqueCount + carryLen);
        for (uint256 i = 0; i < uniqueCount; i++) walk[n++] = uniqueTokens[i];
        for (uint256 i = 0; i < carryLen; i++) {
            address t = carriedOverTokens[i];
            bool dup;
            for (uint256 j = 0; j < uniqueCount; j++) {
                if (walk[j] == t) { dup = true; break; }
            }
            if (!dup) walk[n++] = t;
        }
    }

    /// @param gross untaxed value — pays the protocol fee and keeper bounty
    /// @param net already-taxed value — bypasses both, straight to stakers
    function _settle(
        mapping(address => uint256) storage carriedOverNet,
        address[] storage carriedOverTokens,
        mapping(address => uint256) storage carryIndex,
        Params memory p,
        address token,
        uint256 gross,
        uint256 net
    ) private returns (uint256 actualBounty) {
        uint256 protocolFee = (gross * p.protocolFeeBps) / MAX_BPS;
        if (protocolFee > 0 && p.treasury != address(0)) {
            IERC20Upgradeable(token).safeTransfer(p.treasury, protocolFee);
            emit ProtocolFeeCollected(p.epoch, token, protocolFee);
        } else {
            protocolFee = 0;
        }
        uint256 grossAfterFee = gross - protocolFee;

        uint256 sharePerKeeper = (grossAfterFee * p.bountyBps) / MAX_BPS / 5;
        actualBounty = sharePerKeeper * 5;
        // `net` was already taxed on the epoch that deferred it, so it joins the
        // staker share untouched rather than being run through the fee and
        // bounty a second time.
        uint256 stakerAmount = (grossAfterFee - actualBounty) + net;

        for (uint256 k = 0; k < 5; k++) {
            if (sharePerKeeper > 0 && p.keepers[k] != address(0)) {
                IERC20Upgradeable(token).safeTransfer(p.keepers[k], sharePerKeeper);
                emit KeeperPaid(p.epoch, p.keepers[k], token, sharePerKeeper);
            }
        }

        if (stakerAmount > 0) {
            if (p.staking.totalStaked() == 0) {
                // Nobody to pay. This amount has now paid its fee and bounty, so
                // it is banked as NET — the next clearing must not tax it again.
                carriedOverNet[token] += stakerAmount;
                _register(carriedOverTokens, carryIndex, token);
                emit StakerRewardDeferred(p.epoch, token, stakerAmount);
            } else {
                IERC20Upgradeable(token).forceApprove(address(p.staking), stakerAmount);
                p.staking.notifyRewardAmount(token, stakerAmount);
            }
        }
    }

    function _register(
        address[] storage toks,
        mapping(address => uint256) storage idx,
        address t
    ) private {
        if (idx[t] == 0) {
            toks.push(t);
            idx[t] = toks.length; // 1-based
        }
    }

    function _deregister(
        address[] storage toks,
        mapping(address => uint256) storage idx,
        address t
    ) private {
        uint256 i = idx[t];
        if (i == 0) return;
        uint256 len = toks.length;
        if (i != len) {
            address moved = toks[len - 1];
            toks[i - 1] = moved;
            idx[moved] = i;
        }
        toks.pop();
        idx[t] = 0;
    }
}

contract ByNdVoter is
    Initializable,
    ReentrancyGuardUpgradeable,
    OwnableUpgradeable,
    UUPSUpgradeable
{
    using SafeERC20Upgradeable for IERC20Upgradeable;

    ByNdStaking public staking;
    IBoostVoter public boostVoter;
    address public governance;
    address public vault;
    address public treasury;

    uint256 public bountyBps;
    uint256 public protocolFeeBps;
    uint256 public constant MAX_BPS    = 10_000;
    uint256 public minHarvestThreshold;
    uint256 public epochDuration;
    uint256 public lastVoteTimestamp;
    uint256 public currentEpoch;
    uint256 public voteWindow;

    mapping(uint256 => bool) public epochVoted;
    mapping(uint256 => bool) public epochHarvested;
    mapping(uint256 => bool) public epochLocksExtended;
    mapping(uint256 => bool) public epochRebasesClaimed;
    mapping(uint256 => address) public epochKeeperClaimRebases;
    mapping(uint256 => address) public epochKeeperExtendLocks;
    mapping(uint256 => address) public epochKeeperOptimise;
    mapping(uint256 => bool) public epochSnapshotTaken;
    mapping(uint256 => uint256) public epochClaimCursor;
    mapping(uint256 => address[]) private epochUniqueTokens;
    mapping(uint256 => mapping(address => uint256)) private epochBalanceBefore;
    uint256 public constant MAX_CLAIM_BATCH = 200;
    uint256 internal constant DEFAULT_SCAN_CAP = 300;
    /// How long past an epoch's natural end before forceCloseEpoch opens to
    /// anyone. Long enough that a functioning keeper set always closes the epoch
    /// normally first; short enough that a lost governance key is a two-week
    /// outage rather than a permanent freeze (BYND-06).
    uint256 public constant FORCE_CLOSE_DELAY = 2 weeks;

    mapping(address => uint256) public tokenMinHarvestThreshold;

    uint256[] public managedTokenIds;
    mapping(uint256 => uint256) private tokenIdIndex;

    struct Gauge {
        address gauge;
        address bribe;
        string name;
        uint256 weightBps;
        address[] tokens;
    }
    Gauge[] public gauges;

    address public bribeReferenceToken;

    mapping(address => uint256) public carriedOver;
    uint256 public extendWindow;
    uint256 public scanCap;
    mapping(address => uint256) public tokenWeights;
    address[] public valuedTokens;

    /// Value that has ALREADY paid the protocol fee and keeper bounty: the
    /// deferred staker share from an epoch where nobody was staked. Kept apart
    /// from `carriedOver` so the next clearing passes it straight to stakers
    /// instead of taxing it a second time (BYND-04).
    mapping(address => uint256) public carriedOverNet;

    /// Every token with a live carry, regardless of gauge configuration.
    /// `epochUniqueTokens` is rebuilt from the currently-configured gauges each
    /// epoch, so dropping a gauge via setGauges used to orphan any token unique
    /// to it -- its carry was never read again and the balance was unrecoverable
    /// (BYND-05). HarvestLib walks this set as well as the epoch's own.
    address[] public carriedOverTokens;

    /// 1-based index into `carriedOverTokens`; 0 means the token is absent.
    mapping(address => uint256) private carriedOverTokenIndex;

    event VotesCast(uint256 indexed epoch, uint256 tokenCount, uint256 gaugeCount);
    event GaugesOptimised(uint256 indexed epoch, address topGauge, uint256 claimableAmount);
    event Harvested(uint256 indexed epoch, address indexed harvestKeeper, uint256 totalBountyPaid);
    event KeeperPaid(uint256 indexed epoch, address indexed keeper, address token, uint256 amount);
    event GaugesUpdated(uint256 count);
    event VoteCastFailed(uint256 indexed epoch, uint256 indexed tokenId);
    event BribeClaimFailed(uint256 indexed epoch, uint256 indexed tokenId);
    event LocksExtendedMarked(uint256 indexed epoch, address keeper);
    event RebasesClaimedMarked(uint256 indexed epoch, address keeper);
    event TokenIdAdded(uint256 tokenId);
    event TokenIdRemoved(uint256 tokenId);
    event MinThresholdUpdated(uint256 newThreshold);
    event TokenMinThresholdUpdated(address indexed token, uint256 newThreshold);
    event ProtocolFeeUpdated(uint256 newFeeBps);
    event VoteWindowUpdated(uint256 newWindow);
    event BribeReferenceTokenUpdated(address indexed newToken);
    event ProtocolFeeCollected(uint256 indexed epoch, address indexed token, uint256 amount);
    event BribesClaimBatch(uint256 indexed epoch, uint256 processed, uint256 cursor, uint256 total);
    event HarvestSkippedBelowThreshold(uint256 indexed epoch, address indexed token, uint256 harvested);
    event StakerRewardDeferred(uint256 indexed epoch, address indexed token, uint256 amount);
    event ExtendWindowUpdated(uint256 newWindow);
    event ScanCapUpdated(uint256 newCap);
    event TokenWeightsUpdated(uint256 count);
    /// The gauge scan stopped at the cap without reaching the end of the list, so
    /// the chosen gauge is the best of `examined`, not of `total` (BYND-11).
    event ScanTruncated(uint256 indexed epoch, uint256 examined, uint256 total);
    /// The epoch voted through auto-select while `gauges` was empty, so its
    /// bribes are unclaimable until governance calls setGauges (BYND-06).
    event VotedWithoutConfiguredGauges(uint256 indexed epoch, address gauge);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _staking,
        address _boostVoter,
        address _treasury,
        address _bribeReferenceToken
    ) public initializer {
        __ReentrancyGuard_init();
        __Ownable_init(); 
        __UUPSUpgradeable_init();

        require(_staking != address(0), "ByNdVoter: zero staking");
        require(_boostVoter != address(0), "ByNdVoter: zero boostVoter");
        require(_treasury != address(0), "ByNdVoter: zero treasury"); staking = ByNdStaking(_staking);
        boostVoter = IBoostVoter(_boostVoter);
        governance = msg.sender;
        treasury = _treasury;
        bribeReferenceToken = _bribeReferenceToken;
        lastVoteTimestamp = block.timestamp;

        bountyBps = 100;
        protocolFeeBps = 0;
        minHarvestThreshold = 0;
        epochDuration = 7 days;
        voteWindow = 3 hours;
        extendWindow = 24 hours;
    }

    function markRebasesClaimed(address keeper) external {
        require(msg.sender == vault, "ByNdVoter: only vault");
        require(!epochRebasesClaimed[currentEpoch], "ByNdVoter: already marked");
        epochRebasesClaimed[currentEpoch] = true;
        epochKeeperClaimRebases[currentEpoch] = keeper;
        emit RebasesClaimedMarked(currentEpoch, keeper);
    }

    function markLocksExtended(address keeper) external {
        require(msg.sender == vault, "ByNdVoter: only vault");
        require(!epochLocksExtended[currentEpoch], "ByNdVoter: already extended this epoch");
        require(extendWindowOpen(), "ByNdVoter: extend window not open");
        epochLocksExtended[currentEpoch]     = true;
        epochKeeperExtendLocks[currentEpoch] = keeper;
        emit LocksExtendedMarked(currentEpoch, keeper);
    }

    function extendWindowOpen() public view returns (bool) {
        if (extendWindow == 0) return true;
        return block.timestamp >= boostVoter.epochNext(block.timestamp) - extendWindow;
    }

    function optimiseAndVote() external nonReentrant {
        require(
            block.timestamp >= boostVoter.epochNext(block.timestamp) - voteWindow,
            "ByNdVoter: vote window not open"
        );
        require(!epochVoted[currentEpoch], "ByNdVoter: already voted");
        require(managedTokenIds.length > 0, "ByNdVoter: no managed tokenIds");

        address[] memory gaugeAddrs;
        uint256[] memory weights;

        if (gauges.length > 0) {
            gaugeAddrs = new address[](gauges.length);
            weights = new uint256[](gauges.length);
            for (uint256 i = 0; i < gauges.length; i++) {
                gaugeAddrs[i] = gauges[i].gauge;
                weights[i] = gauges[i].weightBps;
            }
        } else {
            (gaugeAddrs, weights) = _selectOptimalGauges();
            require(gaugeAddrs.length > 0, "ByNdVoter: no alive gauges");
            // Voting through auto-select is allowed, but the bribes it earns
            // cannot be claimed until governance configures `gauges`: both
            // claimBribesBatch and harvestAndDistribute require a configured set,
            // because the bribe addresses and reward-token lists live there and
            // the scan does not produce them. The value is not lost -- it sits in
            // the bribe contract until a later epoch claims it -- but the epoch
            // itself cannot close normally, so it needs either setGauges or
            // forceCloseEpoch. That was previously silent (BYND-06).
            emit VotedWithoutConfiguredGauges(currentEpoch, gaugeAddrs[0]);
        }

        uint256 tokenCount = managedTokenIds.length;
        bool anySucceeded;
        for (uint256 i = 0; i < tokenCount; i++) {
            try boostVoter.vote(managedTokenIds[i], gaugeAddrs, weights) {
                anySucceeded = true;
            }
            catch {
                emit VoteCastFailed(currentEpoch, managedTokenIds[i]);
            }
        }
        require(anySucceeded, "ByNdVoter: votes not cast");

        lastVoteTimestamp = block.timestamp;
        epochVoted[currentEpoch] = true;
        epochKeeperOptimise[currentEpoch] = msg.sender;

        emit VotesCast(currentEpoch, tokenCount, gaugeAddrs.length);
    }

    /// @dev Returns the scan's coverage alongside its result so the non-view
    /// caller can emit ScanTruncated. previewOptimalGauge drops the extra two
    /// values, keeping its ABI unchanged for the dashboard.
    function _scanBest()
        internal
        view
        returns (address bestGauge, uint256 bestScore, uint256 examined, uint256 total)
    {
        uint256 n = valuedTokens.length;
        if (n == 0) return (address(0), 0, 0, boostVoter.length());

        address[] memory vt = new address[](n);
        uint256[] memory vw = new uint256[](n);
        for (uint256 v = 0; v < n; v++) {
            address t = valuedTokens[v];
            vt[v] = t;
            vw[v] = tokenWeights[t];
        }

        return GaugeScan.best(
            boostVoter,
            effectiveScanCap(),
            vt,
            vw
        );
    }

    function _selectOptimalGauges()
        internal
        returns (address[] memory gaugeAddrs, uint256[] memory weights)
    {
        (address bestGauge, uint256 bestScore, uint256 examined, uint256 total) = _scanBest();

        // A capped scan ranked only a prefix of the gauge list, so the "best"
        // gauge is the best of what was seen -- not necessarily the best that
        // exists. Previously indistinguishable from a complete scan, which meant
        // a silently-truncated ranking looked authoritative.
        if (examined < total) emit ScanTruncated(currentEpoch, examined, total);

        if (bestGauge == address(0)) {
            bestGauge = GaugeScan.firstAlive(boostVoter);
        }

        if (bestGauge == address(0)) {
            return (new address[](0), new uint256[](0));
        }

        gaugeAddrs = new address[](1);
        weights = new uint256[](1);
        gaugeAddrs[0] = bestGauge;
        weights[0] = MAX_BPS;

        emit GaugesOptimised(currentEpoch, bestGauge, bestScore);
    }

    function claimBribesBatch(uint256 limit) external nonReentrant {
        uint256 epoch = currentEpoch;
        require(epochVoted[epoch], "ByNdVoter: votes not cast");
        require(!epochHarvested[epoch], "ByNdVoter: already harvested");
        require(
            gauges.length > 0,
            "ByNdVoter: gauges not configured, call setGauges before harvesting"
        );
        require(limit > 0 && limit <= MAX_CLAIM_BATCH, "ByNdVoter: bad limit");

        _takeEpochSnapshot(epoch);

        uint256 total = managedTokenIds.length;
        uint256 cursor = epochClaimCursor[epoch];
        require(cursor < total, "ByNdVoter: nothing left to claim");

        address[] memory bribes = new address[](gauges.length);
        address[][] memory bribeTokens = new address[][](gauges.length);
        for (uint256 i = 0; i < gauges.length; i++) {
            bribes[i] = gauges[i].bribe;
            bribeTokens[i] = gauges[i].tokens;
        }

        uint256 end = cursor + limit;
        if (end > total) end = total;

        for (uint256 i = cursor; i < end; i++) {
            try boostVoter.claimBribes(bribes, bribeTokens, managedTokenIds[i]) {}
            catch { emit BribeClaimFailed(epoch, managedTokenIds[i]); }
        }

        epochClaimCursor[epoch] = end;
        emit BribesClaimBatch(epoch, end - cursor, end, total);
    }

    function claimProgress() external view returns (uint256 cursor, uint256 total, bool readyToHarvest) {
        uint256 epoch = currentEpoch;
        total = managedTokenIds.length;
        cursor = epochClaimCursor[epoch];
        readyToHarvest = epochSnapshotTaken[epoch] && cursor >= total;
    }

    function _takeEpochSnapshot(uint256 epoch) internal {
        if (epochSnapshotTaken[epoch]) return;

        uint256 gLen = gauges.length;
        address[] memory buf = new address[](gLen * 8);
        uint256 uniqueCount;

        for (uint256 i = 0; i < gLen; i++) {
            address[] memory toks = gauges[i].tokens;
            if (uniqueCount + toks.length > buf.length) {
                address[] memory bigger = new address[](uniqueCount + toks.length);
                for (uint256 b = 0; b < uniqueCount; b++) bigger[b] = buf[b];
                buf = bigger;
            }
            for (uint256 j = 0; j < toks.length; j++) {
                address t = toks[j];
                bool found;
                for (uint256 k = 0; k < uniqueCount; k++) {
                    if (buf[k] == t) { found = true; break; }
                }
                if (!found) buf[uniqueCount++] = t;
            }
        }

        address[] memory uniqueTokens = new address[](uniqueCount);
        for (uint256 i = 0; i < uniqueCount; i++) {
            uniqueTokens[i] = buf[i];
            epochBalanceBefore[epoch][buf[i]] = IERC20Upgradeable(buf[i]).balanceOf(address(this));
        }
        epochUniqueTokens[epoch] = uniqueTokens;
        epochSnapshotTaken[epoch] = true;
    }

    function harvestAndDistribute() external nonReentrant {
        uint256 epoch = currentEpoch;
        require(epochVoted[epoch], "ByNdVoter: votes not cast");
        require(!epochHarvested[epoch], "ByNdVoter: already harvested");
        require(
            gauges.length > 0,
            "ByNdVoter: gauges not configured, call setGauges before harvesting"
        );

        if (managedTokenIds.length == 0) {
            _takeEpochSnapshot(epoch);
        }
        require(epochSnapshotTaken[epoch], "ByNdVoter: call claimBribesBatch first");
        require(epochClaimCursor[epoch] >= managedTokenIds.length, "ByNdVoter: bribes not fully claimed");

        epochHarvested[epoch] = true;
        currentEpoch++;

        address[] memory uniqueTokens = epochUniqueTokens[epoch];
        uint256[] memory balancesBefore = new uint256[](uniqueTokens.length);
        for (uint256 i = 0; i < uniqueTokens.length; i++) {
            balancesBefore[i] = epochBalanceBefore[epoch][uniqueTokens[i]];
        }

        address[5] memory keepers = _resolveKeepers(epoch);

        uint256 totalBountyPaid = HarvestLib.distribute(
            carriedOver,
            carriedOverNet,
            tokenMinHarvestThreshold,
            carriedOverTokens,
            carriedOverTokenIndex,
            HarvestLib.Params({
                epoch: epoch,
                uniqueTokens: uniqueTokens,
                balancesBefore: balancesBefore,
                keepers: keepers,
                treasury: treasury,
                staking: staking,
                protocolFeeBps: protocolFeeBps,
                bountyBps: bountyBps,
                minHarvestThreshold: minHarvestThreshold
            })
        );

        emit Harvested(epoch, msg.sender, totalBountyPaid);
    }

    function _resolveKeepers(uint256 epoch) internal view returns (address[5] memory keepers) {
        keepers[0] = epochKeeperClaimRebases[epoch] != address(0) ? epochKeeperClaimRebases[epoch] : treasury;
        keepers[1] = epochKeeperExtendLocks[epoch] != address(0) ? epochKeeperExtendLocks[epoch]  : treasury;
        keepers[2] = epochKeeperOptimise[epoch] != address(0) ? epochKeeperOptimise[epoch]     : treasury;
        keepers[3] = msg.sender;
        keepers[4] = treasury;
    }

    /// Banks the epoch's harvestable balance into `carriedOver` and advances the
    /// clock, without paying a fee or bounty. The escape hatch for an epoch that
    /// cannot complete a normal harvest.
    ///
    /// Governance may call it at any time. Anyone may call it once the epoch is
    /// more than FORCE_CLOSE_DELAY past its natural end, because every state that
    /// needs this hatch is otherwise a permanent freeze if the governance key is
    /// lost: an epoch voted through auto-select with `gauges` never configured
    /// (claim and harvest both refuse), or one where nothing was harvested
    /// (`harvestAndDistribute` reverts on "nothing harvested this epoch"). Value
    /// only moves into `carriedOver`, where the next clearing taxes it normally,
    /// so a late close costs a delay and nothing else (BYND-06).
    ///
    /// The permissionless path additionally requires the epoch to have been voted.
    /// That is what stops it being called in a loop: the epoch it opens has
    /// `epochVoted == false`, so the next permissionless close has to wait for a
    /// real vote. Without it, a caller past the deadline could burn through epoch
    /// numbers indefinitely, since `lastVoteTimestamp` does not move here.
    function forceCloseEpoch() external {
        uint256 epoch = currentEpoch;
        require(!epochHarvested[epoch], "ByNdVoter: already harvested");

        if (msg.sender != governance) {
            require(epochVoted[epoch], "ByNdVoter: votes not cast");
            require(
                block.timestamp > boostVoter.epochNext(lastVoteTimestamp) + FORCE_CLOSE_DELAY,
                "ByNdVoter: force close not yet open"
            );
        }

        address[] memory toks = epochUniqueTokens[epoch];
        for (uint256 i = 0; i < toks.length; i++) {
            uint256 delta = IERC20Upgradeable(toks[i]).balanceOf(address(this))
                - epochBalanceBefore[epoch][toks[i]];
            if (delta > 0) {
                carriedOver[toks[i]] += delta;
                if (carriedOverTokenIndex[toks[i]] == 0) {
                    carriedOverTokens.push(toks[i]);
                    carriedOverTokenIndex[toks[i]] = carriedOverTokens.length;
                }
            }
        }

        epochHarvested[epoch] = true;
        currentEpoch++;
        emit Harvested(epoch, msg.sender, 0);
    }

    function addManagedTokenId(uint256 tokenId) external {
        require(msg.sender == vault || msg.sender == governance, "ByNdVoter: not vault");
        if (tokenIdIndex[tokenId] != 0) {
            return;
        }
        managedTokenIds.push(tokenId);
        tokenIdIndex[tokenId] = managedTokenIds.length;
        emit TokenIdAdded(tokenId);
    }

    function addManagedTokenIds(uint256[] calldata tokenIds) external {
        require(msg.sender == vault || msg.sender == governance, "ByNdVoter: not vault");
        for (uint256 i = 0; i < tokenIds.length; i++) {
            if (tokenIdIndex[tokenIds[i]] == 0) {
                managedTokenIds.push(tokenIds[i]);
                tokenIdIndex[tokenIds[i]] = managedTokenIds.length;
                emit TokenIdAdded(tokenIds[i]);
            }
        }
    }

    function removeManagedTokenId(uint256 tokenId) external {
        require(msg.sender == governance || msg.sender == vault, "ByNdVoter: not governance");
        uint256 idx = tokenIdIndex[tokenId];
        require(idx > 0, "ByNdVoter: not managed");
        uint256 lastTokenId = managedTokenIds[managedTokenIds.length - 1];
        managedTokenIds[idx - 1] = lastTokenId;
        tokenIdIndex[lastTokenId] = idx;
        managedTokenIds.pop();
        delete tokenIdIndex[tokenId];
        emit TokenIdRemoved(tokenId);
    }

    function getManagedTokenIds() external view returns (uint256[] memory) {
        return managedTokenIds;
    }

    function getManagedTokenCount() external view returns (uint256) {
        return managedTokenIds.length;
    }

    function getGaugeCount() external view returns (uint256) {
        return gauges.length;
    }

    function timeUntilNextVote() external view returns (uint256) {
        uint256 windowOpensAt = boostVoter.epochNext(block.timestamp) - voteWindow;
        if (block.timestamp >= windowOpensAt) return 0;
        return windowOpensAt - block.timestamp;
    }

    function previewOptimalGauge() external view returns (address bestGauge, uint256 bestScore) {
        (bestGauge, bestScore, , ) = _scanBest();
    }

    /// When the permissionless forceCloseEpoch path opens for the current epoch,
    /// and whether it is open now. Governance is not subject to either.
    function forceCloseStatus() external view returns (uint256 opensAt, bool open) {
        opensAt = boostVoter.epochNext(lastVoteTimestamp) + FORCE_CLOSE_DELAY;
        open = epochVoted[currentEpoch]
            && !epochHarvested[currentEpoch]
            && block.timestamp > opensAt;
    }

    function getValuedTokenCount() external view returns (uint256) {
        return valuedTokens.length;
    }

    modifier onlyGovernance() {
        require(msg.sender == governance, "ByNdVoter: not governance");
        _;
    }

    function _nz(address a) internal pure {
        require(a != address(0), "ByNdVoter: zero address");
    }

    function setGauges(
        address[] calldata _gauges,
        address[] calldata _bribes,
        string[] calldata _names,
        uint256[] calldata _weightsBps,
        address[][] calldata _tokens
    ) external onlyGovernance {
        if (_gauges.length == 0) {
            delete gauges;
            emit GaugesUpdated(0);
            return;
        }
        _validateGaugeInputs(_gauges, _weightsBps);
        delete gauges;
        _pushGauges(_gauges, _bribes, _names, _weightsBps, _tokens);
        emit GaugesUpdated(_gauges.length);
    }

    function _validateGaugeInputs(
        address[] calldata _gauges,
        uint256[] calldata _weightsBps
    ) internal pure {
        uint256 totalW;
        for (uint256 i = 0; i < _weightsBps.length; i++) totalW += _weightsBps[i];
        require(totalW == MAX_BPS, "ByNdVoter: weights must sum to 10000");
        require(_gauges.length == _weightsBps.length, "ByNdVoter: length mismatch");
    }

    function _pushGauges(
        address[] calldata _gauges,
        address[] calldata _bribes,
        string[] calldata _names,
        uint256[] calldata _weightsBps,
        address[][] calldata _tokens
    ) internal {
        for (uint256 i = 0; i < _gauges.length; i++) {
            if (_gauges[i] != address(0)) {
                require(boostVoter.isAlive(_gauges[i]), "ByNdVoter: gauge not alive");
            }
            address bribeAddr = _bribes[i] == address(0)
                ? boostVoter.gaugeToBribe(_gauges[i])
                : _bribes[i];
            gauges.push(Gauge({
                gauge: _gauges[i],
                bribe: bribeAddr,
                name: _names[i],
                weightBps: _weightsBps[i],
                tokens: _tokens[i]
            }));
        }
    }

    function setVault(address _vault) external onlyGovernance {
        _nz(_vault);
        vault = _vault;
    }

    function setBoostVoter(address _voter) external onlyGovernance {
        _nz(_voter);
        boostVoter = IBoostVoter(_voter);
    }

    function setTreasury(address _treasury) external onlyGovernance {
        _nz(_treasury);
        treasury = _treasury;
    }

    function setBribeReferenceToken(address token) external onlyGovernance {
        bribeReferenceToken = token;
        emit BribeReferenceTokenUpdated(token);
    }

    function setTokenWeights(
        address[] calldata _tokens,
        uint256[] calldata _weights
    ) external onlyGovernance {
        require(
            _tokens.length == _weights.length,
            "ByNdVoter: length mismatch"
        );
        delete valuedTokens;
        for (uint256 i = 0; i < _tokens.length; i++) {
            _nz(_tokens[i]);
            require(_weights[i] > 0, "ByNdVoter: zero weight");
            tokenWeights[_tokens[i]] = _weights[i];
            valuedTokens.push(_tokens[i]);
        }
        emit TokenWeightsUpdated(_tokens.length);
    }

    function setScanCap(uint256 cap) external onlyGovernance {
        scanCap = cap;
        emit ScanCapUpdated(cap);
    }

    function effectiveScanCap() public view returns (uint256) {
        return scanCap == 0 ? DEFAULT_SCAN_CAP : scanCap;
    }

    function setBountyBps(uint256 bps) external onlyGovernance {
        require(bps <= 500, "ByNdVoter: max 5%");
        bountyBps = bps;
    }

    function setProtocolFeeBps(uint256 bps) external onlyGovernance {
        require(bps <= 2000, "ByNdVoter: max 20%");
        protocolFeeBps = bps;
        emit ProtocolFeeUpdated(bps);
    }

    function setMinHarvestThreshold(uint256 threshold) external onlyGovernance {
        minHarvestThreshold = threshold;
        emit MinThresholdUpdated(threshold);
    }

    function setTokenMinHarvestThreshold(address token, uint256 threshold) external onlyGovernance {
        _nz(token);
        tokenMinHarvestThreshold[token] = threshold;
        emit TokenMinThresholdUpdated(token, threshold);
    }

    function setEpochDuration(uint256 duration) external onlyGovernance {
        require(duration >= 1 days, "ByNdVoter: too short");
        epochDuration = duration;
    }

    function setVoteWindow(uint256 newWindow) external onlyGovernance {
        require(newWindow <= epochDuration / 2, "ByNdVoter: window too large");
        voteWindow = newWindow;
        emit VoteWindowUpdated(newWindow);
    }

    function setExtendWindow(uint256 newWindow) external onlyGovernance {
        require(newWindow <= epochDuration / 2, "ByNdVoter: window too large");
        require(newWindow == 0 || newWindow >= voteWindow, "ByNdVoter: window below voteWindow");
        extendWindow = newWindow;
        emit ExtendWindowUpdated(newWindow);
    }

    function transferGovernance(address newGov) external onlyGovernance {
        _nz(newGov);
        governance = newGov;
    }

    function setManagedTokenId(uint256 _tokenId) external onlyGovernance {
        uint256 len = managedTokenIds.length;
        for (uint256 i = 0; i < len; i++) {
            delete tokenIdIndex[managedTokenIds[i]];
        }
        delete managedTokenIds;
        managedTokenIds.push(_tokenId);
        tokenIdIndex[_tokenId] = 1;
        emit TokenIdAdded(_tokenId);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyGovernance {}
}