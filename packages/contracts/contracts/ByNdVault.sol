// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/token/ERC721/utils/ERC721HolderUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "./VeBYND.sol";

interface IVeMEZO is IERC721 {
    struct LockedBalance {
        int128  amount;
        uint256 end;
        bool isPermanent;
    }
    function locked(uint256 tokenId) external view returns (LockedBalance memory);
    function votingPowerOfNFT(uint256 tokenId) external view returns (uint256);
    function increaseUnlockTime(uint256 tokenId, uint256 newEndTime) external;
    function depositFor(uint256 tokenId, uint256 amount) external;
    function merge(uint256 _from, uint256 _to) external;
}

interface IRewardsDistributor {
    function claim(uint256 tokenId) external returns (uint256);
    function claimMany(uint256[] calldata tokenIds) external returns (bool);
    function claimable(uint256 tokenId) external view returns (uint256);
}

interface IByNdVoter {
    function addManagedTokenId(uint256 tokenId) external;
    function removeManagedTokenId(uint256 tokenId) external;
    function markRebasesClaimed(address keeper) external;
    /// Takes the keeper explicitly. The call arrives via the vault, so
    /// msg.sender is the vault and the voter used to fall back to tx.origin to
    /// find the human -- which breaks contract-based keepers and is a pattern
    /// auditors flag on sight (BYND-10).
    function markLocksExtended(address keeper) external;
    function extendWindowOpen() external view returns (bool);
    function epochLocksExtended(uint256 epoch) external view returns (bool);
    function currentEpoch() external view returns (uint256);
}

contract ByNdVault is
    Initializable,
    ERC721HolderUpgradeable,
    ReentrancyGuardUpgradeable,
    OwnableUpgradeable,
    UUPSUpgradeable
{
    uint256 public constant MAXTIME = 4 * 365 days;
    uint256 public constant MAX_BATCH = 200;

    IVeMEZO public veMEZO;
    VeBYND  public veBYND;
    IByNdVoter public voter;
    IRewardsDistributor public rewardsDistributor;

    mapping(uint256 => address) public depositorOf;
    mapping(address => uint256[]) private _userTokens;
    mapping(uint256 => uint256) private _tokenIndex;
    uint256[] public allTokenIds;

    uint256 public canonicalTokenId;

    /// Where the next extendLocks() pass resumes. Without a cursor, extendLocks
    /// always restarted at index 0 and stopped after MAX_BATCH, so any token at
    /// index >= 200 was never extended -- not this epoch, not any epoch -- while
    /// LocksExtended still reported success. Those locks decayed to expiry, and
    /// with no withdrawal path the principal became unrecoverable (BYND-02).
    /// Mirrors epochClaimCursor in ByNdVoter, which already works this way.
    uint256 public extendCursor;

    /// When true, _deposit rejects permanent locks outright.
    ///
    /// Defaults to FALSE (permanent locks accepted). BYND-01 says a permanent
    /// lock can never merge, so each one becomes a permanent straggler. The
    /// Phase 0 probe (scripts/verify-permanent-merge.js) found 115 permanent
    /// locks live on Matsnet but could NOT confirm the merge restriction: with
    /// no ownership of those NFTs, both a permanent and a non-permanent _from
    /// revert identically on the approval check, so the permanence question is
    /// unanswerable by observation. The restriction is real on MockVeMEZO;
    /// whether it is real on the deployed veMEZO is unproven.
    ///
    /// Defaulting to reject would exclude 115 of the strongest possible
    /// depositors to fix a bug that may not exist. Defaulting to accept is safe
    /// because the straggler path is no longer harmful: extendLocks already
    /// skips isPermanent locks (they never need extending), retryMerge can
    /// consolidate any straggler that becomes mergeable, and the extendCursor
    /// fix means a growing allTokenIds no longer strands its own tail.
    /// The residual cost is per-vote gas, not lost principal.
    ///
    /// Governance can flip this the moment a permanent-lock merge is observed
    /// to fail in production. FLAGGED FOR AUDIT: confirm the veMEZO merge
    /// precondition against the real implementation and set accordingly.
    bool public rejectPermanentLocks;

    event Deposited(address indexed user, uint256 indexed tokenId, uint256 veByndMinted);
    event BatchDeposited(address indexed user, uint256 tokenCount, uint256 totalVeByndMinted);
    event MergedIntoCanonical(uint256 indexed tokenId, uint256 indexed canonicalTokenId);
    event MergeFailedFallback(uint256 indexed tokenId);
    event LocksExtended(address indexed keeper, uint256 tokenCount, uint256 newUnlockTime);
    event LockExtendSkipped(uint256 indexed tokenId);
    event RebasesClaimed(address indexed keeper, uint256 tokenCount);
    event RewardsDistributorSet(address indexed distributor);
    event VoterSet(address indexed voter);
    /// Emitted every extendLocks() pass so an operator can see the cursor move
    /// and tell a partial sweep from a completed one (BYND-02).
    event ExtendProgress(uint256 cursorFrom, uint256 cursorTo, uint256 total, bool fullPass);
    /// A straggler was successfully merged into the canonical lock after the
    /// fact, so the vault no longer tracks it separately (BYND-01).
    event StragglerMerged(uint256 indexed tokenId, uint256 indexed canonicalTokenId);
    /// The voter refused a bookkeeping call. Deposits must not fail on
    /// bookkeeping, so these are swallowed -- but silently swallowing them let
    /// the vault custody a token the voter never learned about, with nothing
    /// on-chain to show it (BYND-09).
    event VoterCallFailed(bytes4 selector, uint256 tokenId);
    event RejectPermanentLocksSet(bool reject);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _veMEZO, address _veBYND) public initializer {
        __ERC721Holder_init();
        __ReentrancyGuard_init();
        __Ownable_init();        
        __UUPSUpgradeable_init();

        require(_veMEZO != address(0), "ByNdVault: zero veMEZO");
        require(_veBYND != address(0), "ByNdVault: zero veBYND");

        veMEZO = IVeMEZO(_veMEZO);
        veBYND = VeBYND(_veBYND);
    }

    function deposit(uint256 tokenId) external nonReentrant {
        uint256 mintAmount = _deposit(tokenId, msg.sender);
        emit Deposited(msg.sender, tokenId, mintAmount);
    }

    function depositBatch(uint256[] calldata tokenIds) external nonReentrant {
        require(tokenIds.length > 0, "ByNdVault: empty array");
        require(tokenIds.length <= 50, "ByNdVault: max 50 per batch");
        uint256 totalMinted = 0;
        for (uint256 i = 0; i < tokenIds.length; i++) {
            totalMinted += _deposit(tokenIds[i], msg.sender);
        }
        emit BatchDeposited(msg.sender, tokenIds.length, totalMinted);
    }

    function _deposit(uint256 tokenId, address user) internal returns (uint256 mintAmount) {
        require(veMEZO.ownerOf(tokenId) == user, "ByNdVault: not owner");
        IVeMEZO.LockedBalance memory lock = veMEZO.locked(tokenId);
        require(lock.amount > 0, "ByNdVault: empty lock");
        require(lock.isPermanent || lock.end > block.timestamp, "ByNdVault: lock expired");
        // Reuses the literal above rather than adding a new one.
        require(!lock.isPermanent || !rejectPermanentLocks, "ByNdVault: lock expired");
        mintAmount = uint256(uint128(lock.amount));

        veMEZO.safeTransferFrom(user, address(this), tokenId);
        depositorOf[tokenId] = user;
        _tokenIndex[tokenId] = _userTokens[user].length;
        _userTokens[user].push(tokenId);
        veBYND.mint(user, mintAmount);

        if (canonicalTokenId == 0) {
            canonicalTokenId = tokenId;
            allTokenIds.push(tokenId);
            _registerManaged(tokenId);
        } else {
            try veMEZO.merge(tokenId, canonicalTokenId) {
                emit MergedIntoCanonical(tokenId, canonicalTokenId);
            } catch {
                allTokenIds.push(tokenId);
                _registerManaged(tokenId);
                emit MergeFailedFallback(tokenId);
            }
        }
    }

    function _registerManaged(uint256 tokenId) internal {
        if (address(voter) != address(0)) {
            // Still swallowed: a deposit must not fail because the voter's
            // bookkeeping did. But it no longer fails silently -- the event is
            // the only signal that the vault holds a token the voter cannot
            // vote with, and someone has to go re-register it (BYND-09).
            try voter.addManagedTokenId(tokenId) {} catch {
                emit VoterCallFailed(IByNdVoter.addManagedTokenId.selector, tokenId);
            }
        }
    }

    /// Retries the canonical merge for a straggler that failed to merge on
    /// deposit. Permissionless: it can only ever consolidate the vault's own
    /// holdings into the vault's own canonical lock, so there is nothing to
    /// gain by calling it maliciously and real value in anyone being able to.
    ///
    /// Deposit-time merge failures are swallowed by design -- a deposit must
    /// not fail because veMEZO refused a merge -- but nothing retried them, so
    /// a lock that failed once stayed a separate NFT permanently. That costs
    /// gas on every vote and every rebase claim, forever (BYND-01).
    function retryMerge(uint256 tokenId) external nonReentrant {
        require(canonicalTokenId != 0, "ByNdVault: no canonical lock");
        require(tokenId != canonicalTokenId, "ByNdVault: token is canonical");
        require(depositorOf[tokenId] != address(0), "ByNdVault: not a vault token");

        // Must actually be a tracked straggler, not an already-merged token.
        uint256 idx = type(uint256).max;
        uint256 len = allTokenIds.length;
        for (uint256 i = 0; i < len; i++) {
            if (allTokenIds[i] == tokenId) { idx = i; break; }
        }
        require(idx != type(uint256).max, "ByNdVault: not a straggler");

        // Let this revert rather than swallowing it: the caller chose to retry,
        // so the reason it still cannot merge is the useful part of the result.
        veMEZO.merge(tokenId, canonicalTokenId);

        // Swap-and-pop, matching removeManagedTokenId on the voter.
        allTokenIds[idx] = allTokenIds[len - 1];
        allTokenIds.pop();
        if (extendCursor >= allTokenIds.length) extendCursor = 0;

        if (address(voter) != address(0)) {
            try voter.removeManagedTokenId(tokenId) {} catch {
                emit VoterCallFailed(IByNdVoter.removeManagedTokenId.selector, tokenId);
            }
        }
        emit StragglerMerged(tokenId, canonicalTokenId);
    }

    function extendLocks() external nonReentrant {
        // Gate first, cheaply, so a second caller this epoch doesn't pay gas
        // for a full loop the vote-marking would just swallow. The voter owns
        // the epoch clock, so it decides both sides of the gate here.
        if (address(voter) != address(0)) {
            require(!voter.epochLocksExtended(voter.currentEpoch()), "ByNdVault: locks already extended this epoch");
            require(voter.extendWindowOpen(), "ByNdVault: extend window not open");
        }

        uint256 newEndTime = block.timestamp + MAXTIME;
        uint256 extendedCount;

        uint256 total = allTokenIds.length;
        require(total > 0, "ByNdVault: nothing to extend");

        // Resume where the last pass stopped instead of always restarting at 0.
        // A cursor past the end (tokens were removed since) wraps to the start.
        uint256 from = extendCursor;
        if (from >= total) from = 0;

        uint256 batch = total - from;
        if (batch > MAX_BATCH) batch = MAX_BATCH;

        for (uint256 i = 0; i < batch; i++) {
            uint256 tokenId = allTokenIds[from + i];
            IVeMEZO.LockedBalance memory lock = veMEZO.locked(tokenId);

            if (lock.isPermanent) continue;
            if (lock.end >= newEndTime) continue;

            try veMEZO.increaseUnlockTime(tokenId, newEndTime) {
                extendedCount++;
            } catch {
                emit LockExtendSkipped(tokenId);
            }
        }

        uint256 to = from + batch;
        bool fullPass = to >= total;
        extendCursor = fullPass ? 0 : to;

        if (address(voter) != address(0)) {
            // Only credit the keeper and close the epoch's extend flag once the
            // whole set has actually been walked. Marking it after a partial
            // batch is what let the tail of allTokenIds go unextended forever:
            // the epoch gate then rejected the follow-up calls needed to reach
            // it. With >MAX_BATCH tokens the keeper must call repeatedly until
            // this lands.
            if (fullPass) {
                try voter.markLocksExtended(msg.sender) {} catch {
                    emit VoterCallFailed(IByNdVoter.markLocksExtended.selector, 0);
                }
            }
        }
        emit ExtendProgress(from, to, total, fullPass);
        emit LocksExtended(msg.sender, extendedCount, newEndTime);
    }

    function claimRebases() external nonReentrant returns (uint256) {
        require(address(rewardsDistributor) != address(0), "ByNdVault: distributor not set");
        uint256 count = allTokenIds.length;
        require(count > 0, "ByNdVault: nothing to claim");
        rewardsDistributor.claimMany(allTokenIds);
        if (address(voter) != address(0)) {
            try voter.markRebasesClaimed(msg.sender) {} catch {
                emit VoterCallFailed(IByNdVoter.markRebasesClaimed.selector, 0);
            }
        }
        emit RebasesClaimed(msg.sender, count);
        return 0;
    }

    function totalLockedMEZO() external view returns (uint256 total) {
        for (uint256 i = 0; i < allTokenIds.length; i++) {
            IVeMEZO.LockedBalance memory lock = veMEZO.locked(allTokenIds[i]);
            if (lock.amount > 0) total += uint256(uint128(lock.amount));
        }
    }

    function totalVotingPower() external view returns (uint256 total) {
        for (uint256 i = 0; i < allTokenIds.length; i++) {
            total += veMEZO.votingPowerOfNFT(allTokenIds[i]);
        }
    }

    function getUserTokens(address user) external view returns (uint256[] memory) {
        return _userTokens[user];
    }

    function totalDeposited() external view returns (uint256) {
        return allTokenIds.length;
    }

    function totalPendingRebase() external view returns (uint256 total) {
        if (address(rewardsDistributor) == address(0)) return 0;
        for (uint256 i = 0; i < allTokenIds.length; i++) {
            total += rewardsDistributor.claimable(allTokenIds[i]);
        }
    }

    function getAllTokenIds() external view returns (uint256[] memory) {
        return allTokenIds;
    }

    function setRewardsDistributor(address _distributor) external onlyOwner {
        require(_distributor != address(0), "ByNdVault: zero address");
        rewardsDistributor = IRewardsDistributor(_distributor);
        emit RewardsDistributorSet(_distributor);
    }

    function setVoter(address _voter) external onlyOwner {
        require(_voter != address(0), "ByNdVault: zero address");
        voter = IByNdVoter(_voter);
        veMEZO.setApprovalForAll(_voter, true);
        emit VoterSet(_voter);
    }

    function grantVoterApproval() external onlyOwner {
        require(address(voter) != address(0), "ByNdVault: no voter set");
        veMEZO.setApprovalForAll(address(voter), true);
    }

    /// Flip to true if a permanent-lock merge is ever observed to fail against
    /// the real veMEZO -- see the rejectPermanentLocks declaration for why this
    /// defaults to permissive and what evidence would justify changing it.
    function setRejectPermanentLocks(bool reject) external onlyOwner {
        rejectPermanentLocks = reject;
        emit RejectPermanentLocksSet(reject);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}