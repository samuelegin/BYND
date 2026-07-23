// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract MockVeMEZO is ERC721 {
    struct LockedBalance {
        int128 amount;
        uint256 end;
        bool isPermanent;
    }

    mapping(uint256 => LockedBalance) private _locked;
    uint256 private _nextId = 1;

    constructor() ERC721("Mock veMEZO", "veMEZO") {}

    function mint(address to, uint256 /*tokenId*/) external {
        uint256 id = _nextId++;
        _locked[id] = LockedBalance({
            amount:      int128(int256(1000 ether)),
            end:         block.timestamp + 4 * 365 days,
            isPermanent: false
        });
        _safeMint(to, id);
    }

    function mintCustom(address to, uint256 tokenId, uint256 amount, uint256 end) external {
        _locked[tokenId] = LockedBalance({
            amount: int128(int256(amount)),
            end: end,
            isPermanent: false
        });
        _safeMint(to, tokenId);
    }

    function locked(uint256 tokenId) external view returns (LockedBalance memory) {
        return _locked[tokenId];
    }

    function votingPowerOfNFT(uint256 tokenId) external view returns (uint256) {
        LockedBalance memory l = _locked[tokenId];
        if (l.end <= block.timestamp) return 0;
        return uint256(uint128(l.amount));
    }

    function increaseUnlockTime(uint256 tokenId, uint256 newEnd) external {
        require(_locked[tokenId].end < newEnd, "MockVeMEZO: new end not later");
        _locked[tokenId].end = newEnd;
    }

    function depositFor(uint256 tokenId, uint256 amount) external {
        _locked[tokenId].amount += int128(int256(amount));
    }
}