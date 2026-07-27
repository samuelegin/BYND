const { ethers } = require("hardhat");

// whatsabi's extraction failed for veMEZO (proxy-resolution issue, returned
// empty). Instead, directly probe common Curve/Solidly ve-lock function
// names against the real contract. All calls are .staticCall -- simulated
// only, nothing is sent or committed, safe to run freely.
//
// Usage:
//   npx hardhat run scripts/probe-vemezo-recovery.js --network mezotestnet

const VEMEZO = "0xaCE816CA2bcc9b12C59799dcC5A959Fb9b98111b";
const TOKEN_ID = 832;

async function tryCandidate(signer, label, sig, args) {
  try {
    const fnName = sig.split("function ")[1].split("(")[0];
    const c = await ethers.getContractAt([sig], VEMEZO, signer);
    const result = await c[fnName].staticCall(...args);
    console.log(`[EXISTS] ${label}`);
    if (result !== undefined) console.log(`    -> ${JSON.stringify(result)}`);
  } catch (e) {
    const reason = e.reason || e.shortMessage || e.message || "unknown";
    console.log(`[missing/reverted] ${label} -- ${reason.slice(0, 90)}`);
  }
}

async function main() {
  const [signer] = await ethers.getSigners();
  console.log(`Probing veMEZO (${VEMEZO}) for tokenId ${TOKEN_ID}...\n`);

  // Withdraw candidates (reclaim underlying MEZO from an expired lock)
  await tryCandidate(signer, "withdraw(uint256)", "function withdraw(uint256)", [TOKEN_ID]);
  await tryCandidate(signer, "withdraw(uint256 tokenId) [alt]", "function withdraw(uint256 tokenId)", [TOKEN_ID]);

  // Create-lock candidates (start a brand new lock)
  await tryCandidate(signer, "createLock(uint256,uint256)", "function createLock(uint256,uint256) returns (uint256)", [ethers.parseEther("1"), 4 * 365 * 24 * 60 * 60]);
  await tryCandidate(signer, "create_lock(uint256,uint256)", "function create_lock(uint256,uint256) returns (uint256)", [ethers.parseEther("1"), 4 * 365 * 24 * 60 * 60]);

  // Merge candidates (combine an expired/small position into another NFT you own)
  await tryCandidate(signer, "merge(uint256,uint256)", "function merge(uint256,uint256)", [TOKEN_ID, TOKEN_ID]);

  // Deposit-for/increase-amount, in case there's a simpler "top up and it
  // resets expiry" pattern instead of separate withdraw+create
  await tryCandidate(signer, "depositFor(uint256,uint256)", "function depositFor(uint256,uint256)", [TOKEN_ID, 0]);
  await tryCandidate(signer, "increaseAmount(uint256,uint256)", "function increaseAmount(uint256,uint256)", [TOKEN_ID, 0]);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
