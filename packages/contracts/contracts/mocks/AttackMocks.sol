// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

interface IExtendLocksCallback {
    function extendLocks() external;
}

contract MaliciousVeMEZO is ERC721 {
    struct LockedBalance {
        int128 amount;
        uint256 end;
        bool isPermanent;
    }

    mapping(uint256 => LockedBalance) private _locked;
    uint256 private _nextId = 1;

    address public reentryTarget;
    uint256 public armedTokenId;

    constructor() ERC721("Malicious veMEZO", "mveMEZO") {}

    /// Arms exactly one tokenId, rather than a boolean that disarms itself on
    /// first use. The reentrant call reverts, and that revert rolls back any
    /// `armed = false` written before it -- so a flag re-arms for every
    /// subsequent token in the batch, turning a single-token attack into a
    /// whole-batch failure and masking what the test is actually asserting.
    function arm(address target, uint256 tokenId) external {
        reentryTarget = target;
        armedTokenId  = tokenId;
    }

    function mint(address to, uint256 /*tokenId*/) external {
        uint256 id = _nextId++;
        _locked[id] = LockedBalance({
            amount: int128(int256(1000 ether)),
            end: block.timestamp + 30 days,
            isPermanent: false
        });
        _safeMint(to, id);
    }

    function locked(uint256 tokenId) external view returns (LockedBalance memory) {
        return _locked[tokenId];
    }

    function votingPowerOfNFT(uint256 tokenId) external view returns (uint256) {
        LockedBalance memory l = _locked[tokenId];
        if (l.end <= block.timestamp) return 0;
        return uint256(uint128(l.amount));
    }

    function increaseUnlockTime(uint256 tokenId, uint256 duration) external {
        if (reentryTarget != address(0) && tokenId == armedTokenId) {
            IExtendLocksCallback(reentryTarget).extendLocks();
        }
        // Duration semantics, matching the real veMEZO (BYND-14). This mock
        // previously took an absolute end, so with a correct caller every
        // extension attempt failed.
        require(duration <= MAXTIME, "MaliciousVeMEZO: too long");
        uint256 newEnd = ((block.timestamp + duration) / WEEK) * WEEK;
        require(_locked[tokenId].end < newEnd, "MaliciousVeMEZO: new end not later");
        _locked[tokenId].end = newEnd;
    }

    uint256 public constant MAXTIME = 208 weeks;
    uint256 public constant WEEK = 1 weeks;

    function depositFor(uint256 tokenId, uint256 amount) external {
        _locked[tokenId].amount += int128(int256(amount));
    }
}

interface IExtendable {
    function extendLocks() external;
}

contract RelayerCaller {
    function relayExtendLocks(address vault) external {
        IExtendable(vault).extendLocks();
    }
}

contract MockRewardsDistributor {
    function claim(uint256) external pure returns (uint256) { return 0; }
    function claimMany(uint256[] calldata) external pure returns (bool) { return true; }
    function claimable(uint256) external pure returns (uint256) { return 0; }
}