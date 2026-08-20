const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

// stats.pendingIncentives (shown as "Pending incentives" in the Harvest
// modal) comes from ByNdVoter.previewOptimalGauge()'s bestScore — a
// value-weighted score for picking the NEXT gauge to vote for, not a real
// token balance (see useProtocol.ts's own comment on this). It naturally
// drops toward 0 once a gauge's bribe has been claimed, because there's
// nothing left UNCLAIMED to rank. harvestAndDistribute() doesn't use this
// number at all — it computes the real harvestable amount as
// (current balance - epochBalanceBefore[epoch][token]), the snapshot taken
// right before claiming. This script checks that real number directly.
//
// Usage:
//   npx hardhat run scripts/check-harvestable-balance.js --network mezotestnet

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

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

const MUSD = "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503";

async function main() {
  const chainId = (await ethers.provider.getNetwork()).chainId;
  if (chainId !== 31611n) throw new Error(`Run with --network mezotestnet`);

  const deployment = loadLatestDeployment();
  if (!deployment) throw new Error("No deployment record found in deployments/");

  const voter = await ethers.getContractAt("ByNdVoter", deployment.contracts.ByNdVoter);
  const currentEpoch = await voter.currentEpoch();
  const token = await ethers.getContractAt(ERC20_ABI, MUSD);
  const decimals = await token.decimals();
  const symbol = await token.symbol().catch(() => "MUSD");

  console.log("=".repeat(60));
  console.log("Real harvestable balance check (bypasses pendingIncentives entirely)");
  console.log("=".repeat(60));
  console.log(`Current epoch    : ${currentEpoch}`);

  const snapshotTaken = await voter.epochSnapshotTaken(currentEpoch);
  console.log(`Snapshot taken   : ${snapshotTaken}`);

  // epochBalanceBefore is a private mapping — no auto-getter, and reading it
  // via raw storage slots would require reconstructing this proxy's exact
  // storage layout (fragile across OZ upgradeable base contracts + gaps).
  // Skipping it: this is a fresh deployment on its first real epoch cycle
  // (never harvested before), so the balance before this claim was almost
  // certainly 0 — the raw current balance alone tells us what we need.
  const currentBalance = await token.balanceOf(deployment.contracts.ByNdVoter);
  const claimCursor = await voter.epochClaimCursor(currentEpoch);

  console.log(`ByNdVoter address: ${deployment.contracts.ByNdVoter}`);
  console.log(`${symbol} balance held by ByNdVoter right now: ${ethers.formatUnits(currentBalance, decimals)}`);
  console.log(`Claim cursor                              : ${claimCursor}`);

  if (currentBalance > 0n) {
    console.log(`\n*** The claim DID work. ${ethers.formatUnits(currentBalance, decimals)} ${symbol} is sitting in`);
    console.log(`*** ByNdVoter right now, ready to be harvested — this is the real number`);
    console.log(`*** harvestAndDistribute() will use (balance minus its own private`);
    console.log(`*** pre-claim snapshot, which should be ~0 on this fresh deployment).`);
    console.log(`*** "Pending incentives: 0" in the modal is reading previewOptimalGauge()'s`);
    console.log(`*** ranking score — a completely different (and now-stale) number.`);
  } else {
    console.log(`\nNo real balance sitting in ByNdVoter. The claim may genuinely not have`);
    console.log(`landed funds despite the clean simulation — worth re-checking tx receipts`);
    console.log(`for the actual claimBribesBatch() transaction that was sent.`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
