const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

// upgrade-vault-approval-fix.js's own comments describe the exact failure
// mode we're hitting tonight: boostVoter.vote() reverting because
// ByNdVoter was never actually approved as an operator over the veMEZO
// NFTs ByNdVault holds. That fix should have already run once — this
// checks whether the approval is ACTUALLY set right now, for the CURRENT
// vault.voter() address specifically, rather than assuming a historical
// fix is still valid.
//
// Usage:
//   npx hardhat run scripts/check-voter-approval.js --network mezotestnet

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

const VAULT_ABI = [
  "function veMEZO() view returns (address)",
  "function voter() view returns (address)",
];
const VE_MEZO_ABI = [
  "function ownerOf(uint256) view returns (address)",
  "function isApprovedForAll(address owner, address operator) view returns (bool)",
  "function getApproved(uint256) view returns (address)",
];

async function main() {
  const chainId = (await ethers.provider.getNetwork()).chainId;
  if (chainId !== 31611n) throw new Error("Run with --network mezotestnet");

  const deployment = loadLatestDeployment();
  if (!deployment) throw new Error("No deployment record found in deployments/");

  const vaultAddr = deployment.contracts.ByNdVault;
  const voterAddr = deployment.contracts.ByNdVoter;

  const vault = await ethers.getContractAt(VAULT_ABI, vaultAddr, ethers.provider);
  const veMezoAddr = await vault.veMEZO();
  const currentVoterInVault = await vault.voter();
  const veMezo = await ethers.getContractAt(VE_MEZO_ABI, veMezoAddr, ethers.provider);

  console.log("=".repeat(60));
  console.log("Approval check");
  console.log("=".repeat(60));
  console.log(`ByNdVault              : ${vaultAddr}`);
  console.log(`veMEZO contract        : ${veMezoAddr}`);
  console.log(`vault.voter() (current): ${currentVoterInVault}`);
  console.log(`Deployment record's ByNdVoter address: ${voterAddr}`);
  console.log(`These match: ${currentVoterInVault.toLowerCase() === voterAddr.toLowerCase()}`);

  const owner860 = await veMezo.ownerOf(860).catch((e) => `ERROR: ${e.shortMessage || e.message}`);
  console.log(`\nownerOf(860): ${owner860}`);

  const isApproved = await veMezo.isApprovedForAll(vaultAddr, currentVoterInVault);
  console.log(`\nisApprovedForAll(vault, currentVoter): ${isApproved}`);

  if (!isApproved) {
    console.log("\n*** NOT APPROVED. This is almost certainly why boostVoter.vote() reverts");
    console.log("*** for every call made by ByNdVoter tonight — Mezo's real veMEZO/BoostVoter");
    console.log("*** requires the caller to be the NFT owner OR an approved operator, and");
    console.log("*** ByNdVoter is neither right now.");
    console.log("\nFix: call vault.grantVoterApproval() (if that function still exists on the");
    console.log("current ByNdVault implementation) to approve the CURRENT voter address.");
  } else {
    console.log("\nApproval IS set correctly. The revert must have a different cause —");
    console.log("worth checking Mezo's BoostVoter for other requirements (e.g. a minimum");
    console.log("lock duration, a whitelist, or the tokenId being mid-transfer/merge).");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
