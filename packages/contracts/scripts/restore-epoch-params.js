const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

// The bribe-recovery sequence temporarily widened voteWindow (10800 ->
// 582142) and epochDuration (604800 -> 1167884) so a vote could be re-cast
// immediately instead of waiting for Mezo's real window to reopen. Those
// values were never restored — recover-stuck-epoch1-bribe.js exited early
// (Step 4 came back 0, before reaching its own Step 6 restore) once the
// investigation pivoted to the vault-forwarding fix instead. Left widened,
// the on-chain gate for optimiseAndVote() is now far more permissive than
// the frontend's displayed countdown assumes, which is almost certainly why
// "Vote: READY" is showing before the UI's own countdown reaches 0, and
// likely also behind the flickering "Clock drift" warning.
//
// Usage:
//   npx hardhat run scripts/restore-epoch-params.js --network mezotestnet

const ORIGINAL_VOTE_WINDOW = 10800n;
const ORIGINAL_EPOCH_DURATION = 604800n;

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

  const voter = await ethers.getContractAt("ByNdVoter", deployment.contracts.ByNdVoter);

  const currentVoteWindow = await voter.voteWindow();
  const currentEpochDuration = await voter.epochDuration();
  console.log("=".repeat(60));
  console.log("Current values");
  console.log("=".repeat(60));
  console.log(`voteWindow     : ${currentVoteWindow} (original: ${ORIGINAL_VOTE_WINDOW})`);
  console.log(`epochDuration  : ${currentEpochDuration} (original: ${ORIGINAL_EPOCH_DURATION})`);

  if (currentVoteWindow === ORIGINAL_VOTE_WINDOW && currentEpochDuration === ORIGINAL_EPOCH_DURATION) {
    console.log("\nBoth already at original values — nothing to restore.");
    return;
  }

  const governance = await voter.governance();
  const [signer] = await ethers.getSigners();
  if (governance.toLowerCase() !== signer.address.toLowerCase()) {
    throw new Error(`Signer (${signer.address}) is not governance (${governance}) — cannot restore.`);
  }

  // Restore voteWindow FIRST, while epochDuration is still the widened
  // value — guarantees the "<= epochDuration/2" cap is satisfied regardless
  // of order, same reasoning as the original recovery script's Step 6.
  console.log("\n" + "=".repeat(60));
  console.log("Restoring voteWindow");
  console.log("=".repeat(60));
  if (currentVoteWindow !== ORIGINAL_VOTE_WINDOW) {
    const tx1 = await voter.setVoteWindow(ORIGINAL_VOTE_WINDOW);
    console.log(`Tx sent: ${tx1.hash}`);
    const r1 = await tx1.wait();
    console.log(`Status: ${r1.status === 1 ? "SUCCESS" : "REVERTED"}`);
  } else {
    console.log("Already correct — skipping.");
  }

  console.log("\n" + "=".repeat(60));
  console.log("Restoring epochDuration");
  console.log("=".repeat(60));
  if (currentEpochDuration !== ORIGINAL_EPOCH_DURATION) {
    const tx2 = await voter.setEpochDuration(ORIGINAL_EPOCH_DURATION);
    console.log(`Tx sent: ${tx2.hash}`);
    const r2 = await tx2.wait();
    console.log(`Status: ${r2.status === 1 ? "SUCCESS" : "REVERTED"}`);
  } else {
    console.log("Already correct — skipping.");
  }

  const finalVoteWindow = await voter.voteWindow();
  const finalEpochDuration = await voter.epochDuration();
  console.log("\n" + "=".repeat(60));
  console.log("Final values");
  console.log("=".repeat(60));
  console.log(`voteWindow    : ${finalVoteWindow}`);
  console.log(`epochDuration : ${finalEpochDuration}`);
  console.log("\nRefresh the terminal UI — 'Vote' should now correctly show a wait");
  console.log("countdown again instead of READY, and the clock drift warning should");
  console.log("stop appearing once both sides agree on the real window.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
