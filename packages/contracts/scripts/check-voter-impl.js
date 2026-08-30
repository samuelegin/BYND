const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

// ByNdVault's redeployImplementation:'always' fix genuinely worked
// (nextRebaseClaimAt() confirmed real new bytecode). ByNdVoter's equivalent
// still fails on lastSyncedAt() — before guessing again, check its real
// live implementation directly via the Upgraded event log (same reliable
// method that diagnosed the ByNdVault forceImport issue originally),
// rather than trusting "Upgraded. Proxy unchanged" console output alone.
//
// Usage:
//   npx hardhat run scripts/check-voter-impl.js --network mezotestnet

function loadLatestDeployment() {
  const dir = path.join(__dirname, "..", "deployments");
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(`${network.name}-`) && f.endsWith(".json"))
    .sort();
  const latest = files[files.length - 1];
  console.log(`Using deployment record: ${latest}\n`);
  return JSON.parse(fs.readFileSync(path.join(dir, latest), "utf8"));
}

const ERC1967_ABI = ["event Upgraded(address indexed implementation)"];

async function main() {
  const chainId = (await ethers.provider.getNetwork()).chainId;
  if (chainId !== 31611n) throw new Error("Run with --network mezotestnet");

  const deployment = loadLatestDeployment();
  const voterAddr = deployment.contracts.ByNdVoter;

  console.log("=".repeat(60));
  console.log(`ByNdVoter proxy: ${voterAddr}`);
  console.log("=".repeat(60));

  const contract = new ethers.Contract(voterAddr, ERC1967_ABI, ethers.provider);
  let events = [];
  for (const span of [-9999, -5000, -2000]) {
    events = await contract.queryFilter(contract.filters.Upgraded(), span).catch(() => null);
    if (events !== null) break;
  }
  if (events === null || events.length === 0) {
    console.log("No Upgraded events found in the range tried. Widen the range or check an");
    console.log("explorer directly for this address's recent transactions.");
    return;
  }

  console.log(`Found ${events.length} Upgraded event(s):`);
  for (const e of events) {
    const block = await e.getBlock();
    console.log(`  block ${e.blockNumber} (${new Date(block.timestamp * 1000).toISOString()})`);
    console.log(`    tx: ${e.transactionHash}`);
    console.log(`    implementation: ${e.args.implementation}`);
  }

  const last = events[events.length - 1];
  const code = await ethers.provider.getCode(last.args.implementation);
  console.log(`\nMost recent implementation: ${last.args.implementation}`);
  console.log(`Code present: ${code === "0x" ? "NO (0x!) — broken" : `yes, ${code.length} chars`}`);

  console.log(`\nTotal Upgraded events in range: ${events.length}`);
  console.log("If this looks lower than expected given today's two upgrade attempts");
  console.log("(the earlier BYND-16 fix + today's cooldown fix), that's the smoking gun.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
