const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

// Diagnoses why grantVoterApproval() reverted: checks the REAL on-chain
// vault.voter() and vault.owner() state directly, instead of trusting the
// static deployment JSON file (which only records what the deploy script
// intended, not necessarily what's actually live).
//
// Usage:
//   npx hardhat run scripts/check-vault-voter-state.js --network mezotestnet

function loadLatestDeployment() {
  const dir = path.join(__dirname, "..", "deployments");
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(`${network.name}-`) && f.endsWith(".json"))
    .sort();
  const latest = files[files.length - 1];
  console.log(`Using deployment record: ${latest}\n`);
  return JSON.parse(fs.readFileSync(path.join(dir, latest), "utf8"));
}

async function main() {
  const deployment = loadLatestDeployment();
  const vaultAddr = deployment.contracts.ByNdVault;
  const expectedVoterAddr = deployment.contracts.ByNdVoter;

  const [signer] = await ethers.getSigners();
  const vault = await ethers.getContractAt("ByNdVault", vaultAddr);

  console.log(`Vault proxy      : ${vaultAddr}`);
  console.log(`Signer           : ${signer.address}`);
  console.log(`Deployment record says voter should be: ${expectedVoterAddr}\n`);

  const onChainOwner = await vault.owner();
  const onChainVoter = await vault.voter();

  console.log(`vault.owner()    : ${onChainOwner}`);
  console.log(`  -> signer is owner: ${onChainOwner.toLowerCase() === signer.address.toLowerCase()}`);
  console.log(`vault.voter()    : ${onChainVoter}`);
  console.log(`  -> voter is set (non-zero): ${onChainVoter !== ethers.ZeroAddress}`);
  console.log(`  -> matches deployment record: ${onChainVoter.toLowerCase() === expectedVoterAddr.toLowerCase()}`);

  if (onChainVoter === ethers.ZeroAddress) {
    console.log(`\n*** vault.voter() is the zero address on-chain. This is why`);
    console.log(`*** grantVoterApproval() reverted with "ByNdVault: no voter set".`);
    console.log(`*** Fix: call setVoter(${expectedVoterAddr}) instead — it sets`);
    console.log(`*** voter AND grants the approval in the same transaction.`);
  } else if (onChainVoter.toLowerCase() !== expectedVoterAddr.toLowerCase()) {
    console.log(`\n*** vault.voter() is set, but to a DIFFERENT address than your`);
    console.log(`*** deployment record expects. Investigate before proceeding —`);
    console.log(`*** don't just re-run setVoter() blindly without knowing why.`);
  } else {
    console.log(`\nvoter is correctly set on-chain. The revert must be coming from`);
    console.log(`inside veMEZO.setApprovalForAll() itself — worth checking if`);
    console.log(`Mezo's real veMEZO has any restriction on who can be approved,`);
    console.log(`or whether the contract is paused.`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
