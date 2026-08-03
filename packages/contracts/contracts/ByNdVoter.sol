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
    function best(
        IBoostVoter bv,
        uint256 cap,
        address[] memory vt,
        uint256[] memory vw
    ) external view returns (address bestGauge, uint256 bestScore) {
        uint256 total = bv.length();
        if (total > cap) total = cap;
        uint256 n = vt.length;
        uint256 epoch = bv.epochStart(block.timestamp);

        for (uint256 i = 0; i < total; i++) {
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
        require(_treasury != address(0), "ByNdVoter: zero treasury");        staking = ByNdStaking(_staking);
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

    function markLocksExtended() external {
        require(msg.sender == vault, "ByNdVoter: only vault");
        require(!epochLocksExtended[currentEpoch], "ByNdVoter: already extended this epoch");
        require(extendWindowOpen(), "ByNdVoter: extend window not open");
        epochLocksExtended[currentEpoch]     = true;
        epochKeeperExtendLocks[currentEpoch] = tx.origin;
        emit LocksExtendedMarked(currentEpoch, tx.origin);
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

    function _scanBest() internal view returns (address bestGauge, uint256 bestScore) {
        uint256 n = valuedTokens.length;
        if (n == 0) return (address(0), 0);

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
        (address bestGauge, uint256 bestScore) = _scanBest();

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
        bool anyValue;

        for (uint256 i = 0; i < uniqueCount; i++) {
            address token = uniqueTokens[i];
            uint256 harvested = IERC20Upgradeable(token).balanceOf(address(this)) - balancesBefore[i];
            uint256 available = harvested + carriedOver[token];
            if (available == 0) continue;
            anyValue = true;

            uint256 threshold = tokenMinHarvestThreshold[token] > 0
                ? tokenMinHarvestThreshold[token]
                : minHarvestThreshold;

            if (available < threshold) {
                carriedOver[token] = available;
                emit HarvestSkippedBelowThreshold(epoch, token, available);
                continue;
            }

            carriedOver[token] = 0;
            totalBountyPaid += _settleHarvestedToken(epoch, token, available, keepers);
        }

        require(anyValue, "ByNdVoter: nothing harvested this epoch");
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
            if (staking.totalStaked() == 0) {
                carriedOver[token] += stakerAmount;
                emit StakerRewardDeferred(epoch, token, stakerAmount);
            } else {
                IERC20Upgradeable(token).forceApprove(address(staking), stakerAmount);
                staking.notifyRewardAmount(token, stakerAmount);
            }
        }
    }

    function forceCloseEpoch() external onlyGovernance {
        uint256 epoch = currentEpoch;
        require(!epochHarvested[epoch], "ByNdVoter: already harvested");
        address[] memory toks = epochUniqueTokens[epoch];
        for (uint256 i = 0; i < toks.length; i++) {
            uint256 delta = IERC20Upgradeable(toks[i]).balanceOf(address(this))
                - epochBalanceBefore[epoch][toks[i]];
            if (delta > 0) carriedOver[toks[i]] += delta;
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

    function timeUntilNextVote() external view returns (uint256) {
        uint256 windowOpensAt = boostVoter.epochNext(block.timestamp) - voteWindow;
        if (block.timestamp >= windowOpensAt) return 0;
        return windowOpensAt - block.timestamp;
    }

    function previewOptimalGauge() external view returns (address bestGauge, uint256 bestScore) {
        return _scanBest();
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