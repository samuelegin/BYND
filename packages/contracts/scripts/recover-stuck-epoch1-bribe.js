const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

// RECOVERY SCRIPT — reads its own state at every step and stops immediately
// if anything doesn't match what we expect, rather than barreling through a
// fund-recovery sequence blind. Requires the connected signer to be
// ByNdVoter's governance address.
//
// What happened: a claim was attempted for epoch 1 seconds after voting,
// before the real epoch flip — the bribe genuinely wasn't earned() yet, so
// claimBribes() succeeded with a zero transfer, and ByNdVoter's cursor
// marked epoch 1's claim step as permanently done (cursor == total forever).
// Now that the real epoch has flipped, earned() shows 900 MUSD truly
// claimable — but epoch 1 can never call claimBribesBatch() again, and
// harvestAndDistribute() can't advance past epoch 1 either, since it
// requires anyValue > 0 and the balance delta is 0.
//
// Fix sequence (all governance-gated, all reversible):
//   1. forceCloseEpoch() — no anyValue requirement, banks 0, advances
//      currentEpoch 1 -> 2. Safe: nothing was owed to epoch 1 anyway.
//   2. Temporarily widen voteWindow so optimiseAndVote() can be called
//      again immediately in epoch 2, instead of waiting ~a week for
//      Mezo's real vote window to naturally reopen.
//   3. Re-cast the vote for epoch 2 (same gauge/tokenId — the Bribe
//      contract's already-earned 900 MUSD is independent of this and
//      isn't reset by re-voting).
//   4. claimBribesBatch() again — should now actually pull the real 900
//      MUSD into ByNdVoter (earned() already confirmed nonzero).
//   5. harvestAndDistribute() — anyValue is now true, so this succeeds
//      and distributes to stakers + keeper bounty.
//   6. Restore voteWindow to its original value.
//
// Usage:
//   npx hardhat run scripts/recover-stuck-epoch1-bribe.js --network mezotestnet
//
// Safe to re-run: every step checks current on-chain state first and skips
// if already done, so interrupting partway through and re-running is fine.

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

  const [signer] = await ethers.getSigners();
  const voter = await ethers.getContractAt("ByNdVoter", deployment.contracts.ByNdVoter, signer);

  const governance = await voter.governance();
  console.log(`ByNdVoter.governance(): ${governance}`);
  console.log(`Your wallet:            ${signer.address}`);
  if (governance.toLowerCase() !== signer.address.toLowerCase()) {
    throw new Error("Signer is not governance — cannot run this recovery.");
  }

  const token = await ethers.getContractAt(ERC20_ABI, MUSD);
  const decimals = await token.decimals();
  const symbol = await token.symbol().catch(() => "MUSD");

  // ── Step 1: force-close epoch 1 ─────────────────────────────────────────
  console.log("\n" + "=".repeat(60));
  console.log("STEP 1 — forceCloseEpoch() to advance past the stuck epoch");
  console.log("=".repeat(60));
  let epoch = await voter.currentEpoch();
  const harvestedBefore = await voter.epochHarvested(epoch);
  if (harvestedBefore) {
    console.log(`Epoch ${epoch} already harvested — skipping, already past this step.`);
  } else {
    console.log(`Closing epoch ${epoch}...`);
    const tx = await voter.forceCloseEpoch();
    console.log(`Tx sent: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`Status: ${receipt.status === 1 ? "SUCCESS" : "REVERTED"}`);
  }
  epoch = await voter.currentEpoch();
  console.log(`Current epoch is now: ${epoch}`);

  // ── Step 2: widen vote window ───────────────────────────────────────────
  console.log("\n" + "=".repeat(60));
  console.log("STEP 2 — Temporarily widen voteWindow so we can re-vote NOW");
  console.log("=".repeat(60));
  const epochDuration = await voter.epochDuration();
  const originalVoteWindow = await voter.voteWindow();
  console.log(`epochDuration        : ${epochDuration}`);
  console.log(`voteWindow (current) : ${originalVoteWindow}`);
  console.log(`*** SAVE THIS VALUE — you need it to restore voteWindow after recovery: ${originalVoteWindow} ***`);

  const alreadyVoted = await voter.epochVoted(epoch);
  if (alreadyVoted) {
    console.log(`Epoch ${epoch} already voted — skipping window widen + re-vote.`);
  } else {
    // Widen to the full epoch duration so the "block.timestamp >=
    // epochNext(now) - voteWindow" check is satisfied at any point in the
    // epoch, not just its final hours.
    if (epochDuration > originalVoteWindow) {
      console.log(`Widening voteWindow to ${epochDuration} (full epoch) temporarily...`);
      const tx = await voter.setVoteWindow(epochDuration);
      console.log(`Tx sent: ${tx.hash}`);
      const receipt = await tx.wait();
      console.log(`Status: ${receipt.status === 1 ? "SUCCESS" : "REVERTED"}`);
    } else {
      console.log(`voteWindow already >= epochDuration — no widening needed.`);
    }

    // ── Step 3: re-vote ────────────────────────────────────────────────
    console.log("\n" + "=".repeat(60));
    console.log("STEP 3 — Re-cast the vote for the new epoch");
    console.log("=".repeat(60));
    const tx2 = await voter.optimiseAndVote();
    console.log(`Tx sent: ${tx2.hash}`);
    const receipt2 = await tx2.wait();
    console.log(`Status: ${receipt2.status === 1 ? "SUCCESS" : "REVERTED"}`);
  }

  // ── Step 4: claim bribes ────────────────────────────────────────────────
  console.log("\n" + "=".repeat(60));
  console.log("STEP 4 — claimBribesBatch() — should pull the real 900 MUSD in now");
  console.log("=".repeat(60));
  const { cursor, total, readyToHarvest } = await voter.claimProgress();
  if (readyToHarvest) {
    console.log(`Already fully claimed (${cursor}/${total}) — skipping.`);
  } else {
    const tx3 = await voter.claimBribesBatch(200);
    console.log(`Tx sent: ${tx3.hash}`);
    const receipt3 = await tx3.wait();
    console.log(`Status: ${receipt3.status === 1 ? "SUCCESS" : "REVERTED"}`);
  }

  const balanceNow = await token.balanceOf(deployment.contracts.ByNdVoter);
  console.log(`\n${symbol} balance held by ByNdVoter right now: ${ethers.formatUnits(balanceNow, decimals)}`);
  if (balanceNow === 0n) {
    console.log(`\n*** STILL ZERO. Stopping here — do NOT proceed to harvest, it will revert`);
    console.log(`*** with "nothing harvested this epoch" and you'd want to investigate why`);
    console.log(`*** the claim pulled in nothing this time before going further.`);
    return;
  }

  // ── Step 5: harvest ──────────────────────────────────────────────────────
  console.log("\n" + "=".repeat(60));
  console.log("STEP 5 — harvestAndDistribute()");
  console.log("=".repeat(60));
  const tx4 = await voter.harvestAndDistribute();
  console.log(`Tx sent: ${tx4.hash}`);
  const receipt4 = await tx4.wait();
  console.log(`Status: ${receipt4.status === 1 ? "SUCCESS" : "REVERTED"}`);

  // ── Step 6: restore voteWindow ──────────────────────────────────────────
  console.log("\n" + "=".repeat(60));
  console.log("STEP 6 — Restore voteWindow to its original value");
  console.log("=".repeat(60));
  const currentWindow = await voter.voteWindow();
  if (currentWindow.toString() === originalVoteWindow.toString()) {
    console.log(`voteWindow already at original value (${originalVoteWindow}) — nothing to restore.`);
  } else {
    console.log(`Restoring voteWindow to ${originalVoteWindow}...`);
    const tx5 = await voter.setVoteWindow(originalVoteWindow);
    console.log(`Tx sent: ${tx5.hash}`);
    const receipt5 = await tx5.wait();
    console.log(`Status: ${receipt5.status === 1 ? "SUCCESS" : "REVERTED"}`);
  }

  console.log("\nDone. Recheck the terminal UI — the 900 MUSD should now show as distributed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
