// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "../BYND.sol";

/// @title BYNDReserveBase
/// @notice Shared machinery for BYNDTreasuryReserve and BYNDEcosystemReserve.
///
/// Deliberately NOT a vesting contract — the brief's requirement here is
/// "not automatically circulating, requires explicit distribution," not a
/// time-based unlock curve. So this is a much simpler primitive: a capped,
/// timelock-gated mint. Nothing is pre-minted or held in escrow; a release
/// mints directly to its recipient at the moment governance authorizes it.
/// totalReleased only grows when tokens actually go somewhere real, which
/// is a more literal reading of "not automatically circulating" than
/// minting the full 15M/20M upfront and letting it sit unspent — an
/// observer checking BYND.totalSupply() at any time sees exactly what has
/// actually been distributed, not a large idle balance implying more
/// circulation than genuinely exists.
///
/// Every release requires a `reason` string, recorded in the event log —
/// a lightweight, on-chain accountability trail for what "explicit
/// treasury distribution" actually was used for over time. Not a
/// governance-process replacement (the real decision-making — proposals,
/// votes, multisig sign-off — happens off-chain or in whatever governance
/// system holds TIMELOCK_ROLE), just a permanent record of the outcome.
abstract contract BYNDReserveBase is AccessControl {
    /// @dev Same reasoning as BYNDEmissions/BYNDVestingFactoryBase:
    /// distributing reserve funds is a monetary-policy-adjacent decision,
    /// gated to a timelock/governance address, never a bare EOA.
    bytes32 public constant TIMELOCK_ROLE = keccak256("TIMELOCK_ROLE");

    BYND public immutable byndToken;

    /// @notice Hard cap on cumulative BYND ever released through this
    /// reserve. Set once at deployment — separate constant per concrete
    /// contract (15M treasury, 20M ecosystem), never shared, so one
    /// reserve can never draw against the other's budget.
    uint256 public immutable reserveCap;

    /// @notice Cumulative BYND released through this reserve so far.
    uint256 public totalReleased;

    event Released(address indexed to, uint256 amount, string reason);

    constructor(address admin, address byndToken_, uint256 reserveCap_) {
        require(admin != address(0), "admin=0");
        require(byndToken_ != address(0), "bynd=0");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        byndToken = BYND(byndToken_);
        reserveCap = reserveCap_;
        // TIMELOCK_ROLE deliberately NOT granted to `admin` — grant it to
        // the real timelock address after deployment, same as every other
        // monetary-policy contract in this system.
    }

    /// @notice How much of this reserve's cap is left to release.
    function remainingCap() public view returns (uint256) {
        return totalReleased >= reserveCap ? 0 : reserveCap - totalReleased;
    }

    /// @notice Mint `amount` BYND directly to `to`, against this reserve's
    /// cap. `reason` is required and stored only in the event log (not
    /// state — no reason to pay ongoing storage cost for a text field
    /// nothing on-chain needs to read back later).
    function release(address to, uint256 amount, string calldata reason) external onlyRole(TIMELOCK_ROLE) {
        require(to != address(0), "to=0");
        require(amount > 0, "amount=0");
        require(bytes(reason).length > 0, "reason required");
        require(totalReleased + amount <= reserveCap, "exceeds reserve cap");

        totalReleased += amount;
        byndToken.mint(to, amount);
        emit Released(to, amount, reason);
    }
}
