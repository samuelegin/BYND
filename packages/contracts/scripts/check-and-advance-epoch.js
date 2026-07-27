const { ethers } = require("hardhat");

// Run AFTER scripts/setup-test-gauge.js. This:
//   1. Checks whether Mezo's real vote window is currently open (a hard,
//      time-based on-chain gate optimiseAndVote() enforces -- can't be
//      bypassed by forceCloseEpoch(), only waited out).
//   2. Claims (mostly $0, since tokenId 829's actual vote this epoch went to
//      a different gauge) to satisfy the "fully claimed" requirement.
//   3. Force-closes the epoch so ByNdVoter's internal epochVoted flag resets,
//      making optimiseAndVote() callable again once the timing window allows.
//
// Usage:
//   npx hardhat run scripts/check-and-advance-epoch.js --network mezotestnet

const BOOST_VOTER = "0x21d7bDF5a5929AD179F8cA0c9014A0B62ae6Bfd1";
const BYND_VOTER = "0x76b7e2EbD2839c36802442931382032e8840218d";

const BOOST_VOTER_ABI = [
  "function epochNext(uint256) view returns (uint256)",
];

const BYND_VOTER_ABI = [
  "function currentEpoch() view returns (uint256)",
  "function voteWindow() view returns (uint256)",
  "function epochVoted(uint256) view returns (bool)",
  "function epochHarvested(uint256) view returns (bool)",
  "function claimBribesBatch(uint256)",
  "function forceCloseEpoch()",
];

async function main() {
  const [signer] = await ethers.getSigners();
  const boostVoter = await ethers.getContractAt(BOOST_VOTER_ABI, BOOST_VOTER);
  const voter = await ethers.getContractAt(BYND_VOTER_ABI, BYND_VOTER, signer);

  console.log("=".repeat(60));
  console.log("1. Is the real vote window open right now?");
  console.log("=".repeat(60));
  const now = Math.floor(Date.now() / 1000);
  const epochNext = await boostVoter.epochNext(now);
  const voteWindow = await voter.voteWindow();
  const windowOpensAt = Number(epochNext) - Number(voteWindow);
  console.log(`Now:              ${now}`);
  console.log(`Mezo epochNext(): ${epochNext}`);
  console.log(`Vote window:      ${voteWindow}s`);
  console.log(`Window opens at:  ${windowOpensAt}`);
  const windowOpen = now >= windowOpensAt;
  console.log(windowOpen
    ? "  -> OPEN. optimiseAndVote() will be callable once epoch state resets below."
    : `  -> CLOSED. Opens in ${windowOpensAt - now}s (~${Math.ceil((windowOpensAt - now) / 3600)}h). You'll need to wait, this can't be forced.`);

  console.log("\n" + "=".repeat(60));
  console.log("2. Claiming to satisfy the 'fully claimed' requirement");
  console.log("=".repeat(60));
  const epoch = await voter.currentEpoch();
  console.log(`currentEpoch: ${epoch}`);
  console.log(`epochVoted:   ${await voter.epochVoted(epoch)}`);
  console.log(`epochHarvested: ${await voter.epochHarvested(epoch)}`);

  const tx1 = await voter.claimBribesBatch(50);
  console.log(`claimBribesBatch tx: ${tx1.hash}`);
  const r1 = await tx1.wait();
  console.log(`Status: ${r1.status === 1 ? "SUCCESS" : "REVERTED"}`);
  if (r1.status !== 1) {
    console.log("Reverted -- likely not all managedTokenIds could be claimed in one batch,");
    console.log("or another require() failed. Check managedTokenIds.length vs MAX_CLAIM_BATCH.");
    return;
  }

  console.log("\n" + "=".repeat(60));
  console.log("3. Force-closing the epoch");
  console.log("=".repeat(60));
  const tx2 = await voter.forceCloseEpoch();
  console.log(`forceCloseEpoch tx: ${tx2.hash}`);
  const r2 = await tx2.wait();
  console.log(`Status: ${r2.status === 1 ? "SUCCESS" : "REVERTED"}`);

  const newEpoch = await voter.currentEpoch();
  console.log(`\nNew currentEpoch: ${newEpoch}`);
  console.log(`epochVoted(new):  ${await voter.epochVoted(newEpoch)}`);

  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));
  if (windowOpen) {
    console.log("Epoch advanced AND vote window is open -- go click 'Cast system votes'");
    console.log("again in the frontend now. It should target the test gauge this time.");
  } else {
    console.log("Epoch advanced, but the real vote window is still closed --");
    console.log("wait for it to open, then click 'Cast system votes'.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
