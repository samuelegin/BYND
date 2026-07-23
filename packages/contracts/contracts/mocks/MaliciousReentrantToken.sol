// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @dev Simulates a non-standard "reward/bribe" ERC20 that executes arbitrary code as part of transfer()/transferFrom() — e.g. ERC777 tokensReceived, a fee-on-transfer-with-callback token, or any other asset whose movement triggers external code. Bynd's harvest pipeline treats any whitelisted gauge token as plain ERC20, so this is the realistic vector for Category 1 (Reentrancy) scenarios that involve "a malicious reward token". The attack is one-shot and filterable by recipient (`requiredTo`) so tests can target a *specific* transfer in a multi-transfer flow (e.g. only the ByNdVoter -> ByNdStaking leg of harvestAndDistribute, not the bribe -> ByNdVoter leg that happens earlier in the same tx).
contract MaliciousReentrantToken is ERC20 {
    address public attackTarget;
    bytes public attackCalldata;
    bool public attackArmed;
    bool public attackOnTransfer;
    bool public attackOnTransferFrom;
    address public requiredTo;

    bool public lastCallSucceeded;
    bytes public lastReturnData;
    uint256 public attackCount;

    constructor() ERC20("Malicious Reward", "EVIL") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /// @notice Arm the one-shot reentrancy hook.
    /// @param target the contract to call back into
    /// @param data the calldata to send
    /// @param onTransfer fire on transfer()
    /// @param onTransferFrom fire on transferFrom()
    /// @param _requiredTo if non-zero, only fire when the transfer's `to` matches this address
    function arm(
        address target,
        bytes calldata data,
        bool onTransfer,
        bool onTransferFrom,
        address _requiredTo
    ) external {
        attackTarget = target;
        attackCalldata = data;
        attackOnTransfer = onTransfer;
        attackOnTransferFrom = onTransferFrom;
        requiredTo = _requiredTo;
        attackArmed = true;
    }

    function disarm() external {
        attackArmed = false;
    }

    function approveOther(address token, address spender, uint256 amount) external {
        IERC20(token).approve(spender, amount);
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        bool ok = super.transfer(to, amount);
        if (attackArmed && attackOnTransfer && (requiredTo == address(0) || to == requiredTo)) {
            _doAttack();
        }
        return ok;
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        bool ok = super.transferFrom(from, to, amount);
        if (attackArmed && attackOnTransferFrom && (requiredTo == address(0) || to == requiredTo)) {
            _doAttack();
        }
        return ok;
    }

    function _doAttack() internal {
        attackArmed = false;
        attackCount++;
        (bool success, bytes memory ret) = attackTarget.call(attackCalldata);
        lastCallSucceeded = success;
        lastReturnData = ret;
    }
}