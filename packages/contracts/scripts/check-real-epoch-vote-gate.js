const { ethers, network } = require("hardhat");

// Approval is fine, gauge is alive, tokenId is correctly managed — so the
// remaining strong candidate is a mismatch between ByNdVoter's OWN internal
// epoch counter (bumped artificially by forceCloseEpoch() during this
// week's recovery) and Mezo's REAL BoostVoter epoch clock, which tracks
// lastVoted(tokenId) independently and typically refuses a second vote
// within the same real voting period regardless of what ByNdVoter thinks
// its own epoch number is.
//
// Usage:
//   npx hardhat run scripts/check-real-epoch-vote-gate.js --network mezotestnet

const BOOST_VOTER = "0x21d7bDF5a5929AD179F8cA0c9014A0B62ae6Bfd1";

const ABI = [
  "function lastVoted(uint256) view returns (uint256)",
  "function epochStart(uint256) view returns (uint256)",
  "function epochNext(uint256) view returns (uint256)",
];

async function main() {
  const chainId = (await ethers.provider.getNetwork()).chainId;
  if (chainId !== 31611n) throw new Error("Run with --network mezotestnet");

  const boostVoter = await ethers.getContractAt(ABI, BOOST_VOTER, ethers.provider);
  const now = Math.floor(Date.now() / 1000);

  const lastVoted = await boostVoter.lastVoted(860);
  const currentRealEpochStart = await boostVoter.epochStart(now);
  const currentRealEpochNext = await boostVoter.epochNext(now);
  const lastVotedEpochStart = lastVoted > 0n ? await boostVoter.epochStart(lastVoted) : 0n;

  console.log("=".repeat(60));
  console.log("Mezo real BoostVoter epoch gate for tokenId 860");
  console.log("=".repeat(60));
  console.log(`Now                      : ${now} (${new Date(now * 1000).toISOString()})`);
  console.log(`Current real epoch start : ${currentRealEpochStart} (${new Date(Number(currentRealEpochStart) * 1000).toISOString()})`);
  console.log(`Current real epoch end   : ${currentRealEpochNext} (${new Date(Number(currentRealEpochNext) * 1000).toISOString()})`);
  console.log(`\nlastVoted(860)           : ${lastVoted} (${lastVoted > 0n ? new Date(Number(lastVoted) * 1000).toISOString() : "never"})`);
  console.log(`lastVoted's epoch start  : ${lastVotedEpochStart} (${lastVotedEpochStart > 0n ? new Date(Number(lastVotedEpochStart) * 1000).toISOString() : "n/a"})`);

  if (lastVotedEpochStart === currentRealEpochStart) {
    console.log("\n*** MATCH. tokenId 860 already voted within the CURRENT real Mezo epoch.");
    console.log("*** This is almost certainly why every vote attempt failed tonight —");
    console.log("*** Mezo's real BoostVoter refuses a second vote this same real period,");
    console.log("*** regardless of what ByNdVoter's own internal epoch counter says.");
    console.log(`*** Next real vote won't be possible until the real epoch rolls over at`);
    console.log(`*** ${new Date(Number(currentRealEpochNext) * 1000).toISOString()}.`);
  } else {
    console.log("\nNo match — tokenId 860's last real vote was in a DIFFERENT real epoch");
    console.log("than the current one, so this isn't the cause. The revert has some other");
    console.log("real cause on Mezo's BoostVoter side — worth trying to get the raw revert");
    console.log("data decoded, or checking the lock's expiry/weight next.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
