const { ethers } = require("hardhat");

// Overrides ByNdVoter's auto-optimizer (which chases protocol emissions via
// boostVoter.claimable()) with an explicit gauge list, so optimiseAndVote()
// targets our test gauge/bribe instead. Governance-only -- your deployer
// wallet already IS governance (confirmed via ByNdVoter.governance()).
//
// Usage:
//   npx hardhat run scripts/setup-test-gauge.js --network mezotestnet

const BYND_VOTER = "0x76b7e2EbD2839c36802442931382032e8840218d";
const GAUGE = "0xb61D510dF1f1aeFc23016C39F5beA213E2f6e173";
const BRIBE_CONTRACT = "0x79ab1b030CCBa5Dca3f2B10D6a9293A274D99a68";
const MUSD = "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503";

const ABI = [
  "function governance() view returns (address)",
  "function setGauges(address[],address[],string[],uint256[],address[][])",
];

async function main() {
  const [signer] = await ethers.getSigners();
  const voter = await ethers.getContractAt(ABI, BYND_VOTER, signer);

  const gov = await voter.governance();
  console.log(`ByNdVoter.governance(): ${gov}`);
  console.log(`Your wallet:            ${signer.address}`);
  if (gov.toLowerCase() !== signer.address.toLowerCase()) {
    throw new Error("Signer is not governance -- can't call setGauges.");
  }

  console.log("\nSetting gauges to [our test gauge] at 100% weight...");
  const tx = await voter.setGauges(
    [GAUGE],
    [BRIBE_CONTRACT],
    ["Test Bribe Gauge"],
    [10000], // 100% in bps
    [[MUSD]]
  );
  console.log(`Tx sent: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`Status: ${receipt.status === 1 ? "SUCCESS" : "REVERTED"}`);
  console.log("\nNext: run scripts/check-and-advance-epoch.js");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
