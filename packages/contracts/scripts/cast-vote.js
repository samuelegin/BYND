const { ethers } = require("hardhat");

// Casts the actual vote. Only run this AFTER scripts/check-vote-readiness.js
// shows tokenId 1422 is whitelisted and you own it.
//
// vote(uint256 tokenId, address[] gauges, uint256[] weights)
// Weights are relative to each other, not percentages -- voting 100% of your
// power into a single gauge just means passing one gauge with any nonzero
// weight (e.g. 100).
//
// Usage:
//   npx hardhat run scripts/cast-vote.js --network mezotestnet

const BOOST_VOTER = "0x21d7bDF5a5929AD179F8cA0c9014A0B62ae6Bfd1";
const GAUGE = "0xb61D510dF1f1aeFc23016C39F5beA213E2f6e173";
const TOKEN_ID = 1422;

const ABI = [
  "function vote(uint256,address[],uint256[])",
  "function lastVoted(uint256) view returns (uint256)",
  "function votes(uint256,address) view returns (int256)",
];

async function main() {
  const [signer] = await ethers.getSigners();
  const voter = await ethers.getContractAt(ABI, BOOST_VOTER, signer);

  console.log(`Voting with tokenId ${TOKEN_ID} for gauge ${GAUGE}...`);

  const tx = await voter.vote(TOKEN_ID, [GAUGE], [100]);
  console.log(`Tx sent: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`Confirmed in block ${receipt.blockNumber}`);

  console.log("\nPost-vote state:");
  console.log(`lastVoted(${TOKEN_ID}): ${await voter.lastVoted(TOKEN_ID)}`);
  console.log(`votes(${TOKEN_ID}, gauge): ${await voter.votes(TOKEN_ID, GAUGE)}`);

  console.log("\nNext: check earned() on the bribe contract for this tokenId,");
  console.log("then call getReward(tokenId, [MUSD]) on the bribe contract to claim.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
