import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// Mezo Matsnet native addresses
const MATSNET = {
  VeMEZO:               "0xaCE816CA2bcc9b12C59799dcC5A959Fb9b98111b",
  MUSD:                 "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503",
  MEZO:                 "0x7B7c000000000000000000000000000000000001",
  ValidatorsVoter:      "0x21d7bDF5a5929AD179F8cA0c9014A0B62ae6Bfd1",
  RewardsDistributor:   "0x2962E8817ae716019F759d098e2caE658bDcAd04",
};

// Maximum gauges to register in a single setGauges() tx.
// Each entry costs ~50-60k gas (struct with dynamic tokens array).
// Matsnet block limit is ~30M gas → 20 gauges ≈ 1.2M gas, well under limit.
const MAX_GAUGES = 20;

async function main() {
  const [deployer] = await ethers.getSigners();
  const network    = await ethers.provider.getNetwork();

  console.log("BynD Protocol Deployment");
  console.log(`Network  : ${network.name} (chainId ${network.chainId})`);
  console.log(`Deployer : ${deployer.address}`);
  console.log(`Balance  : ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} BTC`);

  const isLocalhost = network.chainId === 31337n;

  let veMEZOAddr: string;
  let musdAddr:   string;
  let voterAddr:  string;

  if (isLocalhost) {
    console.log("Deploying mocks for localhost...");

    const MockERC20  = await ethers.getContractFactory("MockERC20");
    const MockVeMEZO = await ethers.getContractFactory("MockVeMEZO");
    const MockVoter  = await ethers.getContractFactory("MockValidatorsVoter");

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
    console.log("Mocks deployed & test tokens minted\n");

  } else {
    veMEZOAddr = MATSNET.VeMEZO;
    musdAddr   = MATSNET.MUSD;
    voterAddr  = MATSNET.ValidatorsVoter;
    console.log("Using Matsnet native addresses\n");
  }

  // ── Core contracts ────────────────────────────────────────────────────────
  console.log("Deploying VeBYND...");
  const VeBYND  = await ethers.getContractFactory("VeBYND");
  const veBYND  = await VeBYND.deploy();
  await veBYND.waitForDeployment();
  const veBYNDAddr = await veBYND.getAddress();
  console.log(`VeBYND: ${veBYNDAddr}`);

  console.log("Deploying ByNdVault...");
  const ByNdVault = await ethers.getContractFactory("ByNdVault");
  const vault     = await ByNdVault.deploy(veMEZOAddr, veBYNDAddr);
  await vault.waitForDeployment();
  const vaultAddr = await vault.getAddress();
  console.log(`ByNdVault: ${vaultAddr}`);

  console.log("Deploying ByNdStaking...");
  const ByNdStaking = await ethers.getContractFactory("ByNdStaking");
  const staking     = await ByNdStaking.deploy(veBYNDAddr, musdAddr, deployer.address);
  await staking.waitForDeployment();
  const stakingAddr = await staking.getAddress();
  console.log(`ByNdStaking: ${stakingAddr}`);

  console.log("Deploying ByNdVoter...");
  const ByNdVoter = await ethers.getContractFactory("ByNdVoter");
  const voter     = await ByNdVoter.deploy(musdAddr, stakingAddr, voterAddr);
  await voter.waitForDeployment();
  const voterDeployedAddr = await voter.getAddress();
  console.log(`ByNdVoter: ${voterDeployedAddr}\n`);

  // ── Wiring ────────────────────────────────────────────────────────────────
  console.log("Wiring permissions...");
  const MINTER_ROLE = await veBYND.MINTER_ROLE();
  await (await veBYND.grantRole(MINTER_ROLE, vaultAddr)).wait();
  console.log("VeBYND MINTER_ROLE → ByNdVault");
  await (await staking.setDistributor(voterDeployedAddr)).wait();
  console.log("ByNdStaking distributor → ByNdVoter\n");
  console.log("✓ Epoch clock initialized in constructor (lastVoteTimestamp = block.timestamp)\n");

  // ── RewardsDistributor wiring (vault rebase compounding) ──────────────────
  if (!isLocalhost) {
    console.log("Setting RewardsDistributor on ByNdVault...");
    await (await vault.setRewardsDistributor(MATSNET.RewardsDistributor)).wait();
    console.log(`ByNdVault rewardsDistributor → ${MATSNET.RewardsDistributor}\n`);
  }

  // ── Gauge & token setup ───────────────────────────────────────────────────
  console.log("Gauge configuration...");

  if (isLocalhost) {
    const gaugeA = ethers.Wallet.createRandom().address;
    const gaugeB = ethers.Wallet.createRandom().address;
    const bribeA = ethers.Wallet.createRandom().address;
    const bribeB = ethers.Wallet.createRandom().address;

    const mockVoterContract = await ethers.getContractAt("MockValidatorsVoter", voterAddr);
    await (await mockVoterContract.addGauge(gaugeA, bribeA)).wait();
    await (await mockVoterContract.addGauge(gaugeB, bribeB)).wait();

    await (await voter.setGauges(
      [gaugeA, gaugeB],
      [bribeA, bribeB],
      ["BTC / MUSD LP", "MEZO / MUSD LP"],
      [7000, 3000],
      [[], []]
    )).wait();
    console.log("2 test gauges set (70%/30%)");

    await (await voter.setManagedTokenId(1)).wait();
    console.log("ByNdVoter managedTokenId → 1");
    await (await voter.setBoostVoter(voterAddr)).wait();
    console.log("ByNdVoter boostVoter → MockValidatorsVoter");

    const mockMUSDContract = await ethers.getContractAt("MockERC20", musdAddr);
    await (await mockMUSDContract.mint(voterDeployedAddr, ethers.parseEther("2000"))).wait();
    console.log("Minted 2000 MUSD to ByNdVoter for testing\n");

  } else {
    // On Matsnet: read live gauges from ValidatorsVoter and register up to MAX_GAUGES.
    // Strategy: prefer gauges that have non-zero claimable bribes; fill remaining
    // slots with the first alive gauges if needed.
    console.log("Reading live gauges from ValidatorsVoter...");
    try {
      const validatorsVoter = await ethers.getContractAt(
        ["function length() view returns (uint256)",
         "function gauges(uint256) view returns (address)",
         "function gaugeToBribe(address) view returns (address)",
         "function isAlive(address) view returns (bool)",
         "function claimable(address) view returns (uint256)"],
        voterAddr
      );
      const total = await validatorsVoter.length();
      console.log(`Found ${total} total gauges on ValidatorsVoter`);
      console.log(`Scanning for alive gauges (capped at ${MAX_GAUGES} for gas safety)...`);

      // Collect all alive gauges with their claimable amounts
      type GaugeEntry = { addr: string; bribe: string; claimable: bigint };
      const aliveGauges: GaugeEntry[] = [];

      for (let i = 0n; i < total; i++) {
        const g     = await validatorsVoter.gauges(i);
        const alive = await validatorsVoter.isAlive(g);
        if (!alive) continue;
        const bribe     = await validatorsVoter.gaugeToBribe(g);
        let claimableAmt = 0n;
        try { claimableAmt = await validatorsVoter.claimable(g); } catch {}
        aliveGauges.push({ addr: g, bribe, claimable: claimableAmt });
      }

      console.log(`Found ${aliveGauges.length} alive gauges`);

      // Sort by claimable descending (highest bribes first), then cap
      aliveGauges.sort((a, b) => (b.claimable > a.claimable ? 1 : b.claimable < a.claimable ? -1 : 0));
      const selected = aliveGauges.slice(0, MAX_GAUGES);

      console.log(`Registering top ${selected.length} gauges by claimable bribe amount`);
      if (selected.length < aliveGauges.length) {
        console.log(`  (${aliveGauges.length - selected.length} alive gauges skipped — run setGauges() manually to add more)`);
      }

      const gaugeAddrs: string[]   = [];
      const bribeAddrs: string[]   = [];
      const names:      string[]   = [];
      const tokens:     string[][] = [];

      for (const g of selected) {
        gaugeAddrs.push(g.addr);
        bribeAddrs.push(g.bribe);
        names.push(`Gauge ${gaugeAddrs.length}`);
        tokens.push([musdAddr]); // MUSD is the bribe token on Matsnet
      }

      // Build equal weights that sum exactly to 10000.
      // Use integer division and assign the remainder to the last gauge.
      const weights: number[] = buildEqualWeights(gaugeAddrs.length);

      if (gaugeAddrs.length > 0) {
        await (await voter.setGauges(gaugeAddrs, bribeAddrs, names, weights, tokens)).wait();
        console.log(`✓ Registered ${gaugeAddrs.length} gauges with equal weights`);
        for (let i = 0; i < gaugeAddrs.length; i++) {
          const bribeLabel = selected[i].claimable > 0n
            ? `  claimable: ${ethers.formatEther(selected[i].claimable)} MUSD`
            : `  claimable: 0`;
          console.log(`  [${i+1}] ${gaugeAddrs[i]} → bribe ${bribeAddrs[i]}${bribeLabel}`);
        }
      } else {
        console.log("No alive gauges found. Run voter.setGauges() manually.");
      }
    } catch (e) {
      console.log("Could not auto-register gauges:", e);
      console.log("Run voter.setGauges() manually with real ValidatorsVoter gauge addresses.");
    }
    console.log();
  }

  // ── Output ─────────────────────────────────────────────────────────────────
  const result = {
    network:    network.name,
    chainId:    network.chainId.toString(),
    deployedAt: new Date().toISOString(),
    deployer:   deployer.address,
    contracts: {
      VeBYND:      veBYNDAddr,
      ByNdVault:   vaultAddr,
      ByNdStaking: stakingAddr,
      ByNdVoter:   voterDeployedAddr,
    },
    native: {
      VeMEZO:             veMEZOAddr,
      MUSD:               musdAddr,
      ValidatorsVoter:    voterAddr,
      RewardsDistributor: isLocalhost ? "(mock — not set)" : MATSNET.RewardsDistributor,
    },
  };

  console.log("Deployment Complete");
  console.log(JSON.stringify(result, null, 2));

  const outPath = path.join(__dirname, "..", "deployed-addresses.json");
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log(`\n✓ Saved to: ${outPath}`);
  console.log("Next: update VITE_MATSNET_* in frontend/.env then npm run dev\n");
}

// Build N equal weights that sum exactly to 10_000 BPS.
// The last slot absorbs the rounding remainder.
function buildEqualWeights(n: number): number[] {
  if (n === 0) return [];
  const base      = Math.floor(10_000 / n);
  const remainder = 10_000 - base * n;
  const weights   = Array(n).fill(base);
  weights[n - 1] += remainder;
  return weights;
}

main().catch((err) => { console.error(err); process.exit(1); });
