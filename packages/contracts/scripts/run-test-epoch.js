const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

const VEMEZO_TOKEN_ID = process.env.VEMEZO_TOKEN_ID || "846";
const GAUGE_ADDRESS = process.env.GAUGE_ADDRESS || "0xb61D510dF1f1aeFc23016C39F5beA213E2f6e173";
const BRIBE_ADDRESS = process.env.BRIBE_ADDRESS || "0x79ab1b030CCBa5Dca3f2B10D6a9293A274D99a68";
const BRIBE_TOKEN = process.env.BRIBE_TOKEN || "0x7B7c000000000000000000000000000000000001"; // MEZO

function loadLatestDeployment() {
  const dir = path.join(__dirname, "..", "deployments");
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(`${network.name}-`) && f.endsWith(".json"))
    .sort();
  if (files.length === 0) {
    throw new Error(`No deployment record found for network "${network.name}" in ${dir}`);
  }
  const latest = files[files.length - 1];
  console.log(`Using deployment record: ${latest}`);
  return JSON.parse(fs.readFileSync(path.join(dir, latest), "utf8"));
}

function fmtDuration(seconds) {
  const s = Number(seconds);
  if (s <= 0) return "now";
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const mins = Math.floor((s % 3600) / 60);
  return `${days}d ${hours}h ${mins}m`;
}

async function main() {
  const chainId = (await ethers.provider.getNetwork()).chainId;
  if (chainId !== 31611n && chainId !== 31337n) {
    throw new Error(
      `This script targets Mezo Matsnet (31611) or a local hardhat network ` +
      `(31337) for dry-run testing. Got ${chainId}.`
    );
  }

  const deployment = loadLatestDeployment();
  const [signer] = await ethers.getSigners();
  console.log(`Signer: ${signer.address}\n`);

  const vault = await ethers.getContractAt("ByNdVault", deployment.contracts.ByNdVault);
  const voter = await ethers.getContractAt("ByNdVoter", deployment.contracts.ByNdVoter);

  console.log(`Step 1: deposit veMEZO #${VEMEZO_TOKEN_ID} into ByNdVault...`);
  const existingDepositor = await vault.depositorOf(VEMEZO_TOKEN_ID);
  if (existingDepositor !== ethers.ZeroAddress) {
    console.log(`  Already deposited (depositor: ${existingDepositor}). Skipping.`);
  } else {
    const veMEZO = await ethers.getContractAt(
      ["function approve(address,uint256) external"],
      await vault.veMEZO()
    );
    await (await veMEZO.approve(deployment.contracts.ByNdVault, VEMEZO_TOKEN_ID)).wait();
    await (await vault.deposit(VEMEZO_TOKEN_ID)).wait();
    console.log(`  Deposited.`);
  }

  console.log(`\nStep 2: configure gauge ${GAUGE_ADDRESS}...`);
  const currentGaugeStruct = await voter.gauges(0).catch(() => null);
  const currentGaugeAddr = currentGaugeStruct ? currentGaugeStruct[0] : null;
  if (currentGaugeAddr && currentGaugeAddr.toLowerCase() === GAUGE_ADDRESS.toLowerCase()) {
    console.log(`Already configured. Skipping.`);
  } else {
    await (
      await voter.setGauges(
        [GAUGE_ADDRESS],
        [BRIBE_ADDRESS],
        ["test-gauge"],
        [10000],
        [[BRIBE_TOKEN]]
      )
    ).wait();
    console.log(`  Configured.`);
  }

  const currentEpoch = await voter.currentEpoch();
  const alreadyVoted = await voter.epochVoted(currentEpoch);
  console.log(`\nStep 3: optimiseAndVote() (epoch ${currentEpoch})...`);
  console.log(`  Callable anytime now — no vote window to wait for.`);
  if (alreadyVoted) {
    console.log(`  Already voted this epoch. Skipping.`);
  } else {
    await (await voter.optimiseAndVote()).wait();
    console.log(`  Voted.`);
  }

  const alreadyHarvested = await voter.epochHarvested(currentEpoch);
  console.log(`\nStep 4: claimBribesBatch() (epoch ${currentEpoch})...`);
  if (alreadyHarvested) {
    console.log(`  Already harvested this epoch. Nothing to do.`);
    return;
  }
  let progress = await voter.claimProgress();
  while (!progress.readyToHarvest) {
    const tx = await voter.claimBribesBatch(200);
    const receipt = await tx.wait();
    progress = await voter.claimProgress();
    console.log(`  Claimed batch (tx ${receipt.hash}) — cursor ${progress.cursor}/${progress.total}`);
  }
  console.log(`  All managed tokenIds claimed for this epoch.`);

  console.log(`\nStep 5: harvestAndDistribute() (epoch ${currentEpoch})...`);
  const tx = await voter.harvestAndDistribute();
  const receipt = await tx.wait();
  console.log(`  Harvested. Tx: ${receipt.hash}`);
  console.log(`\nFull epoch cycle complete — check the Harvested/KeeperPaid events for amounts.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});