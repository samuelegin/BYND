const { ethers } = require("hardhat");

// tokenId 829 voted (lastVoted != 0) but not for our test gauge. This finds
// out which gauge(s) it actually voted for, by checking votes(829, g) across
// every gauge boostVoter knows about.
//
// Usage:
//   npx hardhat run scripts/find-voted-gauge.js --network mezotestnet

const BOOST_VOTER = "0x21d7bDF5a5929AD179F8cA0c9014A0B62ae6Bfd1";
const TOKEN_ID = 829;
const OUR_TEST_GAUGE = "0xb61D510dF1f1aeFc23016C39F5beA213E2f6e173";

const ABI = [
  "function length() view returns (uint256)",
  "function gauges(uint256) view returns (address)",
  "function votes(uint256,address) view returns (int256)",
];

async function main() {
  const voter = await ethers.getContractAt(ABI, BOOST_VOTER);
  const n = await voter.length();
  console.log(`boostVoter knows about ${n} gauges total.\n`);

  let foundAny = false;
  for (let i = 0n; i < n; i++) {
    const gauge = await voter.gauges(i);
    const v = await voter.votes(TOKEN_ID, gauge);
    if (v !== 0n) {
      foundAny = true;
      const isOurs = gauge.toLowerCase() === OUR_TEST_GAUGE.toLowerCase();
      console.log(`[${i}] gauge ${gauge}${isOurs ? "  <-- OUR TEST GAUGE" : ""}`);
      console.log(`    votes(829, this gauge): ${v}`);
    }
  }
  if (!foundAny) {
    console.log("No nonzero votes found across any known gauge for tokenId 829 --");
    console.log("odd given lastVoted/usedWeights are nonzero. Worth double-checking");
    console.log("length()/gauges() actually enumerate all registered gauges.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
