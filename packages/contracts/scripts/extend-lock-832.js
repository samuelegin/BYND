const { ethers } = require("hardhat");

// Extends veMEZO #832's lock, which expired 2026-07-02 -- that's why
// ByNdVault.deposit() has been reverting (require isPermanent || end > now).
//
// Usage:
//   npx hardhat run scripts/extend-lock-832.js --network mezotestnet

const VEMEZO = "0xaCE816CA2bcc9b12C59799dcC5A959Fb9b98111b";
const TOKEN_ID = 832;
const WEEK = 7 * 24 * 60 * 60;
const FOUR_YEARS_SECONDS = 4 * 365 * 24 * 60 * 60;

const ABI = [
  "function increaseUnlockTime(uint256,uint256)",
  "function locked(uint256) view returns (int128 amount, uint256 end, bool isPermanent)",
];

async function main() {
  const [signer] = await ethers.getSigners();
  const veMEZO = await ethers.getContractAt(ABI, VEMEZO, signer);

  const now = Math.floor(Date.now() / 1000);
  // Curve/Solidly-style ve-locks store expiry aligned to week boundaries and
  // typically reject any timestamp that isn't exactly on one -- round down.
  const newEnd = Math.floor((now + FOUR_YEARS_SECONDS) / WEEK) * WEEK;
  console.log(`Extending #${TOKEN_ID} to ${new Date(newEnd * 1000).toISOString()} (week-aligned)...`);

  // Try a static call first to get a real revert reason before spending gas.
  try {
    await veMEZO.increaseUnlockTime.staticCall(TOKEN_ID, newEnd);
    console.log("Simulation OK, sending real tx...");
  } catch (e) {
    console.log(`Simulation reverts with: ${e.reason || e.shortMessage || e.message}`);
    console.log("Stopping here -- fix the cause before spending real gas.");
    return;
  }

  const tx = await veMEZO.increaseUnlockTime(TOKEN_ID, newEnd);
  console.log(`Tx sent: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`Status: ${receipt.status === 1 ? "SUCCESS" : "REVERTED"}`);

  if (receipt.status === 1) {
    const lock = await veMEZO.locked(TOKEN_ID);
    console.log(`\nNew lock end: ${lock.end} (${new Date(Number(lock.end) * 1000).toISOString()})`);
    console.log("Deposit should now succeed -- retry in the frontend.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
