// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./BYNDVestingFactoryBase.sol";

/// @title BYNDInvestorVesting
/// @notice Investor allocation pool: 10M BYND cap maximum. Unlike team
/// grants, investor terms are deal-specific (negotiated per round/investor)
/// rather than one fixed company-wide policy, so the schedule is a
/// parameter governance sets per grant instead of a hardcoded constant.
///
/// MIN_VESTING_DURATION exists as a guardrail, not a real constraint on
/// legitimate deal terms: the brief is explicit that investor allocations
/// must not become immediately fully liquid, so a grant with a near-zero
/// duration (which would make the tokens releasable almost immediately,
/// defeating the entire purpose of using a vesting mechanism at all) is
/// rejected outright rather than trusted to governance's judgment alone.
contract BYNDInvestorVesting is BYNDVestingFactoryBase {
    uint256 public constant INVESTOR_POOL_CAP = 10_000_000 ether;

    /// @dev Floor only — real investor schedules are expected to run
    /// considerably longer than this in practice. Exists to make a
    /// mistaken or abusive near-instant-unlock grant revert outright
    /// rather than silently succeed.
    uint64 public constant MIN_VESTING_DURATION = 180 days;

    constructor(
        address admin,
        address byndToken_
    ) BYNDVestingFactoryBase(admin, byndToken_, INVESTOR_POOL_CAP) {}

    /// @notice Create an investor's vesting grant with deal-specific terms.
    /// @param start Unix timestamp the linear release begins at — set this
    /// in the future for a cliff (identical mechanism to the team pool,
    /// just not hardcoded here), or to TGE for a schedule with no cliff.
    /// @param duration Total linear release window, from `start` to
    /// `start + duration`. Must be at least MIN_VESTING_DURATION.
    function createInvestorGrant(
        address beneficiary,
        uint256 amount,
        uint64 start,
        uint64 duration
    ) external onlyRole(TIMELOCK_ROLE) returns (address wallet) {
        require(duration >= MIN_VESTING_DURATION, "duration below minimum");
        wallet = _createGrant(beneficiary, amount, start, duration);
    }
}
