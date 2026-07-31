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
        // NOTE: Mezo's real LockedBalance struct also has a trailing `boost`
        // field after this. Solidity's ABI decoder only reads as many
        // trailing words as the caller declares, so omitting it here is safe
        // — we just never see it, and nothing in this contract needs it.
    }
    function locked(uint256 tokenId) external view returns (LockedBalance memory);
    function votingPowerOfNFT(uint256 tokenId) external view returns (uint256);
    function increaseUnlockTime(uint256 tokenId, uint256 newEndTime) external;
    function depositFor(uint256 tokenId, uint256 amount) external;
    /// @notice Burns `_from`, folding its locked amount into `_to`. Reverts if
    /// `_from` already voted this epoch, if `_from` is itself a permanent
    /// lock, or if either side is an unvested grant NFT. See Mezo's real
    /// Escrow.sol merge() for the exact preconditions.
    function merge(uint256 _from, uint256 _to) external;
}

interface IRewardsDistributor {
    function claim(uint256 tokenId) external returns (uint256);
    function claimMany(uint256[] calldata tokenIds) external returns (bool);
    function claimable(uint256 tokenId) external view returns (uint256);
}

interface IByNdVoter {
    function addManagedTokenId(uint256 tokenId) external;
    function markRebasesClaimed(address keeper) external;
    function markLocksExtended() external;
}

/// @title  ByNdVault v2 Bynd deposit vault (UUPS upgradeable)
/// @dev Every deposit after the first is merged into a single canonical
/// veMEZO NFT via veMEZO.merge() (see _deposit). This means ByNdVoter only
/// ever has to vote/claim/extend-lock with one tokenId, no matter how many
/// people deposit — voting, claiming bribes, and extending locks all stay
/// O(1) forever instead of growing with the vault's size. The batching/
/// paging machinery this contract used to need for those O(n) operations
/// has been removed accordingly; see git history if it's ever needed again
/// (e.g. if merge() failures become common enough that stragglers pile up).
contract ByNdVault is
    Initializable,
    ERC721HolderUpgradeable,
    ReentrancyGuardUpgradeable,
    OwnableUpgradeable,
    UUPSUpgradeable
{
    uint256 public constant MAXTIME = 4 * 365 days;

    /// @dev Defensive cap on extendLocks()/claimRebases()'s internal loop.
    /// In the common case allTokenIds only ever holds the canonical tokenId
    /// (length 1), so this never actually engages — it only exists so a
    /// pathological run of merge() failures can't blow the block gas limit.
    uint256 public constant MAX_BATCH = 200;

    IVeMEZO public veMEZO;
    VeBYND  public veBYND;
    IByNdVoter public voter;
    IRewardsDistributor public rewardsDistributor;

    /// @dev Historical record of who deposited which original tokenId, kept
    /// for user-facing display purposes only. A tokenId that got merged into
    /// canonicalTokenId no longer exists as an NFT (it's burned), but it
    /// stays in depositorOf/_userTokens as a record of "user X deposited
    /// this much via this tokenId" — it does NOT appear in allTokenIds
    /// afterward, since allTokenIds only tracks currently-existing,
    /// currently-managed NFTs (the canonical one, plus any merge-failure
    /// stragglers).
    mapping(uint256 => address) public depositorOf;
    mapping(address => uint256[]) private _userTokens;
    mapping(uint256 => uint256) private _tokenIndex;
    uint256[] public allTokenIds;

    /// @notice The single veMEZO NFT every deposit after the first gets
    /// merged into. This is the only tokenId ByNdVoter ever needs to vote,
    /// claim bribes, or extend the lock with.
    /// @dev Appended AFTER all pre-existing state variables above — this is
    /// a new variable added in a UUPS upgrade, and new variables must always
    /// go at the end of storage layout, never inserted in the middle, or
    /// every variable declared after the insertion point silently shifts to
    /// the wrong storage slot and reads back garbage/wrong data.
    uint256 public canonicalTokenId;

    event Deposited(address indexed user, uint256 indexed tokenId, uint256 veByndMinted);
    event BatchDeposited(address indexed user, uint256 tokenCount, uint256 totalVeByndMinted);
    event MergedIntoCanonical(uint256 indexed tokenId, uint256 indexed canonicalTokenId);
    event MergeFailedFallback(uint256 indexed tokenId);
    event LocksExtended(address indexed keeper, uint256 tokenCount, uint256 newUnlockTime);
    event LockExtendSkipped(uint256 indexed tokenId);
    event RebasesClaimed(address indexed keeper, uint256 tokenCount);
    event RewardsDistributorSet(address indexed distributor);
    event VoterSet(address indexed voter);

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
        // Permanent locks have no meaningful expiry — only enforce the
        // "not expired" check for ordinary, time-bound locks.
        require(lock.isPermanent || lock.end > block.timestamp, "ByNdVault: lock expired");
        mintAmount = uint256(uint128(lock.amount));

        veMEZO.safeTransferFrom(user, address(this), tokenId);
        depositorOf[tokenId] = user;
        _tokenIndex[tokenId] = _userTokens[user].length;
        _userTokens[user].push(tokenId);
        veBYND.mint(user, mintAmount);

        if (canonicalTokenId == 0) {
            // First-ever deposit: nothing to merge into yet, so this tokenId
            // itself becomes the canonical position going forward.
            canonicalTokenId = tokenId;
            allTokenIds.push(tokenId);
            _registerManaged(tokenId);
        } else {
            // Fold this deposit's value into the canonical NFT and burn it,
            // so ByNdVoter never has to individually vote/claim/extend it.
            try veMEZO.merge(tokenId, canonicalTokenId) {
                emit MergedIntoCanonical(tokenId, canonicalTokenId);
            } catch {
                // Rare: merge() rejects unvested grant NFTs, locks that are
                // already permanent, or an NFT that already voted elsewhere
                // this epoch. Fall back to managing it individually so the
                // deposit still succeeds and nothing is lost — it just costs
                // a bit more gas at vote/claim/extend time until it can be
                // merged in a later epoch (once its `voted` flag clears).
                allTokenIds.push(tokenId);
                _registerManaged(tokenId);
                emit MergeFailedFallback(tokenId);
            }
        }
    }

    function _registerManaged(uint256 tokenId) internal {
        if (address(voter) != address(0)) {
            try voter.addManagedTokenId(tokenId) {} catch {}
        }
    }

    /// @notice Extends every currently-managed tokenId (canonical NFT, plus
    /// any merge-failure stragglers) toward the 4-year max lock. Callable
    /// anytime by anyone (no cooldown) — harmless no-op for any tokenId that
    /// doesn't need extending. In the common case this processes exactly one
    /// NFT (canonicalTokenId), so there's no caller-supplied batch to manage.
    function extendLocks() external nonReentrant {
        uint256 newEndTime = block.timestamp + MAXTIME;
        uint256 extendedCount;

        uint256 count = allTokenIds.length;
        if (count > MAX_BATCH) count = MAX_BATCH;

        for (uint256 i = 0; i < count; i++) {
            uint256 tokenId = allTokenIds[i];
            IVeMEZO.LockedBalance memory lock = veMEZO.locked(tokenId);

            // Permanent locks have no end date to push out — nothing to do.
            if (lock.isPermanent) continue;
            if (lock.end >= newEndTime) continue;

            try veMEZO.increaseUnlockTime(tokenId, newEndTime) {
                extendedCount++;
            } catch {
                emit LockExtendSkipped(tokenId);
            }
        }

        if (address(voter) != address(0)) {
            try voter.markLocksExtended() {} catch {}
        }
        emit LocksExtended(msg.sender, extendedCount, newEndTime);
    }

    /// @notice Claims the veMEZO rebase for every currently-managed tokenId.
    /// In the common case this is just canonicalTokenId, so there's no
    /// caller-supplied batch to page through.
    function claimRebases() external nonReentrant returns (uint256) {
        require(address(rewardsDistributor) != address(0), "ByNdVault: distributor not set");
        uint256 count = allTokenIds.length;
        require(count > 0, "ByNdVault: nothing to claim");
        rewardsDistributor.claimMany(allTokenIds);
        if (address(voter) != address(0)) {
            try voter.markRebasesClaimed(msg.sender) {} catch {}
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

    /// @notice How many veMEZO NFTs the vault currently actively manages
    /// (the canonical position, plus any rare merge-failure stragglers) —
    /// NOT a historical count of every deposit ever made.
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
        // Without this, ByNdVoter.optimiseAndVote() calls boostVoter.vote()
        // as itself — but the Vault, not the Voter, actually holds custody
        // of the deposited veMEZO NFTs (see _deposit's safeTransferFrom to
        // address(this)). Mezo's real BoostVoter requires msg.sender to be
        // the veMEZO owner or an approved operator, so every vote() call
        // reverts unless the Vault explicitly approves the Voter here.
        veMEZO.setApprovalForAll(_voter, true);
        emit VoterSet(_voter);
    }

    /// @dev Re-grants operator approval to the currently-set voter without
    /// changing it. Needed for deployments upgraded in place after this fix
    /// was added, where setVoter() already ran under the old logic and won't
    /// run again just because the implementation changed.
    function grantVoterApproval() external onlyOwner {
        require(address(voter) != address(0), "ByNdVault: no voter set");
        veMEZO.setApprovalForAll(address(voter), true);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}
