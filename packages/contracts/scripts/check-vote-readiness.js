const { ethers } = require("hardhat");

// Checks everything that needs to be true BEFORE calling vote(), so we don't
// waste gas on a revert. Run this first, read the output, then only run
// scripts/cast-vote.js once every check here passes.
//
// Usage:
//   npx hardhat run scripts/check-vote-readiness.js --network mezotestnet

const BOOST_VOTER = "0x21d7bDF5a5929AD179F8cA0c9014A0B62ae6Bfd1";
const GAUGE = "0xb61D510dF1f1aeFc23016C39F5beA213E2f6e173";
const BRIBE_TOKEN = "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503"; // MUSD
const TOKEN_ID = 1422;
const YOUR_VE_NFT_CONTRACT = "0x38E35d92E6Bfc6787272A6234585"; // fill in the full address from your wallet screenshot

const ABI = [
  "function ve() view returns (address)",
  "function isWhitelistedNFT(uint256) view returns (bool)",
  "function isWhitelistedToken(address) view returns (bool)",
  "function isAlive(address) view returns (bool)",
  "function isGauge(address) view returns (bool)",
  "function lastVoted(uint256) view returns (uint256)",
  "function votes(uint256,address) view returns (int256)",
  "function usedWeights(uint256) view returns (uint256)",
  "function gaugeToBribe(address) view returns (address)",
];

const VE_ABI = ["function ownerOf(uint256) view returns (address)"];

async function main() {
  const [signer] = await ethers.getSigners();
  const voter = await ethers.getContractAt(ABI, BOOST_VOTER);

  console.log(`Signer wallet: ${signer.address}\n`);

  console.log("=".repeat(60));
  console.log("1. Does boostVoter's ve() match the NFT contract you actually own it on?");
  console.log("=".repeat(60));
  const veAddr = await voter.ve();
  console.log(`boostVoter.ve() : ${veAddr}`);
  console.log(`Your wallet's NFT contract (from screenshot): ${YOUR_VE_NFT_CONTRACT}...`);
  console.log(veAddr.toLowerCase().startsWith(YOUR_VE_NFT_CONTRACT.toLowerCase())
    ? "  -> MATCH (or close enough to confirm manually)"
    : "  -> MISMATCH -- fill in the full address and re-check before voting");

  console.log("\n" + "=".repeat(60));
  console.log("2. Do you actually own tokenId 1422 on that ve() contract?");
  console.log("=".repeat(60));
  const ve = await ethers.getContractAt(VE_ABI, veAddr);
  try {
    const owner = await ve.ownerOf(TOKEN_ID);
    console.log(`Owner of tokenId ${TOKEN_ID}: ${owner}`);
    console.log(owner.toLowerCase() === signer.address.toLowerCase()
      ? "  -> Confirmed, this signer owns it."
      : "  -> This signer does NOT own it -- vote() will revert (auth check via ownerOf).");
  } catch (e) {
    console.log(`  ownerOf reverted: ${e.reason || e.message} -- tokenId may not exist on this contract.`);
  }

  console.log("\n" + "=".repeat(60));
  console.log("3. Is tokenId 1422 whitelisted to vote?");
  console.log("=".repeat(60));
  const nftWhitelisted = await voter.isWhitelistedNFT(TOKEN_ID);
  console.log(`isWhitelistedNFT(${TOKEN_ID}): ${nftWhitelisted}`);
  if (!nftWhitelisted) {
    console.log("  -> NOT whitelisted. vote() will likely revert. Someone with governor");
    console.log("     rights needs to call whitelistNFT(1422, true) first.");
  }

  console.log("\n" + "=".repeat(60));
  console.log("4. Is the gauge alive and recognized?");
  console.log("=".repeat(60));
  console.log(`isGauge(gauge): ${await voter.isGauge(GAUGE)}`);
  console.log(`isAlive(gauge): ${await voter.isAlive(GAUGE)}`);

  console.log("\n" + "=".repeat(60));
  console.log("5. Is MUSD whitelisted as a valid bribe/reward token?");
  console.log("=".repeat(60));
  console.log(`isWhitelistedToken(MUSD): ${await voter.isWhitelistedToken(BRIBE_TOKEN)}`);

  console.log("\n" + "=".repeat(60));
  console.log("6. Current vote state for this tokenId");
  console.log("=".repeat(60));
  console.log(`lastVoted(${TOKEN_ID}): ${await voter.lastVoted(TOKEN_ID)} (0 = never voted)`);
  console.log(`usedWeights(${TOKEN_ID}): ${await voter.usedWeights(TOKEN_ID)}`);
  console.log(`votes(${TOKEN_ID}, gauge): ${await voter.votes(TOKEN_ID, GAUGE)}`);

  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));
  if (nftWhitelisted) {
    console.log("Looks ready to vote. Next: run scripts/cast-vote.js");
  } else {
    console.log("BLOCKED: tokenId needs whitelisting first (step 3 above) before voting will work.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
