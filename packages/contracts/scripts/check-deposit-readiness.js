const { ethers } = require("hardhat");

// Checks the two most likely causes of the deposit() revert:
//   1. Does ByNdVault actually hold MINTER_ROLE on VeBYND right now?
//   2. Is veMEZO #857's lock state actually valid for deposit (owner,
//      amount > 0, not expired/permanent)?
//
// Usage:
//   npx hardhat run scripts/check-deposit-readiness.js --network mezotestnet

const VEBYND = "0x0736B44A94b5f8d322D2f51A108e70e86589D91a";
const BYNDVAULT = "0xb7B1CD5c9D6d3deDE64F3c803826f6B6150a2B6C";
const VEMEZO = "0xaCE816CA2bcc9b12C59799dcC5A959Fb9b98111b";
const TOKEN_ID = 857;

const VEBYND_ABI = [
  "function MINTER_ROLE() view returns (bytes32)",
  "function BURNER_ROLE() view returns (bytes32)",
  "function hasRole(bytes32,address) view returns (bool)",
];

const VEMEZO_ABI = [
  "function ownerOf(uint256) view returns (address)",
  "function locked(uint256) view returns (int128 amount, uint256 end, bool isPermanent)",
  "function getApproved(uint256) view returns (address)",
  "function isApprovedForAll(address,address) view returns (bool)",
];

async function main() {
  const [signer] = await ethers.getSigners();
  console.log(`Signer: ${signer.address}\n`);

  console.log("=".repeat(60));
  console.log("1. Does ByNdVault hold MINTER_ROLE on VeBYND?");
  console.log("=".repeat(60));
  const veBYND = await ethers.getContractAt(VEBYND_ABI, VEBYND);
  const minterRole = await veBYND.MINTER_ROLE();
  const burnerRole = await veBYND.BURNER_ROLE();
  const hasMinter = await veBYND.hasRole(minterRole, BYNDVAULT);
  const hasBurner = await veBYND.hasRole(burnerRole, BYNDVAULT);
  console.log(`MINTER_ROLE granted to ByNdVault: ${hasMinter}`);
  console.log(`BURNER_ROLE granted to ByNdVault: ${hasBurner}`);
  if (!hasMinter) {
    console.log("  *** THIS IS LIKELY THE BUG: veBYND.mint() will revert inside deposit()");
    console.log("  *** because ByNdVault was never granted MINTER_ROLE on this VeBYND deployment.");
  }

  console.log("\n" + "=".repeat(60));
  console.log("2. Is veMEZO #857 actually depositable right now?");
  console.log("=".repeat(60));
  const veMEZO = await ethers.getContractAt(VEMEZO_ABI, VEMEZO);
  const owner = await veMEZO.ownerOf(TOKEN_ID);
  console.log(`Owner of #${TOKEN_ID}: ${owner}`);
  console.log(owner.toLowerCase() === signer.address.toLowerCase()
    ? "  -> Signer owns it, good."
    : "  -> Signer does NOT own it -- deposit will revert on ownerOf check.");

  const approved = await veMEZO.getApproved(TOKEN_ID);
  const approvedForAll = await veMEZO.isApprovedForAll(owner, BYNDVAULT);
  console.log(`getApproved(#${TOKEN_ID}): ${approved}`);
  console.log(`isApprovedForAll(owner, ByNdVault): ${approvedForAll}`);
  console.log((approved.toLowerCase() === BYNDVAULT.toLowerCase() || approvedForAll)
    ? "  -> Vault is approved to transfer this NFT."
    : "  -> Vault is NOT approved -- either the approve() tx didn't confirm, or it targeted the wrong address.");

  const lock = await veMEZO.locked(TOKEN_ID);
  console.log(`locked(#${TOKEN_ID}): amount=${lock.amount}, end=${lock.end}, isPermanent=${lock.isPermanent}`);
  const now = Math.floor(Date.now() / 1000);
  if (lock.amount <= 0n) console.log("  -> amount is 0 -- deposit will revert (ByNdVault: empty lock).");
  if (!lock.isPermanent && Number(lock.end) <= now) console.log("  -> lock expired -- deposit will revert (ByNdVault: lock expired).");
  if (lock.isPermanent) console.log("  -> Permanent lock -- deposit will revert unless unlocked first (matches the UI's yellow warning).");

  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));
  if (!hasMinter) {
    console.log("Fix: grant MINTER_ROLE (and BURNER_ROLE) on VeBYND to ByNdVault:");
    console.log(`  veBYND.grantRole(await veBYND.MINTER_ROLE(), "${BYNDVAULT}")`);
  } else {
    console.log("MINTER_ROLE looks fine -- check the lock/ownership/approval results above for the real cause.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
