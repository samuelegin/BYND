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
            amount: int128(int256(1000 ether)),
            end: block.timestamp + 4 * 365 days,
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

    mapping(uint256 => bool) private _voted;
    mapping(uint256 => bool) private _permanentFlagForMergeTest;

    function setVotedForTest(uint256 tokenId, bool voted_) external {
        _voted[tokenId] = voted_;
    }

    /// Lets a test build a permanent lock, which is otherwise unreachable
    /// through mint()/mintCustom(). 115 of these exist on Matsnet, so the
    /// deposit and extend paths have to be exercised against them.
    function setPermanentForTest(uint256 tokenId, bool permanent_) external {
        _locked[tokenId].isPermanent = permanent_;
    }

    function merge(uint256 _from, uint256 _to) external {
        require(_from != _to, "MockVeMEZO: same NFT");
        require(!_voted[_from], "MockVeMEZO: already voted");
        require(!_locked[_from].isPermanent, "MockVeMEZO: permanent lock");
        LockedBalance memory to = _locked[_to];
        require(to.end > block.timestamp || to.isPermanent, "MockVeMEZO: lock expired");

        _locked[_to].amount += _locked[_from].amount;
        delete _locked[_from];
        _burn(_from);
    }
}