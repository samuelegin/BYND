const { ethers, upgrades, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

const MATSNET_DEFAULTS = {
  VeMEZO: "0xaCE816CA2bcc9b12C59799dcC5A959Fb9b98111b",
  BoostVoter: "0x21d7bDF5a5929AD179F8cA0c9014A0B62ae6Bfd1",
  RewardsDistributor: "0x2962E8817ae716019F759d098e2caE658bDcAd04",
  MUSD: "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503",
};

function requiredEnvOrDefault(envVar, fallback, label) {
  const value = process.env[envVar] || fallback;
  if (!value) {
    throw new Error(`Missing ${envVar} and no default available for ${label}`);
  }
  if (!ethers.isAddress(value)) {
    throw new Error(`${envVar} (${label}) is not a valid address: ${value}`);
  }
  return value;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const chainId = (await ethers.provider.getNetwork()).chainId;

  console.log("Bynd Matsnet Deployment");
  console.log(`Network : ${network.name} (chainId ${chainId})`);
  console.log(`Deployer : ${deployer.address}`);
  console.log(
    `Balance   : ${ethers.formatEther(
      await ethers.provider.getBalance(deployer.address)
    )} BTC`
  );

  if (chainId !== 31611n && chainId !== 31337n) {
    throw new Error(
      `Refusing to run: this script is for Mezo Matsnet (31611) or a local ` +
      `hardhat network (31337) for dry-run testing. Got chainId ${chainId}.`
    );
  }
  const isLocalDryRun = chainId === 31337n;

  let veMEZOAddr, boostVoterAddr, rewardsDistributorAddr, musdAddr;

  if (isLocalDryRun) {
    console.log("\nLocal dry-run — deploying mocks in place of live Mezo infra...");
    const MockVeMEZO = await ethers.getContractFactory("MockVeMEZO");
    const veMEZO = await MockVeMEZO.deploy();
    await veMEZO.waitForDeployment();
    veMEZOAddr = await veMEZO.getAddress();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const bribeToken = await MockERC20.deploy("Bribe Token", "BRB", 18);
    await bribeToken.waitForDeployment();
    musdAddr = await bribeToken.getAddress();

    const MockBoostVoter = await ethers.getContractFactory("MockBoostVoter");
    const boostVoter = await MockBoostVoter.deploy(await bribeToken.getAddress());
    await boostVoter.waitForDeployment();
    boostVoterAddr = await boostVoter.getAddress();

    const MockRewardsDistributor = await ethers.getContractFactory("MockRewardsDistributor");
    const rewardsDistributor = await MockRewardsDistributor.deploy();
    await rewardsDistributor.waitForDeployment();
    rewardsDistributorAddr = await rewardsDistributor.getAddress();

    console.log(`Mock veMEZO : ${veMEZOAddr}`);
    console.log(`Mock BoostVoter : ${boostVoterAddr}`);
    console.log(`Mock RewardsDistributor : ${rewardsDistributorAddr}`);
    console.log(`Mock MUSD (bribe ref) : ${musdAddr}`);
  } else {
    veMEZOAddr = requiredEnvOrDefault("VEMEZO_ADDRESS", MATSNET_DEFAULTS.VeMEZO, "veMEZO");
    boostVoterAddr = requiredEnvOrDefault(
      "BOOST_VOTER_ADDRESS",
      MATSNET_DEFAULTS.BoostVoter,
      "BoostVoter"
    );
    rewardsDistributorAddr = requiredEnvOrDefault(
      "REWARDS_DISTRIBUTOR_ADDRESS",
      MATSNET_DEFAULTS.RewardsDistributor,
      "RewardsDistributor"
    );
    musdAddr = requiredEnvOrDefault("MUSD_ADDRESS", MATSNET_DEFAULTS.MUSD, "MUSD");
    console.log("\nUsing Matsnet native addresses:");
    console.log(`veMEZO : ${veMEZOAddr}`);
    console.log(`BoostVoter : ${boostVoterAddr}`);
    console.log(`RewardsDistributor : ${rewardsDistributorAddr}`);
    console.log(`MUSD : ${musdAddr}`);
  }

  const treasuryAddr = process.env.TREASURY_ADDRESS && ethers.isAddress(process.env.TREASURY_ADDRESS)
    ? process.env.TREASURY_ADDRESS
    : deployer.address;
  console.log(`Treasury : ${treasuryAddr}${treasuryAddr === deployer.address ? " (deployer, override with TREASURY_ADDRESS)" : ""}`);

  console.log("\nDeploying VeBYND...");
  const VeBYND = await ethers.getContractFactory("VeBYND");
  const veBYND = await upgrades.deployProxy(VeBYND, [deployer.address], { kind: "uups" });
  await veBYND.waitForDeployment();
  const veBYNDAddr = await veBYND.getAddress();
  console.log(`VeBYND: ${veBYNDAddr}`);

  console.log("Deploying ByNdVault...");
  const ByNdVault = await ethers.getContractFactory("ByNdVault");
  const vault = await upgrades.deployProxy(ByNdVault, [veMEZOAddr, veBYNDAddr], { kind: "uups" });
  await vault.waitForDeployment();
  const vaultAddr = await vault.getAddress();
  console.log(`ByNdVault: ${vaultAddr}`);

  console.log("Deploying ByNdStaking...");
  const ByNdStaking = await ethers.getContractFactory("ByNdStaking");

  const staking = await upgrades.deployProxy(
    ByNdStaking,
    [veBYNDAddr, deployer.address],
    { kind: "uups" }
  );
  await staking.waitForDeployment();
  const stakingAddr = await staking.getAddress();
  console.log(`ByNdStaking: ${stakingAddr}`);

  console.log("Deploying ByNdVoter...");
  const GaugeScan = await ethers.getContractFactory("GaugeScan");
  const gaugeScan = await GaugeScan.deploy();
  await gaugeScan.waitForDeployment();
  const gaugeScanAddr = await gaugeScan.getAddress();
  console.log(`GaugeScan: ${gaugeScanAddr}`);

  const ByNdVoter = await ethers.getContractFactory("ByNdVoter", {
    libraries: { GaugeScan: gaugeScanAddr },
  });
  const voter = await upgrades.deployProxy(
    ByNdVoter,
    [stakingAddr, boostVoterAddr, treasuryAddr, musdAddr],
    { kind: "uups", unsafeAllow: ["external-library-linking"] }
  );
  await voter.waitForDeployment();
  const voterAddr = await voter.getAddress();
  console.log(`ByNdVoter: ${voterAddr}`);

  console.log("\nWiring contracts together...");

  await (await veBYND.grantRole(await veBYND.MINTER_ROLE(), vaultAddr)).wait();
  console.log("VeBYND MINTER_ROLE  → ByNdVault");
  await (await veBYND.grantRole(await veBYND.BURNER_ROLE(), vaultAddr)).wait();
  console.log("VeBYND BURNER_ROLE  → ByNdVault");

  await (await vault.setVoter(voterAddr)).wait();
  console.log("ByNdVault.voter     → ByNdVoter");
  await (await vault.setRewardsDistributor(rewardsDistributorAddr)).wait();
  console.log("ByNdVault.rewardsDistributor → RewardsDistributor");

  await (await voter.setVault(vaultAddr)).wait();
  console.log("ByNdVoter.vault     → ByNdVault");

  await (await staking.setDistributor(voterAddr)).wait();
  console.log("ByNdStaking.distributor → ByNdVoter (placeholder swapped out)");

  console.log(
    "\nEpoch clock initialized at deploy time (lastVoteTimestamp = block.timestamp)."
  );
  console.log(
    "optimiseAndVote() is only callable in the final `voteWindow` seconds " +
    "(default 4h) before Mezo's real epoch boundary — it will revert with " +
    "'vote window not open' outside that window. Use timeUntilNextVote() to check."
  );
  console.log(
    "\nIMPORTANT: harvestAndDistribute() and claimBribesBatch() will revert " +
    "with 'gauges not configured' until governance calls voter.setGauges(...). " +
    "Run scan-matsnet-gauges.js to find live gauges, then wire them before the first epoch."
  );

  const deploymentInfo = {
    network: network.name,
    chainId: chainId.toString(),
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {
      VeBYND: veBYNDAddr,
      ByNdVault: vaultAddr,
      ByNdStaking: stakingAddr,
      ByNdVoter: voterAddr,
      GaugeScan: gaugeScanAddr,
    },
    externalAddresses: {
      veMEZO: veMEZOAddr,
      boostVoter: boostVoterAddr,
      rewardsDistributor: rewardsDistributorAddr,
      treasury: treasuryAddr,
    },
  };

  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) fs.mkdirSync(deploymentsDir);
  const outFile = path.join(deploymentsDir, `${network.name}-${Date.now()}.json`);
  fs.writeFileSync(outFile, JSON.stringify(deploymentInfo, null, 2));

  console.log(`\nDeployment record written to ${outFile}`);
  console.log("\n=== Summary ===");
  console.log(JSON.stringify(deploymentInfo.contracts, null, 2));
  console.log(
    "\nNote: governance/ownership is still held by the deployer key. " +
    "Multisig transfer is a separate, deliberate step — do NOT run it " +
    "automatically as part of this script."
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});