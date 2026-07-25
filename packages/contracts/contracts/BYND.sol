// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Capped.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/// @title BYND
/// @notice BynD's bootstrap/incentive token.
///
/// This is a brand new, standalone, non-upgradeable contract — it is NOT an
/// upgrade to VeBYND, ByNdVault, ByNdStaking, or ByNdVoter, and has no
/// dependency on any of them. It does not touch, call, or require changes to
/// any existing deployed contract.
///
/// Unlike veBYND (which can only be minted 1:1 against a real deposited
/// veMEZO lock — see ByNdVault._deposit), BYND is NOT backed by anything.
/// It exists purely to bootstrap liquidity and reward participation while
/// the protocol is small — a portion of supply is emitted over time to
/// veBYND stakers and to LPs on the veBYND/MEZO pool, via BYNDEmissions,
/// the only address ever expected to hold MINTER_ROLE.
///
/// Supply is hard-capped on-chain (ERC20Capped) — even if BYNDEmissions had
/// a bug in its decay math, it is structurally impossible to mint past cap.
contract BYND is ERC20Capped, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    /// @param admin      Address that receives DEFAULT_ADMIN_ROLE (can grant/
    ///                   revoke MINTER_ROLE later, e.g. if the emissions
    ///                   contract is ever redeployed).
    /// @param cap_       Hard max supply, in wei (18 decimals). Immutable —
    ///                   cannot be raised later by anyone, admin included.
    constructor(address admin, uint256 cap_)
        ERC20("BynD", "BYND")
        ERC20Capped(cap_)
    {
        require(admin != address(0), "admin=0");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    /// @notice Mint new BYND. Restricted to MINTER_ROLE (intended to be held
    /// only by BYNDEmissions). Reverts automatically past `cap()`.
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        _mint(to, amount);
    }
}
