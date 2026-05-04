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
    }

    function locked(uint256 tokenId) external view returns (LockedBalance memory);

    /// @notice Current voting power of a specific NFT. Decays linearly toward zero as lock approaches expiry.
    function votingPowerOfNFT(uint256 tokenId) external view returns (uint256);

    /// @notice Extend the lock expiry of a tokenId to newEndTime. Caller must own (or be approved for) the NFT.
    // newEndTime must be greater than current end and <= block.timestamp + MAXTIME.
    function increaseUnlockTime(uint256 tokenId, uint256 newEndTime) external;
}

/// @title  ByNdVault — BynD deposit vault
/// @notice Users deposit veMEZO NFTs here.
//         The vault permanently re-locks every NFT to the 4-year maximum
//         via extendLocks() — a permissionless keeper function (once per epoch).
//
//         Mint formula:
//         veBYND minted = locked(tokenId).amount
//         Because BynD immediately extends the lock to MAXTIME, the weight
//         factor is always 1.0 after extension. Minting against raw locked
//         amount (not current VP) avoids inflation from the extendLocks cycle.
//
//         There is NO withdraw() — the NFTs are permanently held.
//         Exit liquidity is via the veBYND/MEZO secondary market pool on Mezo Swap.
contract ByNdVault is IERC721Receiver, ReentrancyGuard, Ownable {

    uint256 public constant MAXTIME = 4 * 365 days;
    uint256 public constant EXTEND_COOLDOWN = 7 days;

    IVeMEZO public immutable veMEZO;
    VeBYND  public immutable veBYND;

    uint256 public lastExtendTimestamp;

    mapping(uint256 => address) public depositorOf;
    mapping(address => uint256[]) private _userTokens;
    mapping(uint256 => uint256) private _tokenIndex;

    /// @dev All tokenIds held by the vault (for extendLocks iteration)
    uint256[] public allTokenIds;

    event Deposited(address indexed user, uint256 indexed tokenId, uint256 veByndMinted);
    event LocksExtended(address indexed keeper, uint256 tokenCount, uint256 newUnlockTime);

    constructor(address _veMEZO, address _veBYND) Ownable(msg.sender) {
        veMEZO = IVeMEZO(_veMEZO);
        veBYND = VeBYND(_veBYND);
    }

    function deposit(uint256 tokenId) external nonReentrant {
        require(veMEZO.ownerOf(tokenId) == msg.sender, "ByNdVault: not owner");

        // Read locked MEZO amount from the live veMEZO contract.
        // locked().amount is int128 — cast to uint256 (always positive for active locks).
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

    function onERC721Received(
        address, address, uint256, bytes calldata
    ) external pure override returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }
}