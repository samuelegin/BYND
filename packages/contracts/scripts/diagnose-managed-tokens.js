const { ethers } = require("hardhat");

// Diagnoses why ByNdVoter still shows epochVoted=false despite you clicking
// "Cast system votes". Checks the most likely silent-failure point: whether
// tokenId 829 actually made it into managedTokenIds (ByNdVault.deposit()
// wraps addManagedTokenId in a silent try/catch).
//
// Usage:
//   npx hardhat run scripts/diagnose-managed-tokens.js --network mezotestnet

const BYND_VOTER = "0x76b7e2EbD2839c36802442931382032e8840218d";

const ABI = [
  "function managedTokenIds(uint256) view returns (uint256)",
  "function tokenIdIndex(uint256) view returns (uint256)",
  "function currentEpoch() view returns (uint256)",
  "function epochVoted(uint256) view returns (bool)",
  "function lastVoteTimestamp() view returns (uint256)",
  "function optimiseAndVote()",
];

async function main() {
  const voter = await ethers.getContractAt(ABI, BYND_VOTER);

  console.log("=".repeat(60));
  console.log("Checking managedTokenIds array");
  console.log("=".repeat(60));
  const found = [];
  for (let i = 0; i < 20; i++) {
    try {
      const id = await voter.managedTokenIds(i);
      found.push(id.toString());
    } catch {
      break; // out of bounds -- end of array
    }
  }
  console.log(`managedTokenIds (${found.length} entries): [${found.join(", ")}]`);

  console.log(`\nlastVoteTimestamp: ${await voter.lastVoteTimestamp()}`);
  console.log(`currentEpoch: ${await voter.currentEpoch()}`);
  console.log(`epochVoted(currentEpoch): ${await voter.epochVoted(await voter.currentEpoch())}`);

  console.log("\n" + "=".repeat(60));
  console.log("Simulating optimiseAndVote() to get the real revert reason");
  console.log("=".repeat(60));
  try {
    await voter.optimiseAndVote.staticCall();
    console.log("Simulation succeeded -- it should actually work if you call it for real.");
  } catch (e) {
    console.log(`Would revert with: ${e.reason || e.shortMessage || e.message}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
