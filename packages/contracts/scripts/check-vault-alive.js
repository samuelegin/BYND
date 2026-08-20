const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

// Run 2's ByNdVault upgrade failed with "No contract at address ...
// (Removed from manifest)" — the OpenZeppelin manifest had a cached
// implementation-hash entry from Run 1 pointing at an address that no
// longer has code. Before touching anything else, confirm the proxy itself
// still works: if Run 1's upgradeTo call pointed at that now-empty address
// (e.g. due to a testnet reorg dropping the implementation deployment),
// every call to ByNdVault would currently be broken.
//
// Usage:
//   npx hardhat run scripts/check-vault-alive.js --network mezotestnet

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

// The EIP-1967 implementation slot every UUPS proxy stores its
// implementation address in — reading it directly bypasses the proxy
// entirely, so this can't be fooled by a broken delegatecall.
const EIP1967_IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bb";

async function main() {
  const chainId = (await ethers.provider.getNetwork()).chainId;
  if (chainId !== 31611n) throw new Error(`Run with --network mezotestnet`);

  const deployment = loadLatestDeployment();
  if (!deployment) throw new Error("No deployment record found in deployments/");

  const vaultAddr = deployment.contracts.ByNdVault;
  console.log("=".repeat(60));
  console.log(`Checking ByNdVault proxy: ${vaultAddr}`);
  console.log("=".repeat(60));

  const rawSlot = await ethers.provider.getStorage(vaultAddr, EIP1967_IMPL_SLOT);
  const implAddr = ethers.getAddress("0x" + rawSlot.slice(-40));
  console.log(`Implementation address (from EIP-1967 slot): ${implAddr}`);

  const implCode = await ethers.provider.getCode(implAddr);
  const hasCode = implCode !== "0x";
  console.log(`Implementation has code: ${hasCode} (${implCode.length} bytes of calldata returned)`);

  if (!hasCode) {
    console.log("\n*** BROKEN. The proxy points at an implementation with no code.");
    console.log("*** Every call to ByNdVault will revert right now, including reading");
    console.log("*** the 900 MUSD balance. Do not attempt anything else — this needs");
    console.log("*** manual recovery (re-pointing the proxy at a working implementation)");
    console.log("*** before any other script will help.");
    return;
  }

  // Implementation has code — try an actual read through the proxy to be sure.
  console.log("\nImplementation has code. Trying a real read through the proxy...");
  const vault = await ethers.getContractAt("ByNdVault", vaultAddr);
  try {
    const owner = await vault.owner();
    const voterAddr = await vault.voter();
    console.log(`vault.owner() : ${owner}`);
    console.log(`vault.voter() : ${voterAddr}`);
    console.log("\n*** ByNdVault is alive and responding correctly. Safe to proceed.");
  } catch (err) {
    console.log(`\n*** Read through the proxy FAILED even though the implementation has`);
    console.log(`*** code: ${err.shortMessage || err.message}`);
    console.log(`*** This needs investigation before proceeding further.`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
