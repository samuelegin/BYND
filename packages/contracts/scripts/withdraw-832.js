const { ethers } = require("hardhat");

// Withdraws expired veMEZO #832, reclaiming the underlying ~100 MEZO to your
// wallet. Confirmed safe via staticCall in the previous probe. After this,
// use Mezo's own official app to create a fresh lock with that MEZO, then
// deposit the resulting new tokenId into BynD as usual.
//
// Usage:
//   npx hardhat run scripts/withdraw-832.js --network mezotestnet

const VEMEZO = "0xaCE816CA2bcc9b12C59799dcC5A959Fb9b98111b";
const TOKEN_ID = 832;

const ABI = ["function withdraw(uint256)"];

async function main() {
  const [signer] = await ethers.getSigners();
  const veMEZO = await ethers.getContractAt(ABI, VEMEZO, signer);

  console.log(`Withdrawing veMEZO #${TOKEN_ID}...`);
  const tx = await veMEZO.withdraw(TOKEN_ID);
  console.log(`Tx sent: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`Status: ${receipt.status === 1 ? "SUCCESS" : "REVERTED"}`);

  if (receipt.status === 1) {
    console.log("\nDone. The underlying MEZO should now be back in your wallet,");
    console.log("and the #832 NFT position should be closed/burned.");
    console.log("Next: use Mezo's official app to create a fresh veMEZO lock,");
    console.log("then deposit the new tokenId into BynD.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
