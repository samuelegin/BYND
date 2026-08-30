const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

// Same method as cross-check-vault-impl.js, extended to cover both proxies.
// The EIP-1967 storage slot read has come back zero for this project before
// even on a genuinely working proxy (see cross-check-vault-impl.js's own
// comment), so we lean on the Upgraded event log as the trustworthy source
// here rather than the raw slot.
//
// Usage:
//   npx hardhat run scripts/cross-check-both-impls.js --network mezotestnet

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

async function checkOne(name, addr) {
  console.log("=".repeat(60));
  console.log(`Checking ${name} proxy: ${addr}`);
  console.log("=".repeat(60));

  const contract = new ethers.Contract(addr, ERC1967_ABI, ethers.provider);

  let events = await contract
    .queryFilter(contract.filters.Upgraded(), -50000)
    .catch((e) => {
      console.log(`  getLogs (50000 blocks) failed: ${e.shortMessage || e.message}`);
      return null;
    });

  if (events === null || events.length === 0) {
    console.log(`  Trying narrower range (last 2000 blocks)...`);
    events = await contract.queryFilter(contract.filters.Upgraded(), -2000).catch(() => []);
  }

  if (!events || events.length === 0) {
    console.log(`  No Upgraded events found. Trying from block 0 (may be slow)...`);
    events = await contract.queryFilter(contract.filters.Upgraded(), 0).catch((e) => {
      console.log(`  Full-range query also failed: ${e.shortMessage || e.message}`);
      return [];
    });
  }

  if (!events || events.length === 0) {
    console.log(`  Still nothing. This proxy may never have emitted Upgraded,`);
    console.log(`  or this RPC's getLogs is unreliable for this range.`);
    return;
  }

  console.log(`  Found ${events.length} Upgraded event(s):`);
  for (const e of events) {
    console.log(`    block ${e.blockNumber}  tx ${e.transactionHash}  implementation = ${e.args.implementation}`);
  }

  const last = events[events.length - 1];
  console.log(`\n  Most recent implementation: ${last.args.implementation}`);

  const code = await ethers.provider.getCode(last.args.implementation);
  console.log(`  Code at that address: ${code === "0x" ? "NONE (0x) -- suspicious" : `${code.length} chars`}`);
  console.log("");
}

async function main() {
  const chainId = (await ethers.provider.getNetwork()).chainId;
  if (chainId !== 31611n) throw new Error(`Run with --network mezotestnet`);

  const deployment = loadLatestDeployment();
  if (!deployment) throw new Error("No deployment record found in deployments/");

  await checkOne("ByNdVault", deployment.contracts.ByNdVault);
  await checkOne("ByNdVoter", deployment.contracts.ByNdVoter);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
