// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./VeBYND.sol";

/// @dev Interface for the veMEZO NFT contract on Mezo Matsnet.
// Proxy: 0xaCE816CA2bcc9b12C59799dcC5A959Fb9b98111b
// Implementation: 0x7bb14c24d1d1bd5eca4c9a6e41e795708ff39c10
interface IVeMEZO is IERC721 {
    struct LockedBalance {
        int128  amount;
        uint256 end;
        bool    isPermanent;
    }

    function locked(uint256 tokenId) external view returns (LockedBalance memory);
    function votingPowerOfNFT(uint256 tokenId) external view returns (uint256);
    function increaseUnlockTime(uint256 tokenId, uint256 newEndTime) external;
    function depositFor(uint256 tokenId, uint256 amount) external;
}

/// @dev Interface for Mezo's RewardsDistributor (rebases for veMEZO holders).
//  Address on Matsnet: 0x2962E8817ae716019F759d098e2caE658bDcAd04
interface IRewardsDistributor {
    /// @notice Claim rebase for a single tokenId.
    ///         If lock hasn't expired, amount is re-deposited into the NFT
    ///         (compounds locked balance — increases voting power).
    function claim(uint256 tokenId) external returns (uint256);

    /// @notice Batch claim for multiple tokenIds. More gas efficient.
    function claimMany(uint256[] calldata tokenIds) external returns (bool);

    /// @notice How much rebase is pending for a tokenId.
    function claimable(uint256 tokenId) external view returns (uint256);
}

/// @title  ByNdVault — BynD deposit vault
/// @notice Users deposit veMEZO NFTs here.The vault permanently re-locks every NFT to the 4-year maximumvia extendLocks() — a permissionless keeper function (once per epoch).
contract ByNdVault is IERC721Receiver, ReentrancyGuard, Ownable {

    uint256 public constant MAXTIME = 4 * 365 days;
    uint256 public constant EXTEND_COOLDOWN = 7 days;

    IVeMEZO public immutable veMEZO;
    VeBYND  public immutable veBYND;

    uint256 public lastExtendTimestamp;

    /// @notice Mezo RewardsDistributor — address on Matsnet: 0x2962E8817ae716019F759d098e2caE658bDcAd04
    IRewardsDistributor public rewardsDistributor;

    event RebasesClaimed(address indexed keeper, uint256 tokenCount, uint256 totalClaimed);
    event RewardsDistributorSet(address indexed distributor);

    mapping(uint256 => address) public depositorOf;
    mapping(address => uint256[]) private _userTokens;
    mapping(uint256 => uint256) private _tokenIndex;

    uint256[] public allTokenIds;

    event Deposited(address indexed user, uint256 indexed tokenId, uint256 veByndMinted);
    event LocksExtended(address indexed keeper, uint256 tokenCount, uint256 newUnlockTime);

    constructor(address _veMEZO, address _veBYND) Ownable(msg.sender) {
        veMEZO = IVeMEZO(_veMEZO);
        veBYND = VeBYND(_veBYND);
    }

    function deposit(uint256 tokenId) external nonReentrant {
        require(veMEZO.ownerOf(tokenId) == msg.sender, "ByNdVault: not owner");
        IVeMEZO.LockedBalance memory lock = veMEZO.locked(tokenId);
        require(lock.amount > 0, "ByNdVault: empty lock");
        require(lock.end > block.timestamp, "ByNdVault: lock expired");

        uint256 mintAmount = uint256(uint128(lock.amount));
        veMEZO.safeTransferFrom(msg.sender, address(this), tokenId);

        depositorOf[tokenId]  = msg.sender;
        _tokenIndex[tokenId]  = _userTokens[msg.sender].length;
        _userTokens[msg.sender].push(tokenId);
        allTokenIds.push(tokenId);
        veBYND.mint(msg.sender, mintAmount);

        emit Deposited(msg.sender, tokenId, mintAmount);
    }

    function extendLocks() external {
        require(
            block.timestamp >= lastExtendTimestamp + EXTEND_COOLDOWN,
            "ByNdVault: cooldown active"
        );
        lastExtendTimestamp = block.timestamp;

        uint256 newEndTime = block.timestamp + MAXTIME;
        uint256 count = allTokenIds.length;

        for (uint256 i = 0; i < count; i++) {
            uint256 tokenId = allTokenIds[i];
            IVeMEZO.LockedBalance memory lock = veMEZO.locked(tokenId);

            if (lock.end < newEndTime) {
                veMEZO.increaseUnlockTime(tokenId, newEndTime);
            }
        }

        emit LocksExtended(msg.sender, count, newEndTime);
    }

    /// @notice This is the raw mint-basis figure, not current decayed VP.
    function totalLockedMEZO() external view returns (uint256 total) {
        for (uint256 i = 0; i < allTokenIds.length; i++) {
            IVeMEZO.LockedBalance memory lock = veMEZO.locked(allTokenIds[i]);
            if (lock.amount > 0) {
                total += uint256(uint128(lock.amount));
            }
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

    /// @notice Governance sets the RewardsDistributor address (once after deploy).
    function setRewardsDistributor(address _distributor) external onlyOwner {
        require(_distributor != address(0), "ByNdVault: zero address");
        rewardsDistributor = IRewardsDistributor(_distributor);
        emit RewardsDistributorSet(_distributor);
    }

    /// @notice Permissionless keeper function — claims veMEZO rebases for all
    ///         deposited NFTs. Rebases are auto-compounded back into each NFT
    ///         (the RewardsDistributor calls ve.depositFor on our behalf),
    ///         growing locked MEZO balance and therefore BynD's voting power.
    ///
    ///         Stakers benefit indirectly: more locked MEZO → more voting power
    ///         → more bribe yield each epoch.
    ///
    ///         No tokens are transferred out of the vault by this function.
    ///         Call once per epoch, any time after epoch flip.
    function claimRebases() external nonReentrant returns (uint256 totalClaimed) {
        require(address(rewardsDistributor) != address(0), "ByNdVault: distributor not set");
        uint256 count = allTokenIds.length;
        require(count > 0, "ByNdVault: no deposits");

        // claimMany is more gas-efficient than looping claim()
        // It returns true on success; individual token amounts not surfaced
        rewardsDistributor.claimMany(allTokenIds);

        // For event accounting: sum claimable before call would be ideal but
        // costs extra reads — emit count as proxy for transparency
        emit RebasesClaimed(msg.sender, count, 0);
        return 0; // rebase compounds in-place; no liquid amount to return
    }

    /// @notice View: total pending rebase across all deposited NFTs.
    function totalPendingRebase() external view returns (uint256 total) {
        if (address(rewardsDistributor) == address(0)) return 0;
        for (uint256 i = 0; i < allTokenIds.length; i++) {
            total += rewardsDistributor.claimable(allTokenIds[i]);
        }
    }

    function onERC721Received(
        address, address, uint256, bytes calldata
    ) external pure override returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }
}