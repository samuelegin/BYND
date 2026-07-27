const { ethers } = require("hardhat");

// Run after clicking "Cast system votes" to confirm the vote landed and
// check if the MUSD bribe is now earning for BynD's managed position.
//
// Usage:
//   npx hardhat run scripts/check-vote-result.js --network mezotestnet

const BOOST_VOTER = "0x21d7bDF5a5929AD179F8cA0c9014A0B62ae6Bfd1";
const GAUGE = "0xb61D510dF1f1aeFc23016C39F5beA213E2f6e173";
const BRIBE_CONTRACT = "0x79ab1b030CCBa5Dca3f2B10D6a9293A274D99a68";
const MUSD = "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503";
const BYND_VOTER = "0x76b7e2EbD2839c36802442931382032e8840218d";

const BOOST_VOTER_ABI = [
  "function votes(uint256,address) view returns (int256)",
  "function lastVoted(uint256) view returns (uint256)",
  "function usedWeights(uint256) view returns (uint256)",
];

const BRIBE_ABI = [
  "function earned(address,uint256) view returns (uint256)",
  "function balanceOf(uint256) view returns (uint256)",
];

const BYNDVOTER_ABI = [
  "function managedTokenId() view returns (uint256)",
];

async function main() {
  const boostVoter = await ethers.getContractAt(BOOST_VOTER_ABI, BOOST_VOTER);
  const bribe = await ethers.getContractAt(BRIBE_ABI, BRIBE_CONTRACT);

  // Try to find BynD's managed tokenId automatically. If ByNdVoter doesn't
  // expose it under this exact name, we fall back to checking your own
  // deposited tokenIds (829, 857) directly -- the vote may have been cast
  // per-tokenId rather than via one aggregated managed NFT.
  let managedId = null;
  try {
    const byndVoter = await ethers.getContractAt(BYNDVOTER_ABI, BYND_VOTER);
    managedId = await byndVoter.managedTokenId();
    console.log(`Found managedTokenId() on ByNdVoter: ${managedId}`);
  } catch {
    console.log("ByNdVoter has no managedTokenId() getter under that name -- checking known tokenIds directly instead.");
  }

  const candidateIds = managedId ? [managedId] : [829n, 857n];

  for (const id of candidateIds) {
    console.log("\n" + "=".repeat(60));
    console.log(`tokenId ${id}`);
    console.log("=".repeat(60));
    console.log(`lastVoted: ${await boostVoter.lastVoted(id)} (0 = never voted)`);
    console.log(`usedWeights: ${await boostVoter.usedWeights(id)}`);
    console.log(`votes(id, gauge): ${await boostVoter.votes(id, GAUGE)}`);
    console.log(`bribe.balanceOf(id) [voting weight on this gauge]: ${await bribe.balanceOf(id)}`);
    const earned = await bribe.earned(MUSD, id);
    console.log(`bribe.earned(MUSD, id): ${ethers.formatEther(earned)} MUSD`);
    if (earned > 0n) {
      console.log(`  *** CLAIMABLE! Run getReward(${id}, ["${MUSD}"]) on the bribe contract next.`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
