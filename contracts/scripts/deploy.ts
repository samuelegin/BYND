import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

//Mezo Matsnet native addresses
const MATSNET = {
  VeMEZO: "0xaCE816CA2bcc9b12C59799dcC5A959Fb9b98111b",
  MUSD:   "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503",
  MEZO:   "0x7B7c000000000000000000000000000000000001",
  ValidatorsVoter: "0x21d7bDF5a5929AD179F8cA0c9014A0B62ae6Bfd1" // BoostVoter on Matsnet,
};

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();

  console.log("BynD Protocol Deployment");
  console.log(`Network  : ${network.name} (chainId ${network.chainId})`);
  console.log(`Deployer : ${deployer.address}`);
  console.log(`Balance  : ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} BTC`);

  const isLocalhost = network.chainId === 31337n;

  let veMEZOAddr: string;
  let musdAddr: string;
  let voterAddr: string;

  if (isLocalhost) {
    console.log("Deploying mocks for localhost...");

    const MockERC20   = await ethers.getContractFactory("MockERC20");
    const MockVeMEZO  = await ethers.getContractFactory("MockVeMEZO");
    const MockVoter   = await ethers.getContractFactory("MockValidatorsVoter");

    const mockMUSD   = await MockERC20.deploy("Mock MUSD", "MUSD", 18);
    const mockVeMEZO = await MockVeMEZO.deploy();
    const mockVoter  = await MockVoter.deploy(await mockMUSD.getAddress());

    await mockMUSD.waitForDeployment();
    await mockVeMEZO.waitForDeployment();
    await mockVoter.waitForDeployment();

    veMEZOAddr = await mockVeMEZO.getAddress();
    musdAddr   = await mockMUSD.getAddress();
    voterAddr  = await mockVoter.getAddress();

    await mockMUSD.mint(deployer.address, ethers.parseEther("1000000"));
    await mockVeMEZO.mint(deployer.address, 1);
    await mockVeMEZO.mint(deployer.address, 2);
    await mockVeMEZO.mint(deployer.address, 3);

    console.log(`MockVeMEZO : ${veMEZOAddr}`);
    console.log(`MockMUSD : ${musdAddr}`);
    console.log(`MockVoter : ${voterAddr}`);
    console.log("Test tokens minted\n");

  } else {
    if (MATSNET.ValidatorsVoter === "0x0000000000000000000000000000000000000000") {
      console.error("ValidatorsVoter address not set in MATSNET config.");
      console.error("Find it at: https://docs.mezo.org or https://explorer.test.mezo.org");
      process.exit(1);
    }
    veMEZOAddr = MATSNET.VeMEZO;
    musdAddr = MATSNET.MUSD;
    voterAddr = MATSNET.ValidatorsVoter;
    console.log("Using Matsnet native addresses\n");
  }

  console.log("Deploying VeBYND...");
  const VeBYND = await ethers.getContractFactory("VeBYND");
  const veBYND = await VeBYND.deploy();
  await veBYND.waitForDeployment();
  const veBYNDAddr = await veBYND.getAddress();
  console.log(`VeBYND: ${veBYNDAddr}\n`);

  console.log("Deploying ByNdVault...");
  const ByNdVault = await ethers.getContractFactory("ByNdVault");
  const vault = await ByNdVault.deploy(veMEZOAddr, veBYNDAddr);
  await vault.waitForDeployment();
  const vaultAddr = await vault.getAddress();
  console.log(`ByNdVault: ${vaultAddr}\n`);

  console.log("Deploying ByNdStaking...");
  const ByNdStaking = await ethers.getContractFactory("ByNdStaking");
  const staking = await ByNdStaking.deploy(veBYNDAddr, musdAddr, deployer.address);
  await staking.waitForDeployment();
  const stakingAddr = await staking.getAddress();
  console.log(`ByNdStaking: ${stakingAddr}\n`);

  console.log("Deploying ByNdVoter...");
  const ByNdVoter = await ethers.getContractFactory("ByNdVoter");
  const voter = await ByNdVoter.deploy(musdAddr, stakingAddr, voterAddr);
  await voter.waitForDeployment();
  const voterDeployedAddr = await voter.getAddress();
  console.log(`ByNdVoter: ${voterDeployedAddr}\n`);

  console.log("Wiring permissions...");

  const MINTER_ROLE = await veBYND.MINTER_ROLE();
  await (await veBYND.grantRole(MINTER_ROLE, vaultAddr)).wait();
  console.log("VeBYND MINTER_ROLE → ByNdVault");

  await (await staking.setDistributor(voterDeployedAddr)).wait();
  console.log("ByNdStaking distributor → ByNdVoter\n");

  console.log("Gauge configuration...");

  if (isLocalhost) {
    const gaugeA   = ethers.Wallet.createRandom().address;
    const gaugeB   = ethers.Wallet.createRandom().address;
    const bribeA   = ethers.Wallet.createRandom().address;
    const bribeB   = ethers.Wallet.createRandom().address;

    // Register gauges in the mock BoostVoter so isAlive() returns true
    const mockVoterContract = await ethers.getContractAt("MockValidatorsVoter", voterAddr);
    await (await mockVoterContract.addGauge(gaugeA, bribeA)).wait();
    await (await mockVoterContract.addGauge(gaugeB, bribeB)).wait();
    console.log("Test gauges registered in MockValidatorsVoter");

    // setGauges(gauges[], bribes[], names[], weightsBps[], tokens[][])
    await (await voter.setGauges(
      [gaugeA, gaugeB],                    // _gauges
      [bribeA, bribeB],                    // _bribes
      ["BTC / MUSD LP", "MEZO / MUSD LP"], // _names
      [7000, 3000],                        // _weightsBps (must sum to 10000)
      [[], []]                             // _tokens (bribe reward tokens, empty for test)
    )).wait();
    console.log("2 test gauges set (70% / 30%)\n");
  } else {
    console.log("Skipping gauge setup on Matsnet.");
    console.log("Run voter.setGauges() manually with real ValidatorsVoter gauge addresses.\n");
  }

  const result = {
    network:     network.name,
    chainId:     network.chainId.toString(),
    deployedAt:  new Date().toISOString(),
    deployer:    deployer.address,
    contracts: {
      VeBYND: veBYNDAddr,
      ByNdVault: vaultAddr,
      ByNdStaking: stakingAddr,
      ByNdVoter: voterDeployedAddr,
    },
    native: {
      VeMEZO: veMEZOAddr,
      MUSD: musdAddr,
      ValidatorsVoter: voterAddr,
    },
  };

  console.log("Deployment Complete");
  console.log(JSON.stringify(result, null, 2));

  const outPath = path.join(__dirname, "..", "deployed-addresses.json");
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log(`\n Saved to: ${outPath}`);
  console.log("\n Next: copy contracts addresses into src/lib/contracts.ts");
  console.log("Then run: npm run dev in the frontend\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});