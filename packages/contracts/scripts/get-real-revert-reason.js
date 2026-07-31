const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

// grantVoterApproval() reverted with just "execution reverted" and no reason
// — that's Hardhat's gas estimator swallowing the real revert string from a
// public RPC. A direct staticCall on the vault (as if sent from the real
// owner) usually surfaces the actual reason string / custom error instead.
//
// Usage:
//   npx hardhat run scripts/get-real-revert-reason.js --network mezotestnet

function loadLatestDeployment() {
  const dir = path.join(__dirname, "..", "deployments");
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(`${network.name}-`) && f.endsWith(".json"))
    .sort();
  return JSON.parse(fs.readFileSync(path.join(dir, files[files.length - 1]), "utf8"));
}

async function main() {
  const deployment = loadLatestDeployment();
  const vaultAddr = deployment.contracts.ByNdVault;
  const voterAddr = deployment.contracts.ByNdVoter;
  const [signer] = await ethers.getSigners();

  const vault = await ethers.getContractAt("ByNdVault", vaultAddr);

  console.log("Trying vault.grantVoterApproval.staticCall() to surface the real revert reason...\n");
  try {
    await vault.grantVoterApproval.staticCall();
    console.log("Simulation SUCCEEDED — no revert. The earlier failure may have been a");
    console.log("transient RPC/gas-estimation issue. Try the real transaction again.");
  } catch (err) {
    console.log("Reverted. Details:");
    console.log(`  reason:        ${err.reason}`);
    console.log(`  shortMessage:  ${err.shortMessage}`);
    console.log(`  data:          ${err.data}`);
    console.log(`  full error:\n`, err);
  }

  console.log("\n" + "=".repeat(60));
  console.log("Also directly simulating veMEZO.setApprovalForAll(voter, true)");
  console.log("as if called BY the vault, to isolate whether the problem is in");
  console.log("grantVoterApproval() itself or inside veMEZO.");
  console.log("=".repeat(60));
  const veMEZOAddr = deployment.externalAddresses.veMEZO;
  const veMEZOAbi = ["function setApprovalForAll(address operator, bool approved) external"];
  const veMEZO = await ethers.getContractAt(veMEZOAbi, veMEZOAddr);
  try {
    await veMEZO.setApprovalForAll.staticCall(voterAddr, true, { from: vaultAddr });
    console.log("Simulation SUCCEEDED as the vault — setApprovalForAll itself is fine.");
    console.log("(Note: staticCall with `from` doesn't truly impersonate on a live");
    console.log("network, so treat a success here as weak evidence, not proof.)");
  } catch (err) {
    console.log("Reverted. Details:");
    console.log(`  reason:        ${err.reason}`);
    console.log(`  shortMessage:  ${err.shortMessage}`);
    console.log(`  data:          ${err.data}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
