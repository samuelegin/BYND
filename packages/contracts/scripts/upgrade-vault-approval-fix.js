const { ethers, upgrades, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

// Upgrades the existing ByNdVault proxy in place to include the
// veMEZO.setApprovalForAll(voter, true) fix, then calls grantVoterApproval()
// once so the currently-set voter (which was set under the OLD logic, before
// this fix existed) actually gets approved. No redeploy, no user
// re-deposits, no data migration — the proxy address and all state stay
// exactly the same.
//
// Usage:
//   npx hardhat run scripts/upgrade-vault-approval-fix.js --network mezotestnet

function loadLatestDeployment() {
  const dir = path.join(__dirname, "..", "deployments");
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(`${network.name}-`) && f.endsWith(".json"))
    .sort();
  if (files.length === 0) return null;
  const latest = files[files.length - 1];
  console.log(`Using deployment record: ${latest}\n`);
  return { file: latest, data: JSON.parse(fs.readFileSync(path.join(dir, latest), "utf8")) };
}

async function main() {
  const chainId = (await ethers.provider.getNetwork()).chainId;
  if (chainId !== 31611n) throw new Error(`Run with --network mezotestnet`);

  const deployment = loadLatestDeployment();
  if (!deployment) throw new Error("No deployment record found in deployments/");
  const vaultProxyAddr = deployment.data.contracts.ByNdVault;
  const voterAddr = deployment.data.contracts.ByNdVoter;

  console.log(`ByNdVault proxy : ${vaultProxyAddr}`);
  console.log(`Current voter   : ${voterAddr}\n`);

  const [signer] = await ethers.getSigners();
  console.log(`Signer          : ${signer.address}`);

  const vaultBefore = await ethers.getContractAt("ByNdVault", vaultProxyAddr);
  const owner = await vaultBefore.owner();
  if (owner.toLowerCase() !== signer.address.toLowerCase()) {
    throw new Error(
      `Signer (${signer.address}) is not the Vault's owner (${owner}). ` +
      `Only the owner can authorize a UUPS upgrade.`
    );
  }

  console.log("=".repeat(60));
  console.log("STEP 1 — Upgrade the ByNdVault proxy to the new implementation");
  console.log("=".repeat(60));
  const ByNdVaultV2 = await ethers.getContractFactory("ByNdVault");
  const upgraded = await upgrades.upgradeProxy(vaultProxyAddr, ByNdVaultV2);
  await upgraded.waitForDeployment();
  console.log(`Upgraded. Proxy address unchanged: ${await upgraded.getAddress()}`);

  console.log("\n" + "=".repeat(60));
  console.log("STEP 2 — Grant the currently-set voter operator approval");
  console.log("=".repeat(60));
  const tx = await upgraded.grantVoterApproval();
  const receipt = await tx.wait();
  console.log(`grantVoterApproval() tx: ${receipt.hash}`);

  console.log("\n" + "=".repeat(60));
  console.log("STEP 3 — Verify the approval actually landed");
  console.log("=".repeat(60));
  const veMEZOAddr = deployment.data.externalAddresses.veMEZO;
  const veMEZO = await ethers.getContractAt(
    ["function isApprovedForAll(address owner, address operator) view returns (bool)"],
    veMEZOAddr
  );
  const isApproved = await veMEZO.isApprovedForAll(vaultProxyAddr, voterAddr);
  console.log(`isApprovedForAll(vault, voter): ${isApproved}`);
  if (isApproved) {
    console.log(
      "\nDone. Next time optimiseAndVote() runs, boostVoter.vote() should " +
      "succeed instead of reverting — check with check-vote-status.js after " +
      "the next epoch's vote."
    );
  } else {
    console.log(
      "\n*** Still false — something else is wrong (wrong veMEZO address, " +
      "wrong voter address, or the tx above reverted silently). Investigate " +
      "before assuming this is fixed."
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
