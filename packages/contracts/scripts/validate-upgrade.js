// Storage-layout compatibility gate for the live UUPS proxies.
//
// This is the check that actually matters before a Matsnet or mainnet upgrade.
// `npx hardhat test` deploys fresh proxies every run, so it can never catch a
// layout violation against the DEPLOYED implementations — it only ever sees the
// current source talking to itself. upgrades.validateUpgrade() compares the new
// implementation against the recorded layout in .openzeppelin/ and throws on any
// reordering, removal, type change, or new base contract.
//
// Usage:
//   npx hardhat run scripts/validate-upgrade.js --network mezotestnet
//
// Read-only: deploys nothing, sends no transactions, needs no signer with funds.
// A clean run is real evidence the upgrade is layout-safe. A throw is a hard
// stop — do not upgrade past it.

const { ethers, upgrades, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

// ByNdVoter links external libraries by address at compile time, so building
// its factory needs SOME address for each. Validation only reads the layout, so
// any non-zero placeholder works when the deployment record has no real one.
const PLACEHOLDER = "0x0000000000000000000000000000000000000001";

function loadLatestDeployment() {
  const dir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(`${network.name}-`) && f.endsWith(".json"))
    .sort();
  if (files.length === 0) return null;
  const latest = files[files.length - 1];
  console.log(`Deployment record: ${latest}\n`);
  return JSON.parse(fs.readFileSync(path.join(dir, latest), "utf8"));
}

async function main() {
  const deployment = loadLatestDeployment();
  if (!deployment) {
    throw new Error(
      `No deployment record for network "${network.name}" in deployments/. ` +
        `Run with --network mezotestnet (or whichever network holds the proxies).`
    );
  }

  const c = deployment.contracts;
  const targets = [
    {
      name: "ByNdVoter",
      proxy: c.ByNdVoter,
      opts: {
        libraries: {
          GaugeScan: c.GaugeScan || PLACEHOLDER,
          HarvestLib: c.HarvestLib || PLACEHOLDER,
        },
      },
      validateOpts: { unsafeAllow: ["external-library-linking"] },
    },
    { name: "ByNdVault", proxy: c.ByNdVault },
    { name: "ByNdStaking", proxy: c.ByNdStaking },
    { name: "VeBYND", proxy: c.VeBYND },
  ];

  let failed = 0;
  let checked = 0;

  for (const t of targets) {
    if (!t.proxy) {
      console.log(`${t.name.padEnd(12)} SKIP  (not in the deployment record)`);
      continue;
    }
    const factory = await ethers.getContractFactory(t.name, t.opts);
    try {
      await upgrades.validateUpgrade(t.proxy, factory, {
        kind: "uups",
        ...(t.validateOpts || {}),
      });
      console.log(`${t.name.padEnd(12)} OK    ${t.proxy}`);
      checked++;
    } catch (e) {
      failed++;
      console.error(`${t.name.padEnd(12)} FAIL  ${t.proxy}`);
      console.error(`  ${e.message.split("\n").join("\n  ")}\n`);
    }
  }

  console.log();
  if (failed > 0) {
    console.error(
      `${failed} contract(s) are NOT layout-compatible with what is deployed. ` +
        `Upgrading would corrupt storage — fix the layout before going further.`
    );
    process.exitCode = 1;
  } else {
    console.log(
      `All ${checked} proxy implementation(s) are storage-layout compatible.`
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
