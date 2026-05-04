// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @dev Mock of BoostVoter at 0x21d7bDF5a5929AD179F8cA0c9014A0B62ae6Bfd1
///      Supports all functions called by ByNdVoter including the new read functions.
contract MockValidatorsVoter {
    using SafeERC20 for IERC20;

    IERC20 public immutable musd;

    address[] private _gauges;
    mapping(address => address) public gaugeToBribe;
    mapping(address => bool)    public isAlive;
    mapping(address => bool)    public isWhitelistedToken;
    mapping(address => uint256) public claimable;
    mapping(address => uint256) public pendingBribes;

    constructor(address _musd) {
        musd = IERC20(_musd);
    }

    // ── Write ──────────────────────────────────────────────────────────────────

    function vote(uint256, address[] calldata, uint256[] calldata) external {}

    function claimBribes(
        address[] calldata bribes,
        address[][] calldata,
        uint256
    ) external {
        for (uint256 i = 0; i < bribes.length; i++) {
            uint256 amount = pendingBribes[bribes[i]];
            if (amount > 0) {
                pendingBribes[bribes[i]] = 0;
                musd.safeTransfer(msg.sender, amount);
            }
        }
    }

    // ── Read (mirrors BoostVoter) ──────────────────────────────────────────────

    function gauges(uint256 index) external view returns (address) {
        return _gauges[index];
    }

    function length() external view returns (uint256) {
        return _gauges.length;
    }

    // ── Test helpers ───────────────────────────────────────────────────────────

    /// Register a gauge (mirrors BoostVoter.createBoostGauge)
    function addGauge(address gauge, address bribe) external {
        _gauges.push(gauge);
        gaugeToBribe[gauge] = bribe;
        isAlive[gauge]      = true;
    }

    function whitelistToken(address token) external {
        isWhitelistedToken[token] = true;
    }

    function seedBribe(address gauge, uint256 amount) external {
        musd.safeTransferFrom(msg.sender, address(this), amount);
        pendingBribes[gauge] += amount;
        claimable[gauge]     += amount;
    }

    function killGauge(address gauge) external {
        isAlive[gauge] = false;
    }
}
