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
            // A 2-year lock, week-aligned, as a user would realistically create.
            //
            // This used to be `block.timestamp + 4 * 365 days`: a lock the real
            // contract cannot issue at all, since 4*365 days exceeds its
            // 208-week cap. Worse for testing, MAXTIME is a whole number of
            // weeks, so a max-length lock sits exactly where a max-length
            // extension would land -- every default lock read as "already long
            // enough" and skipped the extension path entirely. That is a large
            // part of why BYND-14 stayed invisible through 200 green tests.
            end: ((block.timestamp + 104 weeks) / WEEK) * WEEK,
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

    /// Matches the REAL veMEZO on Matsnet, verified by probing
    /// 0xaCE816CA2bcc9b12C59799dcC5A959Fb9b98111b directly:
    ///
    ///   - `duration` is a DURATION IN SECONDS FROM NOW, not an absolute end
    ///     timestamp. This mock previously took an absolute `newEnd`, which
    ///     encoded the same misreading ByNdVault made, so the two agreed with
    ///     each other and the whole suite passed green against a call that
    ///     reverts 100% of the time on-chain (BYND-14).
    ///   - the resulting end is rounded DOWN to a week boundary
    ///   - it must be strictly later than the current end
    ///   - total lock length is capped at MAXTIME (208 weeks); the real
    ///     contract rejects 4 * 365 days, which is 345600s longer
    uint256 public constant MAXTIME = 208 weeks;
    uint256 public constant WEEK = 1 weeks;

    error LockDurationTooLong();
    error LockDurationNotInFuture();

    error AlreadyVoted();
    error NotApprovedOrOwner();

    function increaseUnlockTime(uint256 tokenId, uint256 duration) external {
        // The real contract gates this on the caller being owner-or-approved and
        // on the token not holding an active gauge vote -- token 829 on Matsnet
        // reverts AlreadyVoted() for exactly this reason.
        if (ownerOf(tokenId) != msg.sender) revert NotApprovedOrOwner();
        if (_voted[tokenId]) revert AlreadyVoted();
        if (duration > MAXTIME) revert LockDurationTooLong();
        uint256 newEnd = ((block.timestamp + duration) / WEEK) * WEEK;
        if (newEnd <= _locked[tokenId].end) revert LockDurationNotInFuture();
        _locked[tokenId].end = newEnd;
    }

    function depositFor(uint256 tokenId, uint256 amount) external {
        _locked[tokenId].amount += int128(int256(amount));
    }

    mapping(uint256 => bool) private _voted;
    mapping(uint256 => bool) private _permanentFlagForMergeTest;

    function voted(uint256 tokenId) external view returns (bool) {
        return _voted[tokenId];
    }

    function setVotedForTest(uint256 tokenId, bool voted_) external {
        _voted[tokenId] = voted_;
    }

    /// Lets a test build a permanent lock, which is otherwise unreachable
    /// through mint()/mintCustom(). 115 of these exist on Matsnet, so the
    /// deposit and extend paths have to be exercised against them.
    function setPermanentForTest(uint256 tokenId, bool permanent_) external {
        _locked[tokenId].isPermanent = permanent_;
    }

    /// Blocks merge() alone, leaving increaseUnlockTime() reachable.
    ///
    /// Tests that need a *straggler* -- a token the vault failed to consolidate,
    /// so it stays in allTokenIds -- previously reached for setVotedForTest.
    /// That now also blocks extension, because the real veMEZO gates both on the
    /// vote (token 829 on Matsnet reverts AlreadyVoted() for merge and for
    /// increaseUnlockTime alike). Cursor tests want the merge failure without
    /// the extension failure, which no single on-chain flag gives them.
    mapping(uint256 => bool) private _mergeBlocked;

    function setMergeBlockedForTest(uint256 tokenId, bool blocked_) external {
        _mergeBlocked[tokenId] = blocked_;
    }

    /// Stands in for BoostVoter.reset(): clears the vote so a merge can proceed.
    /// Lives on this mock purely for test convenience -- on-chain the vote is
    /// BoostVoter state, not veMEZO state.
    function reset(uint256 tokenId) external {
        _voted[tokenId] = false;
    }

    function merge(uint256 _from, uint256 _to) external {
        require(_from != _to, "MockVeMEZO: same NFT");
        require(!_mergeBlocked[_from], "MockVeMEZO: merge blocked");
        require(!_voted[_from], "MockVeMEZO: already voted");
        require(!_locked[_from].isPermanent, "MockVeMEZO: permanent lock");
        LockedBalance memory to = _locked[_to];
        require(to.end > block.timestamp || to.isPermanent, "MockVeMEZO: lock expired");

        _locked[_to].amount += _locked[_from].amount;
        delete _locked[_from];
        _burn(_from);
    }
}