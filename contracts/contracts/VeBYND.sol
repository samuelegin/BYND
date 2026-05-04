// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/// @title  veBYND — Liquid token for the BynD protocol
/// @notice Minted 1:1 (by locked MEZO amount) when a user deposits a veMEZO NFT into ByNdVault. Tradeable on secondary markets (veBYND/MEZO pool on Mezo Swap). Holding veBYND alone earns nothing — stake in ByNdStaking to earn MUSD.
contract VeBYND is ERC20, AccessControl {

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");

    constructor() ERC20("veBYND", "veBYND") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /// @notice Mint veBYND. Only callable by ByNdVault (MINTER_ROLE).
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        _mint(to, amount);
    }

    /// @notice Burn veBYND. Only callable by authorised contracts (BURNER_ROLE).
    function burn(address from, uint256 amount) external onlyRole(BURNER_ROLE) {
        _burn(from, amount);
    }
}