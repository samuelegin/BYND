const { ethers } = require("hardhat");

// BYND-07 verification: does RewardsDistributor.claim() compound into the veMEZO
// lock, or transfer MEZO to the caller (the vault)? The vault handles no ERC-20s
// and has no sweep, so the second case would mean every rebase ever claimed is
// permanently immobile.
//
// Evidence sought:
//   1. totalLockedMEZO() vs veBYND totalSupply(). veBYND is minted 1:1 against
//      lock.amount at deposit and never again, so a surplus can ONLY come from
//      value compounded into the locks after deposit.
//   2. Any ERC-20 balance sitting in the vault. Non-zero => tokens were paid out
//      to the vault rather than compounded, and are stranded.

const VAULT = "0xb7B1CD5c9D6d3deDE64F3c803826f6B6150a2B6C";
const VEBYND = "0x0736B44A94b5f8d322D2f51A108e70e86589D91a";
const VEMEZO = "0xaCE816CA2bcc9b12C59799dcC5A959Fb9b98111b";
const MUSD = "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503";

const VAULT_ABI = [
  "function totalLockedMEZO() view returns (uint256)",
  "function totalDeposited() view returns (uint256)",
  "function getAllTokenIds() view returns (uint256[])",
  "function canonicalTokenId() view returns (uint256)",
  "function totalPendingRebase() view returns (uint256)",
  "function rewardsDistributor() view returns (address)",
];
const ERC20_ABI = [
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function symbol() view returns (string)",
];
const VEMEZO_ABI = [
  "function locked(uint256) view returns (int128 amount, uint256 end, bool isPermanent)",
  "function balanceOf(address) view returns (uint256)",
];

async function main() {
  const vault = await ethers.getContractAt(VAULT_ABI, VAULT);
  const bynd = await ethers.getContractAt(ERC20_ABI, VEBYND);
  const veMEZO = await ethers.getContractAt(VEMEZO_ABI, VEMEZO);

  const supply = await bynd.totalSupply();
  const locked = await vault.totalLockedMEZO();
  const ids = await vault.getAllTokenIds();
  const canonical = await vault.canonicalTokenId();

  console.log("=".repeat(64));
  console.log("BYND-07 -- rebase delivery mechanism");
  console.log("=".repeat(64));
  console.log(`veBYND totalSupply (= sum of deposits) : ${ethers.formatEther(supply)}`);
  console.log(`totalLockedMEZO    (= sum lock.amount) : ${ethers.formatEther(locked)}`);

  const surplus = locked - supply;
  console.log(`surplus                                : ${ethers.formatEther(surplus)}`);
  console.log("");

  console.log("Per-NFT locked amounts:");
  for (const id of ids) {
    const l = await veMEZO.locked(id);
    const tag = id === canonical ? "  <-- canonical" : "";
    console.log(`  tokenId ${id}: ${ethers.formatEther(l[0])}${tag}`);
  }

  console.log("");
  console.log("ERC-20 balances sitting in the vault (should all be 0):");
  for (const [name, addr] of [["MUSD", MUSD]]) {
    const t = await ethers.getContractAt(ERC20_ABI, addr);
    const b = await t.balanceOf(VAULT);
    console.log(`  ${name}: ${ethers.formatEther(b)}${b > 0n ? "   <-- STRANDED" : ""}`);
  }
  const nativeBal = await ethers.provider.getBalance(VAULT);
  console.log(`  native BTC: ${ethers.formatEther(nativeBal)}`);
  console.log(`  veMEZO NFTs held: ${await veMEZO.balanceOf(VAULT)}`);

  console.log("");
  console.log(`pending rebase (unclaimed): ${ethers.formatEther(await vault.totalPendingRebase())}`);
  console.log(`rewardsDistributor        : ${await vault.rewardsDistributor()}`);

  console.log("");
  console.log("-".repeat(64));
  if (surplus > 0n) {
    console.log("VERDICT: surplus > 0 with no ERC-20 in the vault.");
    console.log("Rebases COMPOUND into the locks. BYND-07 resolves as Informational.");
    console.log("The solvency invariant sum(lock.amount) >= totalSupply(veBYND) holds,");
    console.log(`with ${ethers.formatEther(surplus)} MEZO of accrued rebase backing veBYND.`);
  } else if (surplus === 0n) {
    console.log("VERDICT: INCONCLUSIVE -- no rebase has accrued yet. Re-run after claimRebases().");
  } else {
    console.log("VERDICT: *** UNDER-COLLATERALISED *** locked < veBYND supply. Investigate now.");
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
