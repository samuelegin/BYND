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
    /// @dev Pure calendar function on Mezo's real BoostVoter — returns the
    /// absolute timestamp the epoch containing `_timestamp` ends. No stored
    /// state, so this can never drift: epochNext(t) = epochStart(t) + 7 days.
    function epochNext(uint256 _timestamp) external view returns (uint256);
}

/// @title  ByNdVoter v2 — Voting and reward distribution engine (UUPS upgradeable)
/// @notice Permissionless keeper functions each epoch, all callable anytime
/// (no time windows) and all batched so gas cost never grows with the
/// vault's size:
///   Step 00  claimRebases()         — on ByNdVault, notifies voter
///   Step 01  markLocksExtended()    — signalled by ByNdVault.extendLocks()
///   Step 02  optimiseAndVote()      — on-chain scan + vote ALL managed tokenIds
///   Step 03  claimBribesBatch()     — page through managed tokenIds claiming bribes, repeat until claimProgress().readyToHarvest
///   Step 04  harvestAndDistribute() — finalizes the epoch, 5-way bounty split, per-token dust threshold
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

    mapping(uint256 => bool) public epochVoted;
    mapping(uint256 => bool) public epochHarvested;
    mapping(uint256 => bool) public epochLocksExtended;
    mapping(uint256 => bool) public epochRebasesClaimed;
    mapping(uint256 => address) public epochKeeperClaimRebases;
    mapping(uint256 => address) public epochKeeperExtendLocks;
    mapping(uint256 => address) public epochKeeperOptimise;

    /// @dev Per-epoch batched bribe-claim bookkeeping. claimBribesBatch()
    /// pages through managedTokenIds MAX_CLAIM_BATCH at a time instead of
    /// harvestAndDistribute() looping every managed tokenId in one call.
    mapping(uint256 => bool) public epochSnapshotTaken;
    mapping(uint256 => uint256) public epochClaimCursor;
    mapping(uint256 => address[]) private epochUniqueTokens;
    mapping(uint256 => mapping(address => uint256)) private epochBalanceBefore;
    uint256 public constant MAX_CLAIM_BATCH = 200;

    /// @dev Optional per-token override of minHarvestThreshold. A single
    /// global threshold can't sensibly apply to both e.g. WBTC and a
    /// low-decimal stablecoin, so governance can set a specific floor per
    /// token; 0 means "use the global minHarvestThreshold default".
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
    event ProtocolFeeCollected(uint256 indexed epoch, address indexed token, uint256 amount);
    event BribesClaimBatch(uint256 indexed epoch, uint256 processed, uint256 cursor, uint256 total);
    event HarvestSkippedBelowThreshold(uint256 indexed epoch, address indexed token, uint256 harvested);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _staking,
        address _boostVoter,
        address _treasury
    ) public initializer {
        __ReentrancyGuard_init();
        __Ownable_init(); 
        __UUPSUpgradeable_init();

        require(_staking != address(0), "ByNdVoter: zero staking");
        require(_boostVoter != address(0), "ByNdVoter: zero boostVoter");
        require(_treasury != address(0), "ByNdVoter: zero treasury");

        staking = ByNdStaking(_staking);
        boostVoter = IBoostVoter(_boostVoter);
        governance = msg.sender;
        treasury   = _treasury;
        lastVoteTimestamp = block.timestamp;

        bountyBps = 100;
        protocolFeeBps = 0;
        minHarvestThreshold = 0;
        epochDuration = 7 days;
    }

    function markRebasesClaimed(address keeper) external {
        require(msg.sender == vault, "ByNdVoter: only vault");
        require(!epochRebasesClaimed[currentEpoch], "ByNdVoter: already marked");
        epochRebasesClaimed[currentEpoch] = true;
        epochKeeperClaimRebases[currentEpoch] = keeper;
        emit RebasesClaimedMarked(currentEpoch, keeper);
    }

    function markLocksExtended() external {
        require(msg.sender == vault, "ByNdVoter: only vault");
        require(!epochLocksExtended[currentEpoch], "ByNdVoter: already marked");
        epochLocksExtended[currentEpoch]     = true;
        epochKeeperExtendLocks[currentEpoch] = tx.origin;
        emit LocksExtendedMarked(currentEpoch, tx.origin);
    }

    function optimiseAndVote() external nonReentrant {
        // Callable anytime — no time window. The only thing preventing a
        // double-vote is epochVoted[currentEpoch], which only clears again
        // once harvestAndDistribute() advances to the next epoch. So the
        // first keeper to call this after an epoch begins locks in the vote
        // for that epoch; there is no separate window to miss.
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
        }

        uint256 tokenCount = managedTokenIds.length;
        for (uint256 i = 0; i < tokenCount; i++) {
            try boostVoter.vote(managedTokenIds[i], gaugeAddrs, weights) {}
            catch {
                emit VoteCastFailed(currentEpoch, managedTokenIds[i]);
            }
        }

        lastVoteTimestamp = block.timestamp;
        epochVoted[currentEpoch] = true;
        epochKeeperOptimise[currentEpoch] = msg.sender;

        emit VotesCast(currentEpoch, tokenCount, gaugeAddrs.length);
    }

    function _selectOptimalGauges()
        internal
        returns (address[] memory gaugeAddrs, uint256[] memory weights)
    {
        uint256 total = boostVoter.length();
        address bestGauge;
        uint256 bestScore;

        for (uint256 i = 0; i < total; i++) {
            address g = boostVoter.gauges(i);
            if (!boostVoter.isAlive(g)) continue;
            uint256 c = boostVoter.claimable(g);
            if (c > bestScore) { bestScore = c; bestGauge = g; }
        }

        if (bestGauge == address(0)) {
            for (uint256 i = 0; i < total; i++) {
                address g = boostVoter.gauges(i);
                if (boostVoter.isAlive(g)) { bestGauge = g; break; }
            }
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

    /// @notice Step 1 of harvesting: claims bribes for a batch of managed
    /// tokenIds (up to MAX_CLAIM_BATCH per call). Call this repeatedly,
    /// paging through all managedTokenIds, before calling
    /// harvestAndDistribute() to finalize and pay out the epoch. Splitting
    /// claiming from distribution is what keeps every single call's gas cost
    /// bounded, no matter how many NFTs the vault has ever managed.
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

    /// @notice Read-only helper: how many of the current epoch's managed
    /// tokenIds still need claimBribesBatch() called on them before
    /// harvestAndDistribute() is allowed to run.
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

    /// @notice Step 2 of harvesting: finalizes the epoch and pays out. Requires
    /// claimBribesBatch() to have already processed every managed tokenId for
    /// this epoch (or, if there are none, just takes the snapshot itself).
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

        uint256 totalBountyPaid = _distribute(
            epoch, uniqueTokens, uniqueTokens.length, balancesBefore, keepers
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

    function _distribute(
        uint256 epoch,
        address[] memory uniqueTokens,
        uint256 uniqueCount,
        uint256[] memory balancesBefore,
        address[5] memory keepers
    ) internal returns (uint256 totalBountyPaid) {
        bool anyDistributed;

        for (uint256 i = 0; i < uniqueCount; i++) {
            address token = uniqueTokens[i];
            uint256 harvested = IERC20Upgradeable(token).balanceOf(address(this)) - balancesBefore[i];
            if (harvested == 0) continue;

            uint256 threshold = tokenMinHarvestThreshold[token] > 0
                ? tokenMinHarvestThreshold[token]
                : minHarvestThreshold;

            if (harvested < threshold) {
                // Leave it sitting in the contract rather than force a
                // dust distribution — it simply becomes part of next
                // epoch's "before" balance and combines with whatever
                // comes in next time, until it clears the threshold.
                emit HarvestSkippedBelowThreshold(epoch, token, harvested);
                continue;
            }

            anyDistributed = true;
            totalBountyPaid += _settleHarvestedToken(epoch, token, harvested, keepers);
        }

        require(anyDistributed, "ByNdVoter: nothing cleared the harvest threshold this epoch");
    }

    function _settleHarvestedToken(
        uint256 epoch,
        address token,
        uint256 harvested,
        address[5] memory keepers
    ) internal returns (uint256 actualBounty) {
        uint256 protocolFee = (harvested * protocolFeeBps) / MAX_BPS;
        if (protocolFee > 0 && treasury != address(0)) {
            IERC20Upgradeable(token).safeTransfer(treasury, protocolFee);
            emit ProtocolFeeCollected(epoch, token, protocolFee);
        } else {
            protocolFee = 0;
        }
        uint256 harvestedAfterFee = harvested - protocolFee;

        uint256 sharePerKeeper = (harvestedAfterFee * bountyBps) / MAX_BPS / 5;
        actualBounty = sharePerKeeper * 5;
        uint256 stakerAmount = harvestedAfterFee - actualBounty;

        for (uint256 k = 0; k < 5; k++) {
            if (sharePerKeeper > 0 && keepers[k] != address(0)) {
                IERC20Upgradeable(token).safeTransfer(keepers[k], sharePerKeeper);
                emit KeeperPaid(epoch, keepers[k], token, sharePerKeeper);
            }
        }

        if (stakerAmount > 0) {
            IERC20Upgradeable(token).forceApprove(address(staking), stakerAmount);
            staking.notifyRewardAmount(token, stakerAmount);
        }
    }

    /// @notice Emergency-only escape hatch: closes out the current epoch
    /// without requiring any token to clear its harvest threshold. Exists
    /// solely so a misconfigured (too-high) threshold can never permanently
    /// stall the protocol — once bribes for an epoch are fully claimed, there
    /// is no way to claim more for that same epoch, so if nothing clears the
    /// threshold, harvestAndDistribute() would revert forever without this.
    /// All already-claimed balances remain in the contract and simply roll
    /// into the next epoch's snapshot as before.
    function forceCloseEpoch() external onlyGovernance {
        uint256 epoch = currentEpoch;
        require(!epochHarvested[epoch], "ByNdVoter: already harvested");
        require(
            epochSnapshotTaken[epoch] && epochClaimCursor[epoch] >= managedTokenIds.length,
            "ByNdVoter: bribes not fully claimed yet"
        );
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

    function removeManagedTokenId(uint256 tokenId) external onlyGovernance {
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

    function fetchLiveGauges() external view returns (
        address[] memory gaugeAddrs,
        address[] memory bribeAddrs,
        uint256[] memory claimableAmounts
    ) {
        uint256 total = boostVoter.length();
        uint256 aliveCount;
        for (uint256 i = 0; i < total; i++) {
            if (boostVoter.isAlive(boostVoter.gauges(i))) aliveCount++;
        }
        gaugeAddrs = new address[](aliveCount);
        bribeAddrs = new address[](aliveCount);
        claimableAmounts = new uint256[](aliveCount);
        uint256 j;
        for (uint256 i = 0; i < total; i++) {
            address g = boostVoter.gauges(i);
            if (boostVoter.isAlive(g)) {
                gaugeAddrs[j] = g;
                bribeAddrs[j] = boostVoter.gaugeToBribe(g);
                claimableAmounts[j] = boostVoter.claimable(g);
                j++;
            }
        }
    }

    function previewOptimalGauge() external view returns (address bestGauge, uint256 bestClaimable) {
        uint256 total = boostVoter.length();
        for (uint256 i = 0; i < total; i++) {
            address g = boostVoter.gauges(i);
            if (!boostVoter.isAlive(g)) continue;
            uint256 c = boostVoter.claimable(g);
            if (c > bestClaimable) { bestClaimable = c; bestGauge = g; }
        }
    }

    function getEpochKeepers(uint256 epoch) external view returns (
        address claimRebasesKeeper,
        address extendLocksKeeper,
        address optimiseKeeper,
        address treasuryAddress
    ) {
        return (
            epochKeeperClaimRebases[epoch],
            epochKeeperExtendLocks[epoch],
            epochKeeperOptimise[epoch],
            treasury
        );
    }

    function isGaugeAlive(address gauge) external view returns (bool) {
        return boostVoter.isAlive(gauge);
    }

    function getBribeForGauge(address gauge) external view returns (address) {
        return boostVoter.gaugeToBribe(gauge);
    }

    modifier onlyGovernance() {
        require(msg.sender == governance, "ByNdVoter: not governance");
        _;
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
        require(_vault != address(0), "ByNdVoter: zero address");
        vault = _vault;
    }

    function setBoostVoter(address _voter) external onlyGovernance {
        require(_voter != address(0), "ByNdVoter: zero address");
        boostVoter = IBoostVoter(_voter);
    }

    function setTreasury(address _treasury) external onlyGovernance {
        require(_treasury != address(0), "ByNdVoter: zero address");
        treasury = _treasury;
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

    /// @param threshold 0 clears the override and falls back to the global
    /// minHarvestThreshold for this token.
    function setTokenMinHarvestThreshold(address token, uint256 threshold) external onlyGovernance {
        require(token != address(0), "ByNdVoter: zero address");
        tokenMinHarvestThreshold[token] = threshold;
        emit TokenMinThresholdUpdated(token, threshold);
    }

    function setEpochDuration(uint256 duration) external onlyGovernance {
        require(duration >= 1 days, "ByNdVoter: too short");
        epochDuration = duration;
    }

    function transferGovernance(address newGov) external onlyGovernance {
        require(newGov != address(0), "ByNdVoter: zero address");
        governance = newGov;
    }

    function setManagedTokenId(uint256 _tokenId) external onlyGovernance {
        delete managedTokenIds;
        managedTokenIds.push(_tokenId);
        tokenIdIndex[_tokenId] = 1;
        emit TokenIdAdded(_tokenId);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyGovernance {}
}