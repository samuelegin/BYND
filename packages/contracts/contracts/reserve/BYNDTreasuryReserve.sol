// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./BYNDReserveBase.sol";

/// @title BYNDTreasuryReserve
/// @notice Treasury allocation: 15M BYND cap. Not automatically
/// circulating — every BYND released through this contract required an
/// explicit, timelock-authorized release() call.
contract BYNDTreasuryReserve is BYNDReserveBase {
    uint256 public constant TREASURY_CAP = 15_000_000 ether;

    constructor(address admin, address byndToken_)
        BYNDReserveBase(admin, byndToken_, TREASURY_CAP)
    {}
}
