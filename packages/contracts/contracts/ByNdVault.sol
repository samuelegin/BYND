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
    function markRebasesClaimed(address keeper) external;
    function markLocksExtended() external;
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
        require(lock.isPermanent || lock.end > block.timestamp, "ByNdVault: lock expired");
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
            try voter.addManagedTokenId(tokenId) {} catch {}
        }
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

        uint256 count = allTokenIds.length;
        if (count > MAX_BATCH) count = MAX_BATCH;

        for (uint256 i = 0; i < count; i++) {
            uint256 tokenId = allTokenIds[i];
            IVeMEZO.LockedBalance memory lock = veMEZO.locked(tokenId);

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

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}
