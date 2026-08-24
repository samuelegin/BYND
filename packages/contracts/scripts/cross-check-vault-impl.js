const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

// check-vault-alive.js read the EIP-1967 implementation slot as zero — but
// that result depends on getting the slot constant and getStorage() call
// exactly right, and a scripting mistake there would look identical to a
// genuinely broken proxy. This cross-checks with a completely different,
// harder-to-get-wrong method: the standard ERC1967Upgrade `Upgraded`
// event, which every UUPS proxy emits on every successful upgrade. If both
// methods agree, we can trust the result either way.
//
// Usage:
//   npx hardhat run scripts/cross-check-vault-impl.js --network mezotestnet

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

const ERC1967_ABI = ["event Upgraded(address indexed implementation)"];
const EIP1967_IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bb";

async function main() {
  const chainId = (await ethers.provider.getNetwork()).chainId;
  if (chainId !== 31611n) throw new Error(`Run with --network mezotestnet`);

  const deployment = loadLatestDeployment();
  if (!deployment) throw new Error("No deployment record found in deployments/");

  const vaultAddr = deployment.contracts.ByNdVault;
  console.log("=".repeat(60));
  console.log(`Cross-checking ByNdVault proxy: ${vaultAddr}`);
  console.log("=".repeat(60));

  // Method 1: raw storage slot (repeat of check-vault-alive.js, for
  // side-by-side comparison in one run)
  const rawSlot = await ethers.provider.getStorage(vaultAddr, EIP1967_IMPL_SLOT);
  console.log(`Method 1 (raw storage slot):`);
  console.log(`  Raw 32-byte value: ${rawSlot}`);
  const implFromSlot = ethers.getAddress("0x" + rawSlot.slice(-40));
  console.log(`  Decoded address  : ${implFromSlot}`);

  // Method 2: Upgraded event log — completely independent code path.
  console.log(`\nMethod 2 (Upgraded event log, last ~50000 blocks):`);
  const contract = new ethers.Contract(vaultAddr, ERC1967_ABI, ethers.provider);
  const events = await contract.queryFilter(contract.filters.Upgraded(), -50000).catch((e) => {
    console.log(`  getLogs failed / range-limited: ${e.shortMessage || e.message}`);
    return null;
  });

  if (events === null) {
    console.log(`  Could not fetch — RPC likely caps getLogs range. Trying a narrower range...`);
    const eventsNarrow = await contract.queryFilter(contract.filters.Upgraded(), -2000).catch(() => []);
    if (eventsNarrow.length > 0) {
      const last = eventsNarrow[eventsNarrow.length - 1];
      console.log(`  Most recent Upgraded event (last 2000 blocks): implementation = ${last.args.implementation}`);
      console.log(`  Tx: ${last.transactionHash}`);
    } else {
      console.log(`  No Upgraded events found in the last 2000 blocks either.`);
    }
  } else if (events.length === 0) {
    console.log(`  No Upgraded events found in the last ~50000 blocks.`);
  } else {
    console.log(`  Found ${events.length} Upgraded event(s). Full history:`);
    for (const e of events) {
      console.log(`    block ${e.blockNumber}  tx ${e.transactionHash}  implementation = ${e.args.implementation}`);
    }
    const last = events[events.length - 1];
    console.log(`\n  Most recent implementation per event log: ${last.args.implementation}`);

    console.log(`\nComparison:`);
    console.log(`  Storage slot says : ${implFromSlot}`);
    console.log(`  Event log says    : ${last.args.implementation}`);
    if (implFromSlot.toLowerCase() !== last.args.implementation.toLowerCase()) {
      console.log(`  *** MISMATCH — something is genuinely inconsistent, worth extreme caution.`);
    } else {
      console.log(`  Match — both methods agree.`);
    }

    const code = await ethers.provider.getCode(last.args.implementation);
    console.log(`\n  Code at that implementation address: ${code === "0x" ? "NONE (0x)" : `${code.length} bytes`}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
