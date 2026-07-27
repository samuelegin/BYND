const { ethers } = require("hardhat");

// Determines definitively whether veMEZO #832's deposit actually succeeded
// or silently reverted (matching the frontend bug we just fixed).
//
// Usage:
//   npx hardhat run scripts/check-nft-832.js --network mezotestnet

const VEMEZO = "0xaCE816CA2bcc9b12C59799dcC5A959Fb9b98111b";
const BYNDVAULT = "0xb7B1CD5c9D6d3deDE64F3c803826f6B6150a2B6C";
const VEBYND = "0x0736B44A94b5f8d322D2f51A108e70e86589D91a";
const TOKEN_ID = 832;

const VEMEZO_ABI = ["function ownerOf(uint256) view returns (address)"];
const VEBYND_ABI = ["function balanceOf(address) view returns (uint256)"];

async function main() {
  const [signer] = await ethers.getSigners();
  const veMEZO = await ethers.getContractAt(VEMEZO_ABI, VEMEZO);
  const veBYND = await ethers.getContractAt(VEBYND_ABI, VEBYND);

  console.log(`Checking veMEZO #${TOKEN_ID}...\n`);

  const owner = await veMEZO.ownerOf(TOKEN_ID);
  console.log(`Current owner: ${owner}`);

  if (owner.toLowerCase() === BYNDVAULT.toLowerCase()) {
    console.log("  -> The vault owns it. Deposit DID succeed on-chain.");
    console.log("     If veBYND balance still looks wrong, it's a display/refresh");
    console.log("     issue, not a failed deposit -- checking your veBYND balance below.");
  } else if (owner.toLowerCase() === signer.address.toLowerCase()) {
    console.log("  -> Still in YOUR wallet. The deposit never actually happened --");
    console.log("     confirms the silent-revert bug. Safe to just retry with the fixed frontend.");
  } else {
    console.log(`  -> Owned by neither you nor the vault. Unexpected -- check this address.`);
  }

  const bal = await veBYND.balanceOf(signer.address);
  console.log(`\nYour current veBYND balance: ${ethers.formatEther(bal)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
