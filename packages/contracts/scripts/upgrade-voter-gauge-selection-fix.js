const { ethers, upgrades, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

// Upgrades the existing ByNdVoter proxy in place to include the fixed
// gauge-selection logic (bribeReferenceToken + _selectOptimalGauges reading
// each gauge's own bribe contract via gaugeToBribe() + tokenRewardsPerEpoch(),
// instead of the old boostVoter.claimable(gauge) — which almost certainly
// always returned 0 on the real chain since BoostVoter.rewardToken() is
// unset), value-weighted cross-token ranking, and a capped scan.
//
// New storage can't run through initialize() again, so this script also makes
// the governance calls that give the new variables their intended values:
// setBribeReferenceToken(), setTokenWeights() and setVoteWindow(). Without
// them the upgraded proxy would price nothing, rank nothing, and keep voting
// in a window that overruns Mezo's own cutoff.
//
// No redeploy, no state migration — same proxy address throughout.
//
// Usage:
//   npx hardhat run scripts/upgrade-voter-gauge-selection-fix.js --network mezotestnet
//
// Optional overrides:
//   MUSD_ADDRESS=0x...        reference token (defaults to Matsnet MUSD)
//   GAUGE_SCAN_ADDRESS=0x...  reuse an already-deployed GaugeScan library

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
  // ByNdVoter links the external GaugeScan library by address, so the factory
  // cannot be built until that library exists on-chain. Reuse the copy from the
  // deployment record (or GAUGE_SCAN_ADDRESS) when there is one; otherwise
  // deploy a fresh copy. GaugeScan is stateless and view-only, so redeploying
  // it is safe — it just costs gas we needn't spend twice.
  let gaugeScanAddr =
    process.env.GAUGE_SCAN_ADDRESS || deployment.contracts.GaugeScan;
  if (gaugeScanAddr && (await ethers.provider.getCode(gaugeScanAddr)) === "0x") {
    console.log(`Recorded GaugeScan ${gaugeScanAddr} has no code — redeploying.`);
    gaugeScanAddr = null;
  }
  if (!gaugeScanAddr) {
    const gaugeScan = await (
      await ethers.getContractFactory("GaugeScan")
    ).deploy();
    await gaugeScan.waitForDeployment();
    gaugeScanAddr = await gaugeScan.getAddress();
    console.log(`Deployed GaugeScan library: ${gaugeScanAddr}`);
  } else {
    console.log(`Reusing GaugeScan library: ${gaugeScanAddr}`);
  }

  const ByNdVoterV2 = await ethers.getContractFactory("ByNdVoter", {
    libraries: { GaugeScan: gaugeScanAddr },
  });
  const upgraded = await upgrades.upgradeProxy(voterProxyAddr, ByNdVoterV2, {
    unsafeAllow: ["external-library-linking"],
  });
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
  console.log("STEP 3 — Price the bribe tokens the ranking compares");
  console.log("=".repeat(60));
  // The ranking sums each gauge's bribes across every valued token, scaling
  // each by its bps weight, so 100 of a token worth 5x the reference beats
  // 400 of the reference itself. An upgraded proxy starts with an EMPTY
  // valuation set (new storage can't run through initialize() again), and with
  // nothing priced the selector can only fall back to the first alive gauge —
  // so this write is what actually switches ranking on.
  const valuedCount = await upgraded.getValuedTokenCount();
  console.log(`valued token count before: ${valuedCount}`);
  if (valuedCount === 0n) {
    // MUSD at 10000 bps == 1x, i.e. MUSD *is* the unit of account. Additional
    // tokens (BTC, MEZO, ...) must be priced relative to it in a later
    // setTokenWeights() call — until then they score zero and are ignored.
    const tx = await upgraded.setTokenWeights([musdAddr], [10000]);
    const receipt = await tx.wait();
    console.log(`setTokenWeights([MUSD], [10000]) tx: ${receipt.hash}`);
  } else {
    console.log("Already priced — skipping the write.");
  }
  console.log(
    `scanCap: ${await upgraded.scanCap()} (0 => default), ` +
    `effective: ${await upgraded.effectiveScanCap()} gauges per scan`
  );

  console.log("\n" + "=".repeat(60));
  console.log("STEP 4 — Narrow the vote window to 3h");
  console.log("=".repeat(60));
  // Mezo's BoostVoter only accepts votes inside [epochStart+1h, epochNext-1h].
  // The old 4h window ran to the epoch boundary, so its last hour sat past the
  // chain's close: a keeper firing then would have every vote rejected, yet
  // optimiseAndVote() still marks the epoch voted and pays the bounty. 3h ends
  // exactly at the chain's cutoff.
  const VOTE_WINDOW = 3 * 60 * 60;
  const windowBefore = await upgraded.voteWindow();
  console.log(`voteWindow before: ${windowBefore}s`);
  if (windowBefore === BigInt(VOTE_WINDOW)) {
    console.log("Already 3h — skipping the write.");
  } else {
    const tx = await upgraded.setVoteWindow(VOTE_WINDOW);
    const receipt = await tx.wait();
    console.log(`setVoteWindow(${VOTE_WINDOW}) tx: ${receipt.hash}`);
  }

  console.log("\n" + "=".repeat(60));
  console.log("STEP 5 — Verify it actually landed");
  console.log("=".repeat(60));
  const after = await upgraded.bribeReferenceToken();
  console.log(`bribeReferenceToken now: ${after}`);
  console.log(`valued token count now : ${await upgraded.getValuedTokenCount()}`);
  console.log(`voteWindow now         : ${await upgraded.voteWindow()}s`);
  const ok =
    after.toLowerCase() === musdAddr.toLowerCase() &&
    (await upgraded.getValuedTokenCount()) > 0n &&
    (await upgraded.voteWindow()) === BigInt(VOTE_WINDOW);
  if (ok) {
    console.log(
      "\nDone. optimiseAndVote() now ranks gauges by value-weighted bribe " +
      "totals read from each gauge's own bribe contract — not the old, " +
      "likely-always-zero claimable(gauge) — capped at " +
      `${await upgraded.effectiveScanCap()} gauges per scan, and only inside ` +
      "the 3h window that fits Mezo's own vote cutoff."
    );
  } else {
    console.log(
      "\n*** Something doesn't match — a write may have silently failed. " +
      "Investigate before assuming this is fixed."
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});