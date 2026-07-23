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
}

interface IRewardsDistributor {
    function claim(uint256 tokenId) external returns (uint256);
    function claimMany(uint256[] calldata tokenIds) external returns (bool);
    function claimable(uint256 tokenId) external view returns (uint256);
}

interface IByNdVoter {
    function addManagedTokenId(uint256 tokenId) external;
    function addManagedTokenIds(uint256[] calldata tokenIds) external;
    function markRebasesClaimed(address keeper) external;
    function markLocksExtended() external;
}

/// @title  ByNdVault v2 Bynd deposit vault (UUPS upgradeable)
contract ByNdVault is
    Initializable,
    ERC721HolderUpgradeable,
    ReentrancyGuardUpgradeable,
    OwnableUpgradeable,
    UUPSUpgradeable
{
    uint256 public constant MAXTIME = 4 * 365 days;

    /// @dev Hard cap on how many tokenIds a single extendLocks()/claimRebases()
    /// call can process. Keeps every call's gas cost bounded and constant no
    /// matter how large the vault grows — callers page through in batches
    /// instead of one unbounded loop over every deposit ever made.
    uint256 public constant MAX_BATCH = 200;

    IVeMEZO public veMEZO;
    VeBYND  public veBYND;
    IByNdVoter public voter;
    IRewardsDistributor public rewardsDistributor;

    mapping(uint256 => address) public depositorOf;
    mapping(address => uint256[]) private _userTokens;
    mapping(uint256 => uint256) private _tokenIndex;
    uint256[] public allTokenIds;

    event Deposited(address indexed user, uint256 indexed tokenId, uint256 veByndMinted);
    event BatchDeposited(address indexed user, uint256 tokenCount, uint256 totalVeByndMinted);
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
        if (address(voter) != address(0)) {
            try voter.addManagedTokenId(tokenId) {} catch {}
        }
        emit Deposited(msg.sender, tokenId, mintAmount);
    }

    function depositBatch(uint256[] calldata tokenIds) external nonReentrant {
        require(tokenIds.length > 0, "ByNdVault: empty array");
        require(tokenIds.length <= 50, "ByNdVault: max 50 per batch");
        uint256 totalMinted = 0;
        for (uint256 i = 0; i < tokenIds.length; i++) {
            totalMinted += _deposit(tokenIds[i], msg.sender);
        }
        if (address(voter) != address(0)) {
            try voter.addManagedTokenIds(tokenIds) {} catch {}
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
        allTokenIds.push(tokenId);
        veBYND.mint(user, mintAmount);
    }

    /// @notice Extends a caller-supplied batch of deposited tokenIds toward the
    /// 4-year max lock. Callable anytime by anyone (no cooldown) — it is a
    /// harmless no-op for any tokenId that doesn't need extending, so keepers
    /// can call it as often as they like with whatever batch they choose.
    /// @dev Capped at MAX_BATCH tokenIds per call so gas cost never grows with
    /// the size of the vault. Each tokenId's extension is individually
    /// try/caught so one problematic NFT (e.g. an unexpected veMEZO state)
    /// can't block extension of every other NFT in the batch.
    function extendLocks(uint256[] calldata tokenIds) external nonReentrant {
        require(tokenIds.length > 0, "ByNdVault: empty batch");
        require(tokenIds.length <= MAX_BATCH, "ByNdVault: batch too large");

        uint256 newEndTime = block.timestamp + MAXTIME;
        uint256 extendedCount;

        for (uint256 i = 0; i < tokenIds.length; i++) {
            uint256 tokenId = tokenIds[i];
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

    /// @notice Read-only paging helper: returns up to `limit` tokenIds
    /// (starting at `offset` into allTokenIds) whose lock genuinely needs
    /// extending right now. Lets a keeper/frontend check what to pass into
    /// extendLocks() without spending any gas first.
    function tokensNeedingExtend(uint256 offset, uint256 limit)
        external
        view
        returns (uint256[] memory pending, uint256 nextOffset)
    {
        uint256 total = allTokenIds.length;
        if (offset >= total) return (new uint256[](0), total);

        uint256 end = offset + limit;
        if (end > total) end = total;

        uint256[] memory buf = new uint256[](end - offset);
        uint256 count;
        uint256 newEndTime = block.timestamp + MAXTIME;

        for (uint256 i = offset; i < end; i++) {
            uint256 tokenId = allTokenIds[i];
            IVeMEZO.LockedBalance memory lock = veMEZO.locked(tokenId);
            if (!lock.isPermanent && lock.end < newEndTime) {
                buf[count++] = tokenId;
            }
        }

        pending = new uint256[](count);
        for (uint256 i = 0; i < count; i++) pending[i] = buf[i];
        nextOffset = end;
    }

    /// @notice Claims the veMEZO rebase for a caller-supplied batch of
    /// deposited tokenIds (capped at MAX_BATCH). A keeper pages through
    /// allTokenIds in batches rather than this call growing unbounded with
    /// the size of the vault.
    function claimRebases(uint256[] calldata tokenIds) external nonReentrant returns (uint256) {
        require(address(rewardsDistributor) != address(0), "ByNdVault: distributor not set");
        require(tokenIds.length > 0, "ByNdVault: empty batch");
        require(tokenIds.length <= MAX_BATCH, "ByNdVault: batch too large");
        rewardsDistributor.claimMany(tokenIds);
        if (address(voter) != address(0)) {
            try voter.markRebasesClaimed(msg.sender) {} catch {}
        }
        emit RebasesClaimed(msg.sender, tokenIds.length);
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

    /// @dev Paginated variants of the three aggregate views above. The
    /// unpaginated versions loop every deposit ever made and are fine while
    /// the vault is small, but as deposits grow they can exceed an RPC
    /// provider's per-call gas cap and simply time out. Frontends/analytics
    /// should prefer paging + summing these once the vault has meaningful size.
    function totalLockedMEZOPaged(uint256 offset, uint256 limit) external view returns (uint256 total, uint256 nextOffset) {
        uint256 count = allTokenIds.length;
        uint256 end = offset + limit > count ? count : offset + limit;
        for (uint256 i = offset; i < end; i++) {
            IVeMEZO.LockedBalance memory lock = veMEZO.locked(allTokenIds[i]);
            if (lock.amount > 0) total += uint256(uint128(lock.amount));
        }
        nextOffset = end;
    }

    function totalVotingPowerPaged(uint256 offset, uint256 limit) external view returns (uint256 total, uint256 nextOffset) {
        uint256 count = allTokenIds.length;
        uint256 end = offset + limit > count ? count : offset + limit;
        for (uint256 i = offset; i < end; i++) {
            total += veMEZO.votingPowerOfNFT(allTokenIds[i]);
        }
        nextOffset = end;
    }

    function totalPendingRebasePaged(uint256 offset, uint256 limit) external view returns (uint256 total, uint256 nextOffset) {
        if (address(rewardsDistributor) == address(0)) return (0, offset);
        uint256 count = allTokenIds.length;
        uint256 end = offset + limit > count ? count : offset + limit;
        for (uint256 i = offset; i < end; i++) {
            total += rewardsDistributor.claimable(allTokenIds[i]);
        }
        nextOffset = end;
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
        emit VoterSet(_voter);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}