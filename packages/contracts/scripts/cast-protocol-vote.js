const { ethers } = require("hardhat");

// Casts THIS WEEK'S actual BynD protocol vote, correctly — via
// ByNdVoter.optimiseAndVote(), using the vault's managed position
// (tokenId 860), NOT scripts/cast-vote.js's hardcoded tokenId 1422, which
// calls Mezo's raw boostVoter.vote() directly and has nothing to do with
// BynD's aggregated governance position.
//
// Same call the Terminal/Keeper UI's "Vote" button makes.
//
// Usage:
//   npx hardhat run scripts/cast-protocol-vote.js --network mezotestnet

const BYND_VOTER = "0x76b7e2EbD2839c36802442931382032e8840218d";

const ABI = [
  "function optimiseAndVote() external",
  "function currentEpoch() view returns (uint256)",
  "function epochVoted(uint256) view returns (bool)",
  "function lastVoteTimestamp() view returns (uint256)",
];

async function main() {
  const [signer] = await ethers.getSigners();
  const voter = await ethers.getContractAt(ABI, BYND_VOTER, signer);

  const epoch = await voter.currentEpoch();
  const alreadyVoted = await voter.epochVoted(epoch);
  console.log(`Current epoch: ${epoch}`);
  console.log(`Already voted this epoch: ${alreadyVoted}`);

  if (alreadyVoted) {
    console.log("Nothing to do — this epoch's vote is already in.");
    return;
  }

  console.log("Calling optimiseAndVote()...");
  const tx = await voter.optimiseAndVote();
  console.log(`Tx sent: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`Status: ${receipt.status === 1 ? "SUCCESS" : "REVERTED"}`);

  console.log(`\nepochVoted(${epoch}) now: ${await voter.epochVoted(epoch)}`);
  console.log(`lastVoteTimestamp: ${await voter.lastVoteTimestamp()}`);
  console.log("\nNext step once the epoch flips: fund-bribe.js, then claimBribesBatch.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
