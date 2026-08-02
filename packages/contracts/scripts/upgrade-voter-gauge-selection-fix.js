const { ethers, upgrades, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

// Upgrades the existing ByNdVoter proxy in place to include the fixed
// gauge-selection logic (bribeReferenceToken + _selectOptimalGauges reading
// each gauge's own bribe contract via gaugeToBribe() + tokenRewardsPerEpoch(),
// instead of the old boostVoter.claimable(gauge) — which almost certainly
// always returned 0 on the real chain since BoostVoter.rewardToken() is
// unset). Then calls setBribeReferenceToken() once, since it defaults to
// the zero address on upgrade (new variables can't run through initialize()
// again). No redeploy, no state migration — same proxy address throughout.
//
// Usage:
//   npx hardhat run scripts/upgrade-voter-gauge-selection-fix.js --network mezotestnet
//
// Optional override:
//   MUSD_ADDRESS=0x... npx hardhat run scripts/upgrade-voter-gauge-selection-fix.js --network mezotestnet

const DEFAULT_MUSD_ADDRESS = "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503";

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

async function main() {
  const chainId = (await ethers.provider.getNetwork()).chainId;
  if (chainId !== 31611n) throw new Error(`Run with --network mezotestnet`);

  const deployment = loadLatestDeployment();
  if (!deployment) throw new Error("No deployment record found in deployments/");
  const voterProxyAddr = deployment.contracts.ByNdVoter;
  const musdAddr = process.env.MUSD_ADDRESS || DEFAULT_MUSD_ADDRESS;

  console.log(`ByNdVoter proxy      : ${voterProxyAddr}`);
  console.log(`Bribe reference token: ${musdAddr} (MUSD)\n`);

  const [signer] = await ethers.getSigners();
  console.log(`Signer               : ${signer.address}`);

  const voterBefore = await ethers.getContractAt("ByNdVoter", voterProxyAddr);
  const governance = await voterBefore.governance();
  if (governance.toLowerCase() !== signer.address.toLowerCase()) {
    throw new Error(
      `Signer (${signer.address}) is not governance (${governance}). ` +
      `Only governance can authorize a UUPS upgrade on ByNdVoter.`
    );
  }

  console.log("=".repeat(60));
  console.log("STEP 1 — Upgrade the ByNdVoter proxy to the new implementation");
  console.log("=".repeat(60));
  const ByNdVoterV2 = await ethers.getContractFactory("ByNdVoter");
  const upgraded = await upgrades.upgradeProxy(voterProxyAddr, ByNdVoterV2);
  await upgraded.waitForDeployment();
  console.log(`Upgraded. Proxy address unchanged: ${await upgraded.getAddress()}`);

  console.log("\n" + "=".repeat(60));
  console.log("STEP 2 — Set the bribe reference token");
  console.log("=".repeat(60));
  const before = await upgraded.bribeReferenceToken();
  console.log(`bribeReferenceToken before: ${before}`);
  if (before.toLowerCase() === musdAddr.toLowerCase()) {
    console.log("Already set correctly — skipping the write.");
  } else {
    const tx = await upgraded.setBribeReferenceToken(musdAddr);
    const receipt = await tx.wait();
    console.log(`setBribeReferenceToken() tx: ${receipt.hash}`);
  }

  console.log("\n" + "=".repeat(60));
  console.log("STEP 3 — Verify it actually landed");
  console.log("=".repeat(60));
  const after = await upgraded.bribeReferenceToken();
  console.log(`bribeReferenceToken now: ${after}`);
  if (after.toLowerCase() === musdAddr.toLowerCase()) {
    console.log(
      "\nDone. Next time optimiseAndVote() runs the auto-select fallback " +
      "(if governance-configured gauges aren't set), it will rank gauges " +
      "by real MUSD bribe totals read directly from each gauge's own bribe " +
      "contract — not the old, likely-always-zero claimable(gauge)."
    );
  } else {
    console.log(
      "\n*** Still doesn't match — the write may have silently failed. " +
      "Investigate before assuming this is fixed."
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
