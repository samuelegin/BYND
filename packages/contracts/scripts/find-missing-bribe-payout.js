const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

// earned(token, 860) just dropped from 900 to 0 after our claimBribesBatch()
// call — meaning the Bribe contract's internal accounting believes the
// reward WAS paid out. But ByNdVoter's balance is still 0. This checks the
// most likely destination: Mezo's Bribe contract may pay out to the veMEZO
// NFT's registered owner (IERC721.ownerOf) rather than to msg.sender
// (ByNdVoter, the caller). If ByNdVault — not ByNdVoter — actually holds
// custody of tokenId 860, the funds may have landed there instead.
//
// Usage:
//   npx hardhat run scripts/find-missing-bribe-payout.js --network mezotestnet

function loadLatestDeployment() {
  const dir = path.join(__dirname, "..", "deployments");
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(`${network.name}-`) && f.endsWith(".json"))
    .sort();
  if (files.length === 0) return null;
  const latest = files[files.length - 1];
  console.log(`Using deployment record: ${latest}\n`);
  return JSON.parse(fs.readFileSync(path.join(dir, latest), "utf8"));
}

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
];
const IVE_MEZO_ABI = ["function ownerOf(uint256) view returns (address)"];
const VAULT_ABI = ["function veMEZO() view returns (address)"];

const MUSD = "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503";
const TOKEN_ID = 860n;

async function main() {
  const chainId = (await ethers.provider.getNetwork()).chainId;
  if (chainId !== 31611n) throw new Error(`Run with --network mezotestnet`);

  const deployment = loadLatestDeployment();
  if (!deployment) throw new Error("No deployment record found in deployments/");

  const token = await ethers.getContractAt(ERC20_ABI, MUSD, ethers.provider);
  const decimals = await token.decimals();
  const symbol = await token.symbol().catch(() => "MUSD");

  console.log("=".repeat(60));
  console.log("STEP 1 — Who actually owns tokenId 860 on the real veMEZO NFT contract?");
  console.log("=".repeat(60));
  const vault = await ethers.getContractAt(VAULT_ABI, deployment.contracts.ByNdVault, ethers.provider);
  const veMezoAddr = await vault.veMEZO();
  const veMezo = await ethers.getContractAt(IVE_MEZO_ABI, veMezoAddr, ethers.provider);
  const owner = await veMezo.ownerOf(TOKEN_ID);
  console.log(`veMEZO contract   : ${veMezoAddr}`);
  console.log(`ownerOf(860)      : ${owner}`);
  console.log(`ByNdVault address : ${deployment.contracts.ByNdVault}`);
  console.log(`ByNdVoter address : ${deployment.contracts.ByNdVoter}`);
  if (owner.toLowerCase() === deployment.contracts.ByNdVault.toLowerCase()) {
    console.log(`  -> ByNdVault holds custody, NOT ByNdVoter. If the Bribe contract pays`);
    console.log(`     out to the registered NFT owner, funds would land in ByNdVault.`);
  } else if (owner.toLowerCase() === deployment.contracts.ByNdVoter.toLowerCase()) {
    console.log(`  -> ByNdVoter itself holds custody — payout-to-owner would match where`);
    console.log(`     we already checked (0 balance), so that's not the explanation.`);
  } else {
    console.log(`  -> Owned by neither of our contracts — unexpected, worth a closer look.`);
  }

  console.log("\n" + "=".repeat(60));
  console.log("STEP 2 — Balances everywhere plausible right now");
  console.log("=".repeat(60));
  for (const [label, addr] of [
    ["ByNdVoter", deployment.contracts.ByNdVoter],
    ["ByNdVault", deployment.contracts.ByNdVault],
    ["ByNdStaking", deployment.contracts.ByNdStaking],
  ]) {
    const bal = await token.balanceOf(addr);
    console.log(`${label.padEnd(14)} (${addr}): ${ethers.formatUnits(bal, decimals)} ${symbol}`);
  }

  console.log("\n" + "=".repeat(60));
  console.log("STEP 3 — Recent MUSD Transfer events (last ~2000 blocks) to find where it actually went");
  console.log("=".repeat(60));
  const filter = token.filters.Transfer();
  const events = await token.queryFilter(filter, -2000).catch((e) => {
    console.log(`(getLogs failed / range-limited: ${e.shortMessage || e.message})`);
    return [];
  });
  const relevant = events.filter((e) => e.args.value > 0n);
  if (relevant.length === 0) {
    console.log("No MUSD Transfer events found in the last ~2000 blocks.");
  } else {
    for (const e of relevant.slice(-10)) {
      console.log(
        `  ${e.transactionHash}  ${e.args.from} -> ${e.args.to}  ${ethers.formatUnits(e.args.value, decimals)} ${symbol}`,
      );
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
