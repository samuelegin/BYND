// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";

/// @dev Mock veMEZO NFT for local testing, it uses ERC721Enumerable so the frontend can call tokenOfOwnerByIndex().
contract MockVeMEZO is ERC721Enumerable {

    struct LockedBalance {
        int128  amount;
        uint256 end;
    }

    mapping(uint256 => LockedBalance) private _locked;
    uint256 private constant DEFAULT_LOCK_END = 4 * 365 days;

    constructor() ERC721("Mock veMEZO", "veMEZO") {}

    /// @notice Mint an NFT with a simulated lock. lockedAmount = tokenId * 1000 ether (1000 MEZO per tokenId unit).
    function mint(address to, uint256 tokenId) external {
        _mint(to, tokenId);
        _locked[tokenId] = LockedBalance({
            amount: int128(int256(tokenId * 1000 ether)),
            end:    block.timestamp + DEFAULT_LOCK_END
        });
    }

    /// @notice Mint with a custom locked amount and end time.
    function mintCustom(address to, uint256 tokenId, int128 amount, uint256 end) external {
        _mint(to, tokenId);
        _locked[tokenId] = LockedBalance({ amount: amount, end: end });
    }

    function locked(uint256 tokenId) external view returns (LockedBalance memory) {
        return _locked[tokenId];
    }

    function votingPowerOfNFT(uint256 tokenId) external view returns (uint256) {
        LockedBalance memory lb = _locked[tokenId];
        if (lb.amount <= 0 || lb.end <= block.timestamp) return 0;
        uint256 MAXTIME  = 4 * 365 days;
        uint256 timeLeft = lb.end - block.timestamp;
        uint256 rawAmount = uint256(uint128(lb.amount));
        return (rawAmount * timeLeft) / MAXTIME;
    }

    function increaseUnlockTime(uint256 tokenId, uint256 newEndTime) external {
        require(
            ownerOf(tokenId) == msg.sender || getApproved(tokenId) == msg.sender,
            "MockVeMEZO: not approved"
        );
        require(newEndTime > _locked[tokenId].end, "MockVeMEZO: end not increasing");
        _locked[tokenId].end = newEndTime;
    }
}