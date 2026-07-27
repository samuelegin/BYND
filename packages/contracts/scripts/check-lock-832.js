const { ethers } = require("hardhat");

// Directly checks veMEZO #832's lock struct on-chain -- no guessing from UI
// text. Also checks the explorer-reported status of the failed deposit tx.
//
// Usage:
//   npx hardhat run scripts/check-lock-832.js --network mezotestnet

const VEMEZO = "0xaCE816CA2bcc9b12C59799dcC5A959Fb9b98111b";
const TOKEN_ID = 832;

const VEMEZO_ABI = [
  "function locked(uint256) view returns (int128 amount, uint256 end, bool isPermanent)",
  "function ownerOf(uint256) view returns (address)",
];

async function main() {
  const veMEZO = await ethers.getContractAt(VEMEZO_ABI, VEMEZO);

  const owner = await veMEZO.ownerOf(TOKEN_ID);
  console.log(`Owner of #${TOKEN_ID}: ${owner}`);

  const lock = await veMEZO.locked(TOKEN_ID);
  const now = Math.floor(Date.now() / 1000);
  console.log(`\nlocked(#${TOKEN_ID}):`);
  console.log(`  amount:       ${lock.amount}`);
  console.log(`  end:          ${lock.end} ${lock.end > 0n ? `(${new Date(Number(lock.end) * 1000).toISOString()})` : ""}`);
  console.log(`  isPermanent:  ${lock.isPermanent}`);
  console.log(`  now:          ${now}`);

  console.log("\nWhat ByNdVault's deposit() requires:");
  console.log(`  ownerOf == caller:        ${owner.toLowerCase()}`);
  console.log(`  amount > 0:                ${lock.amount > 0n}`);
  console.log(`  isPermanent || end > now:  ${lock.isPermanent || Number(lock.end) > now}`);

  if (lock.isPermanent) {
    console.log("\nIt IS permanent. The vault's require (isPermanent || end > now) should");
    console.log("still pass fine here -- permanent alone satisfies the OR. So a permanent");
    console.log("lock by itself should NOT be why deposit() reverted, unless the actual");
    console.log("deployed contract's logic differs from what we read in the .sol source.");
  } else if (Number(lock.end) <= now) {
    console.log("\n*** THIS IS LIKELY IT: not permanent, and end <= now -- lock has expired.");
    console.log("*** deposit() requires (isPermanent || end > now), so this reverts.");
    console.log("*** Fix: extend the lock (extend_lock / increase_unlock_time on veMEZO)");
    console.log("*** before depositing, or wait for a keeper's extendLocks() -- though that");
    console.log("*** only extends tokens ALREADY in the vault, not ones still in your wallet.");
  } else {
    console.log("\nLock looks valid (not permanent, but not expired either) -- permanent-lock");
    console.log("is NOT the cause. Revert reason is something else -- check the explorer tx.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
