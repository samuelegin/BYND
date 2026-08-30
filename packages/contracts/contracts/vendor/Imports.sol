// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Hardhat only compiles contracts reachable via an import somewhere in
// this project's own contracts/ tree — a dependency sitting in
// node_modules isn't included just because it exists there. Nothing else
// in this project references TimelockController.sol, so
// scripts/deploy-tokenomics-v2.js's `ethers.getContractFactory
// ("TimelockController")` would fail with a missing-artifact error
// without this file forcing it into the compile. This file deploys
// nothing itself — it exists purely so `npx hardhat compile` produces the
// artifact the deploy script needs.
import "@openzeppelin/contracts/governance/TimelockController.sol";
