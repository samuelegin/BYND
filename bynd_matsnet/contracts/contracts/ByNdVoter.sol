// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./ByNdStaking.sol";

interface IBoostVoter {
    function vote(uint256 _tokenId, address[] calldata _gaugeVote, uint256[] calldata _weights) external;
    function claimBribes(address[] calldata _bribes, address[][] calldata _tokens, uint256 _tokenId) external;
    function gauges(uint256 index) external view returns (address);
    function length() external view returns (uint256);
    function gaugeToBribe(address gauge) external view returns (address);
    function isAlive(address gauge) external view returns (bool);
    function isWhitelistedToken(address token) external view returns (bool);
    function claimable(address gauge) external view returns (uint256);
}

/// @title  ByNdVoter — Voting and reward distribution engine
/// @notice Each epoch:
///   1. extendLocks()          — keeper resets all veMEZO to 4yr max
///   2. castVotes()            — keeper directs BynD's veMEZO power to veBTC boost gauges
///   3. harvestAndDistribute() — keeper claims bribe incentives, splits to stakers (99%) + bounty (1%)
///
/// @dev  Gauge struct stores BOTH the boost gauge address (for voting) AND the bribe
///       contract address (for claiming). In BoostVoter: gaugeToBribe[gaugeAddr] = bribeAddr.
///       Governance must call setGauges() with the correct pair after each boost gauge is created.
contract ByNdVoter is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable musd;
    ByNdStaking public immutable staking;
    IBoostVoter public boostVoter; // BoostVoter at 0x21d7bDF5a5929AD179F8cA0c9014A0B62ae6Bfd1

    address public governance;
    uint256 public managedTokenId;
    uint256 public bountyBps = 100;   // 1% keeper bounty
    uint256 public constant MAX_BPS = 10_000;
    uint256 public minHarvestThreshold = 0;
    uint256 public epochDuration = 7 days;
    uint256 public voteWindow    = 4 hours; // voting opens this many seconds before epoch end
    uint256 public lastVoteTimestamp;
    uint256 public currentEpoch;

    mapping(uint256 => bool) public epochVoted;
    mapping(uint256 => bool) public epochHarvested;
    mapping(uint256 => bool) public epochLocksExtended;

    struct Gauge {
        address   gauge;
        address   bribe;
        string    name;
        uint256   weightBps;
        address[] tokens;
    }

    Gauge[] public gauges;

    event VotesCast(uint256 indexed epoch, uint256 gaugeCount);
    event Harvested(
        uint256 indexed epoch,
        address indexed keeper,
        uint256 totalMUSD,
        uint256 keeperBounty,
        uint256 stakerShare
    );
    event GaugesUpdated(uint256 count);
    event LocksExtendedMarked(uint256 indexed epoch, address keeper);
    event MinThresholdUpdated(uint256 newThreshold);

    constructor(
        address _musd,
        address _staking,
        address _boostVoter
    ) Ownable(msg.sender) {
        musd       = IERC20(_musd);
        staking    = ByNdStaking(_staking);
        boostVoter = IBoostVoter(_boostVoter);
        governance = msg.sender;
        lastVoteTimestamp = block.timestamp;
    }

    function markLocksExtended() external {
        require(!epochLocksExtended[currentEpoch], "ByNdVoter: already marked");
        epochLocksExtended[currentEpoch] = true;
        emit LocksExtendedMarked(currentEpoch, msg.sender);
    }

    function castVotes() external nonReentrant {
        require(!epochVoted[currentEpoch], "ByNdVoter: already voted");
        require(block.timestamp >= lastVoteTimestamp + epochDuration - voteWindow, "ByNdVoter: vote window not open");
        require(gauges.length > 0, "ByNdVoter: no gauges set");
        require(managedTokenId > 0, "ByNdVoter: no managed token");

        address[] memory gaugeAddrs = new address[](gauges.length);
        uint256[] memory weights = new uint256[](gauges.length);

        for (uint256 i = 0; i < gauges.length; i++) {
            gaugeAddrs[i] = gauges[i].gauge;
            weights[i] = gauges[i].weightBps;
        }

        boostVoter.vote(managedTokenId, gaugeAddrs, weights);

        lastVoteTimestamp = block.timestamp;
        epochVoted[currentEpoch] = true;

        emit VotesCast(currentEpoch, gauges.length);
    }

    function harvestAndDistribute() external nonReentrant {
        uint256 epoch = currentEpoch;

        if (!epochVoted[epoch] && epoch > 0 && epochHarvested[epoch - 1]) {
            revert("ByNdVoter: already harvested");
        }
        require(epochVoted[epoch],       "ByNdVoter: votes not cast");
        require(!epochHarvested[epoch],  "ByNdVoter: already harvested");

        epochHarvested[epoch] = true;
        currentEpoch++;

        // ── Collect all unique bribe tokens across gauges ─────────────────
        address[] memory bribes = new address[](gauges.length);
        address[][] memory bribeTokens = new address[][](gauges.length);

        // Build unique token set for balance snapshots
        address[] memory uniqueTokens = new address[](gauges.length * 5); // upper bound
        uint256 uniqueCount = 0;
        for (uint256 i = 0; i < gauges.length; i++) {
            bribes[i]      = gauges[i].bribe;
            bribeTokens[i] = gauges[i].tokens;
            for (uint256 j = 0; j < gauges[i].tokens.length; j++) {
                address t = gauges[i].tokens[j];
                bool found = false;
                for (uint256 k = 0; k < uniqueCount; k++) {
                    if (uniqueTokens[k] == t) { found = true; break; }
                }
                if (!found) uniqueTokens[uniqueCount++] = t;
            }
        }

        // ── Snapshot balances before claim ────────────────────────────────
        uint256[] memory balancesBefore = new uint256[](uniqueCount);
        for (uint256 i = 0; i < uniqueCount; i++) {
            balancesBefore[i] = IERC20(uniqueTokens[i]).balanceOf(address(this));
        }

        // ── Claim bribes from all gauge bribe contracts ───────────────────
        try boostVoter.claimBribes(bribes, bribeTokens, managedTokenId) {} catch {}

        // ── Distribute each harvested token ───────────────────────────────
        uint256 totalMUSDEquivalent = 0; // track primary token for event + threshold check
        bool anyAboveThreshold = false;

        for (uint256 i = 0; i < uniqueCount; i++) {
            address token   = uniqueTokens[i];
            uint256 harvested = IERC20(token).balanceOf(address(this)) - balancesBefore[i];
            if (harvested == 0) continue;

            uint256 keeperBounty = (harvested * bountyBps) / MAX_BPS;
            uint256 stakerShare  = harvested - keeperBounty;

            if (keeperBounty > 0) IERC20(token).safeTransfer(msg.sender, keeperBounty);
            if (stakerShare  > 0) {
                IERC20(token).forceApprove(address(staking), stakerShare);
                staking.notifyRewardAmount(token, stakerShare);
            }

            // Use first/primary token (MUSD) for threshold check and event
            if (token == address(musd)) {
                totalMUSDEquivalent = harvested;
                if (harvested >= minHarvestThreshold) anyAboveThreshold = true;
            } else {
                anyAboveThreshold = true; // any non-zero non-MUSD token counts
            }
        }

        // Only revert threshold check if we got nothing at all
        if (!anyAboveThreshold && minHarvestThreshold > 0) {
            revert("ByNdVoter: below threshold");
        }

        uint256 keeperBountyMUSD = (totalMUSDEquivalent * bountyBps) / MAX_BPS;
        uint256 stakerShareMUSD  = totalMUSDEquivalent - keeperBountyMUSD;
        emit Harvested(epoch, msg.sender, totalMUSDEquivalent, keeperBountyMUSD, stakerShareMUSD);
    }

    function timeUntilNextVote() external view returns (uint256) {
        uint256 voteOpenTime = lastVoteTimestamp + epochDuration - voteWindow;
        if (block.timestamp >= voteOpenTime) return 0;
        return voteOpenTime - block.timestamp;
    }

    function getPendingIncentives() external view returns (uint256) {
        return musd.balanceOf(address(this));
    }

    function getGaugeCount() external view returns (uint256) {
        return gauges.length;
    }

    function fetchLiveGauges() external view returns (
        address[] memory gaugeAddrs,
        address[] memory brideAddrs,
        uint256[] memory claimableAmounts
    ) {
        uint256 total = boostVoter.length();
        uint256 aliveCount = 0;

        // Count alive gauges first
        for (uint256 i = 0; i < total; i++) {
            if (boostVoter.isAlive(boostVoter.gauges(i))) aliveCount++;
        }

        gaugeAddrs = new address[](aliveCount);
        brideAddrs = new address[](aliveCount);
        claimableAmounts = new uint256[](aliveCount);

        uint256 j = 0;
        for (uint256 i = 0; i < total; i++) {
            address g = boostVoter.gauges(i);
            if (boostVoter.isAlive(g)) {
                gaugeAddrs[j]       = g;
                brideAddrs[j]       = boostVoter.gaugeToBribe(g);
                claimableAmounts[j] = boostVoter.claimable(g);
                j++;
            }
        }
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

    /// @notice Set veBTC boost gauge allocations.
    ///         _gauges[i]      = boost gauge address (from BoostVoter.boostableTokenIdToGauge)
    ///         _bribes[i]      = bribe contract address (from BoostVoter.gaugeToBribe[gauge])
    ///         _names[i]       = human label e.g. "veBTC #42 Boost Gauge"
    ///         _weightsBps[i]  = allocation in BPS — must sum to 10000
    ///         _tokens[i]      = whitelisted bribe tokens for gauge i (e.g. [MUSD_ADDRESS])
    function setGauges(
        address[]   calldata _gauges,
        address[]   calldata _bribes,
        string[]    calldata _names,
        uint256[]   calldata _weightsBps,
        address[][] calldata _tokens
    ) external onlyGovernance {
        require(
            _gauges.length == _bribes.length &&
            _bribes.length == _names.length  &&
            _names.length  == _weightsBps.length &&
            _weightsBps.length == _tokens.length,
            "ByNdVoter: length mismatch"
        );
        uint256 totalW;
        for (uint256 i = 0; i < _weightsBps.length; i++) totalW += _weightsBps[i];
        require(totalW == MAX_BPS, "ByNdVoter: weights must sum to 10000");

        delete gauges;
        for (uint256 i = 0; i < _gauges.length; i++) {
            if (_gauges[i] != address(0)) {
                require(boostVoter.isAlive(_gauges[i]), "ByNdVoter: gauge not alive");
                // Auto-fill bribe address from BoostVoter if caller passes address(0)
                address bribeAddr = _bribes[i] == address(0)
                    ? boostVoter.gaugeToBribe(_gauges[i])
                    : _bribes[i];
                gauges.push(Gauge({
                    gauge:  _gauges[i],
                    bribe: bribeAddr,
                    name: _names[i],
                    weightBps: _weightsBps[i],
                    tokens: _tokens[i]
                }));
            } else {
                gauges.push(Gauge({
                    gauge: _gauges[i],
                    bribe: _bribes[i],
                    name: _names[i],
                    weightBps: _weightsBps[i],
                    tokens: _tokens[i]
                }));
            }
        }
        emit GaugesUpdated(_gauges.length);
    }

    function setManagedTokenId(uint256 _tokenId) external onlyGovernance {
        managedTokenId = _tokenId;
    }

    function setBoostVoter(address _voter) external onlyGovernance {
        boostVoter = IBoostVoter(_voter);
    }

    function setBountyBps(uint256 bps) external onlyGovernance {
        require(bps < MAX_BPS, "ByNdVoter: bps too high");
        bountyBps = bps;
    }

    function setMinHarvestThreshold(uint256 threshold) external onlyGovernance {
        minHarvestThreshold = threshold;
        emit MinThresholdUpdated(threshold);
    }

    function setEpochDuration(uint256 duration) external onlyGovernance {
        require(duration >= 1 days, "ByNdVoter: too short");
        epochDuration = duration;
    }

    /// @notice Initialize the epoch clock to now. Call once after deployment.
    function initEpoch() external onlyGovernance {
        require(lastVoteTimestamp == 0, "ByNdVoter: already initialized");
        lastVoteTimestamp = block.timestamp;
    }

    function transferGovernance(address newGov) external onlyGovernance {
        require(newGov != address(0), "ByNdVoter: zero address");
        governance = newGov;
    }
}