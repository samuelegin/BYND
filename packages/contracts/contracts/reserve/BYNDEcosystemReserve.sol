// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./BYNDReserveBase.sol";

/// @title BYNDEcosystemReserve
/// @notice Ecosystem allocation: 20M BYND cap. Same mechanism as
/// BYNDTreasuryReserve, separate cap and separate deployed contract so the
/// two pools can never draw against each other's budget — for grants,
/// partnerships, integrations, and other controlled ecosystem-growth
/// distributions.
contract BYNDEcosystemReserve is BYNDReserveBase {
    uint256 public constant ECOSYSTEM_CAP = 20_000_000 ether;

    constructor(address admin, address byndToken_)
        BYNDReserveBase(admin, byndToken_, ECOSYSTEM_CAP)
    {}
}
