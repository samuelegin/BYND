// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./BYNDVestingFactoryBase.sol";

/// @title BYNDTeamVesting
/// @notice Team allocation pool: 10M BYND cap, 0% unlocked at TGE, 12-month
/// cliff, then 36-month linear vesting.
///
/// The cliff and duration are hardcoded constants, not parameters
/// createTeamGrant() accepts — this is deliberate. Team vesting terms are
/// fixed company-wide policy, not something that should vary per grant or
/// be re-typed correctly by governance every time; hardcoding removes the
/// entire class of "someone fat-fingered the wrong duration for this one
/// grant" mistake.
contract BYNDTeamVesting is BYNDVestingFactoryBase {
    uint256 public constant TEAM_POOL_CAP = 10_000_000 ether;

    uint64 public constant CLIFF_DURATION = 365 days;
    uint64 public constant VESTING_DURATION = 1095 days; // 36 * ~30.4 days

    /// @notice Token-generation-event timestamp this pool's cliff is
    /// measured from. Passed explicitly at deployment rather than assumed
    /// to be block.timestamp at deploy time, since this contract may be
    /// deployed slightly before or after the actual TGE — being explicit
    /// here removes that ambiguity.
    uint64 public immutable tgeTimestamp;

    constructor(
        address admin,
        address byndToken_,
        uint64 tgeTimestamp_
    ) BYNDVestingFactoryBase(admin, byndToken_, TEAM_POOL_CAP) {
        require(tgeTimestamp_ > 0, "tge=0");
        tgeTimestamp = tgeTimestamp_;
    }

    /// @notice Create a team member's vesting grant: 0% liquid immediately,
    /// nothing releasable until 12 months after TGE, then linear over the
    /// following 36 months.
    function createTeamGrant(address beneficiary, uint256 amount)
        external
        onlyRole(TIMELOCK_ROLE)
        returns (address wallet)
    {
        uint64 start = tgeTimestamp + CLIFF_DURATION;
        wallet = _createGrant(beneficiary, amount, start, VESTING_DURATION);
    }
}
