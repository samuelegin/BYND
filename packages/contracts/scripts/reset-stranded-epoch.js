const { ethers } = require("hardhat");

// Resets ByNdVoter's internal epoch counter off a stranded epoch so a clean
// vote -> claim -> harvest cycle can be tested again.
//
// Why this exists as its own script: check-and-advance-epoch.js calls
// claimBribesBatch() unconditionally, which now reverts with "nothing left to
// claim" once the cursor has already reached total -- exactly the state a
// stranded epoch is in. This one inspects first and only calls what is needed.
//
// What "stranded" means here, as diagnosed on Matsnet epoch 0: optimiseAndVote()
// marked the epoch voted even though every boostVoter.vote() call reverted (the
// vault had not yet approved the voter on the ve NFTs). Nothing reached a bribe
// contract, so claimBribesBatch() claimed 0 while still advancing its cursor,
// and harvestAndDistribute() can then only ever revert on _distribute's
// require(anyValue) -- "nothing harvested this epoch". forceCloseEpoch() is the
// only way out: it does not unvote (impossible -- epochVoted has no setter and
// the votes never landed on-chain anyway), it advances PAST the epoch to a fresh
// one with epochVoted=false, cursor 0 and no snapshot.
//
// Any already-harvested value is banked into carriedOver rather than lost, so
// running this is not a write-off of real funds.
//
// Usage:
//   npx hardhat run scripts/reset-stranded-epoch.js --network mezotestnet
//
// Optional:
//   DRY_RUN=true   report the state and what would happen, send nothing

const BYND_VOTER = "0x76b7e2EbD2839c36802442931382032e8840218d";
const BOOST_VOTER = "0x21d7bDF5a5929AD179F8cA0c9014A0B62ae6Bfd1";
const WEEK = 604800n;

const BYND_VOTER_ABI = [
  "function currentEpoch() view returns (uint256)",
  "function governance() view returns (address)",
  "function vault() view returns (address)",
  "function voteWindow() view returns (uint256)",
  "function epochVoted(uint256) view returns (bool)",
  "function epochHarvested(uint256) view returns (bool)",
  "function epochSnapshotTaken(uint256) view returns (bool)",
  "function epochClaimCursor(uint256) view returns (uint256)",
  "function claimProgress() view returns (uint256,uint256,bool)",
  "function getManagedTokenIds() view returns (uint256[])",
  "function getGaugeCount() view returns (uint256)",
  "function claimBribesBatch(uint256)",
  "function forceCloseEpoch()",
];

const BOOST_VOTER_ABI = ["function epochNext(uint256) view returns (uint256)"];

async function main() {
  const chainId = (await ethers.provider.getNetwork()).chainId;
  if (chainId !== 31611n) throw new Error(`Run with --network mezotestnet (got ${chainId})`);

  const dryRun = process.env.DRY_RUN === "true";
  const [signer] = await ethers.getSigners();
  const voter = await ethers.getContractAt(BYND_VOTER_ABI, BYND_VOTER, signer);
  const boostVoter = await ethers.getContractAt(BOOST_VOTER_ABI, BOOST_VOTER);

  const governance = await voter.governance();
  console.log(`Signer     : ${signer.address}`);
  console.log(`Governance : ${governance}`);
  if (governance.toLowerCase() !== signer.address.toLowerCase()) {
    throw new Error("Signer is not governance -- forceCloseEpoch() is governance-only.");
  }
  if (dryRun) console.log("\n*** DRY_RUN -- no transactions will be sent ***");

  console.log("\n" + "=".repeat(62));
  console.log("1. Current epoch state");
  console.log("=".repeat(62));
  const epoch = await voter.currentEpoch();
  const [cursor, total, ready] = await voter.claimProgress();
  const voted = await voter.epochVoted(epoch);
  const harvested = await voter.epochHarvested(epoch);
  const snapshot = await voter.epochSnapshotTaken(epoch);
  console.log(`currentEpoch        : ${epoch}`);
  console.log(`epochVoted          : ${voted}`);
  console.log(`epochHarvested      : ${harvested}`);
  console.log(`epochSnapshotTaken  : ${snapshot}`);
  console.log(`claimProgress       : cursor=${cursor} total=${total} readyToHarvest=${ready}`);
  console.log(`managed tokenIds    : ${(await voter.getManagedTokenIds()).join(", ") || "(none)"}`);
  console.log(`configured gauges   : ${await voter.getGaugeCount()}`);

  if (harvested) {
    console.log("\nThis epoch is already closed -- nothing to reset. currentEpoch has moved on.");
    return;
  }
  if (!voted) {
    console.log(
      "\nThis epoch has NOT been voted yet, so it is not stranded -- it is simply\n" +
      "open. No reset needed: wait for the vote window and call optimiseAndVote()."
    );
    return;
  }

  console.log("\n" + "=".repeat(62));
  console.log("2. Satisfy forceCloseEpoch()'s preconditions");
  console.log("=".repeat(62));
  // forceCloseEpoch() itself only requires !epochHarvested, but it reads
  // epochUniqueTokens[epoch] to bank deltas into carriedOver. That mapping is
  // only populated by the snapshot, so take it first if it is missing --
  // otherwise any value already sitting in the voter is skipped rather than
  // carried over.
  if (!snapshot) {
    console.log("No snapshot for this epoch yet. claimBribesBatch() takes one as a side");
    console.log("effect, so calling it first ensures carriedOver accounting is not skipped.");
    if (cursor >= total && total > 0n) {
      console.log("  -> but the cursor has already reached total, so it would revert.");
      console.log("     Proceeding straight to forceCloseEpoch().");
    } else if (dryRun) {
      console.log("  -> DRY_RUN: would call claimBribesBatch(200)");
    } else {
      const tx = await voter.claimBribesBatch(200);
      console.log(`  claimBribesBatch(200) tx: ${tx.hash}`);
      const r = await tx.wait();
      console.log(`  Status: ${r.status === 1 ? "SUCCESS" : "REVERTED"}`);
    }
  } else {
    console.log("Snapshot already taken -- carriedOver accounting will be correct.");
    console.log("Skipping claimBribesBatch() (it would revert on 'nothing left to claim').");
  }

  console.log("\n" + "=".repeat(62));
  console.log("3. forceCloseEpoch()");
  console.log("=".repeat(62));
  if (dryRun) {
    console.log("DRY_RUN: would call forceCloseEpoch()");
    console.log(`         epoch ${epoch} -> ${epoch + 1n}, with epochVoted[${epoch + 1n}]=false`);
  } else {
    const tx = await voter.forceCloseEpoch();
    console.log(`forceCloseEpoch tx: ${tx.hash}`);
    const r = await tx.wait();
    console.log(`Status: ${r.status === 1 ? "SUCCESS" : "REVERTED"}`);
    if (r.status !== 1) throw new Error("forceCloseEpoch() reverted -- state unchanged.");

    const newEpoch = await voter.currentEpoch();
    const [c2, t2, r2] = await voter.claimProgress();
    console.log(`\nNew currentEpoch    : ${newEpoch}`);
    console.log(`epochVoted(new)     : ${await voter.epochVoted(newEpoch)}`);
    console.log(`claimProgress(new)  : cursor=${c2} total=${t2} readyToHarvest=${r2}`);
    if (await voter.epochVoted(newEpoch)) {
      throw new Error("New epoch already reads as voted -- unexpected, investigate.");
    }
  }

  console.log("\n" + "=".repeat(62));
  console.log("4. When can you vote again?");
  console.log("=".repeat(62));
  // This is the one gate governance cannot bypass: optimiseAndVote() requires
  // block.timestamp >= boostVoter.epochNext(now) - voteWindow, and Mezo's
  // BoostVoter independently rejects votes in the final hour before the flip.
  const block = await ethers.provider.getBlock("latest");
  const now = BigInt(block.timestamp);
  const epochNext = await boostVoter.epochNext(now);
  const voteWindow = await voter.voteWindow();
  const opensAt = epochNext - voteWindow;
  const iso = (t) => new Date(Number(t) * 1000).toISOString();
  console.log(`chain now       : ${now}  (${iso(now)})`);
  console.log(`vote window     : ${voteWindow}s (${Number(voteWindow) / 3600}h)`);
  console.log(`window opens    : ${opensAt}  (${iso(opensAt)})`);
  console.log(`epoch flips     : ${epochNext}  (${iso(epochNext)})`);
  console.log(`Mezo hard cutoff: ${epochNext - 3600n}  (${iso(epochNext - 3600n)})`);

  if (now >= opensAt && now < epochNext - 3600n) {
    console.log("\n  -> OPEN NOW. Fund a bribe for THIS epoch, then call optimiseAndVote().");
  } else if (now >= epochNext - 3600n) {
    console.log("\n  -> Inside Mezo's final-hour lockout. Votes would be rejected on-chain.");
    console.log(`     Next usable window: ${iso(epochNext + WEEK - voteWindow)}`);
  } else {
    const wait = opensAt - now;
    console.log(`\n  -> CLOSED. Opens in ${wait}s (~${Math.ceil(Number(wait) / 3600)}h). Cannot be forced.`);
  }

  console.log("\n" + "=".repeat(62));
  console.log("NEXT STEPS");
  console.log("=".repeat(62));
  console.log("1. Confirm the vault has approved the voter on the ve NFTs -- this is what");
  console.log("   failed last cycle. scripts/check-vote-readiness.js checks it.");
  console.log("2. Fund a bribe INSIDE the epoch you intend to vote in. addBribes() credits");
  console.log("   the epoch live when the tx mines, so a bribe funded in a past epoch is");
  console.log("   not claimable by this epoch's votes:");
  console.log("     GAUGE_ADDRESS=0x... AMOUNT=100 BRIBE_TOKEN=<MUSD> \\");
  console.log("       npx hardhat run scripts/fund-bribe.js --network mezotestnet");
  console.log("3. In the vote window, call optimiseAndVote() from the Keeper page.");
  console.log("   It now REVERTS if every vote fails, instead of stranding the epoch.");
  console.log("4. After the epoch flips, claim bribes then harvest.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
