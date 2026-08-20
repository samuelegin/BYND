const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

// check-vault-alive.js's "implementation is zero" result was a false alarm
// caused by a bug in that script itself: the EIP-1967 slot constant was
// missing its final hex character (63 chars instead of 64), which corrupted
// every byte read from storage. This script fixes that constant AND, more
// importantly, does the simplest possible check with zero slot arithmetic:
// getCode() directly on the implementation address the Upgraded event log
// already gave us (0x6a3Ad93E77FEE3C1D4debf963fc019657C1307bE).
//
// Usage:
//   npx hardhat run scripts/check-vault-alive-v2.js --network mezotestnet

function loadLatestDeployment() {
  const dir = path.join(__dirname, "..", "deployments");
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(`${network.name}-`) && f.endsWith(".json"))
    .sort();
  if (files.length === 0) return null;
  const latest = files[files.length - 1];
  console.log(`Using deployment record: ${latest}\n`);
  return JSON.parse(fs.readFileSync(path.join(dir, latest), "utf8"));
}

// Corrected — verified independently via keccak256("eip1967.proxy.implementation") - 1.
const EIP1967_IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

async function main() {
  const chainId = (await ethers.provider.getNetwork()).chainId;
  if (chainId !== 31611n) throw new Error(`Run with --network mezotestnet`);

  const deployment = loadLatestDeployment();
  if (!deployment) throw new Error("No deployment record found in deployments/");

  const vaultAddr = deployment.contracts.ByNdVault;
  console.log("=".repeat(60));
  console.log(`Checking ByNdVault proxy: ${vaultAddr}`);
  console.log("=".repeat(60));

  // Method A: the simplest possible check. The Upgraded event log already
  // told us the implementation is 0x6a3Ad93E77FEE3C1D4debf963fc019657C1307bE
  // — just check for code there directly. No slot math to get wrong.
  const eventImplAddr = "0x6a3Ad93E77FEE3C1D4debf963fc019657C1307bE";
  const codeAtEventImpl = await ethers.provider.getCode(eventImplAddr);
  console.log(`Method A — getCode() on the Upgraded event's address directly:`);
  console.log(`  Address: ${eventImplAddr}`);
  console.log(`  Code   : ${codeAtEventImpl === "0x" ? "NONE (0x) — genuinely no contract here" : `${codeAtEventImpl.length} chars of bytecode present`}`);

  // Method B: corrected EIP-1967 slot read, for cross-validation.
  const rawSlot = await ethers.provider.getStorage(vaultAddr, EIP1967_IMPL_SLOT);
  console.log(`\nMethod B — corrected EIP-1967 slot read:`);
  console.log(`  Raw value: ${rawSlot} (${rawSlot.length} chars)`);
  const implFromSlot = ethers.getAddress("0x" + rawSlot.slice(-40));
  console.log(`  Decoded  : ${implFromSlot}`);
  const codeAtSlotImpl = await ethers.provider.getCode(implFromSlot);
  console.log(`  Code     : ${codeAtSlotImpl === "0x" ? "NONE (0x)" : `${codeAtSlotImpl.length} chars of bytecode present`}`);

  console.log(`\nComparison: event log address vs corrected slot address`);
  console.log(`  Match: ${eventImplAddr.toLowerCase() === implFromSlot.toLowerCase()}`);

  // Method C: an actual read through the proxy — the real test that matters.
  console.log(`\nMethod C — real read through the proxy:`);
  try {
    const vault = await ethers.getContractAt("ByNdVault", vaultAddr);
    const owner = await vault.owner();
    const voterAddr = await vault.voter();
    console.log(`  vault.owner() : ${owner}`);
    console.log(`  vault.voter() : ${voterAddr}`);
    console.log(`\n*** ByNdVault is ALIVE and responding correctly through the proxy.`);
  } catch (err) {
    console.log(`  FAILED: ${err.shortMessage || err.message}`);
    console.log(`\n*** ByNdVault reads are genuinely broken right now.`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
