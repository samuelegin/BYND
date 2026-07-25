// scripts/deploy-bynd-token.js
//
// Deploys BYND (the emissions/incentive token) and BYNDEmissions (the
// dual-pool emissions controller), then wires MINTER_ROLE.
//
// This does NOT touch, redeploy, or upgrade ByNdVault, ByNdStaking,
// ByNdVoter, or VeBYND — it only needs to READ the existing VeBYND address
// as a constructor argument (the staking pool's stake token).
//
// Required env vars (packages/contracts/.env):
//   DEPLOYER_PRIVATE_KEY   - deployer wallet
//   VEBYND_ADDRESS         - your already-deployed VeBYND token address
//
// Optional env vars:
//   LP_TOKEN_ADDRESS       - veBYND/MEZO LP token address, if the pool is
//                            already seeded. Leave unset to deploy with
//                            address(0) and call setLpToken() later once
//                            the pool exists.
//   TREASURY_ADDRESS       - receives DEFAULT_ADMIN_ROLE / ADMIN_ROLE on
//                            both new contracts. Defaults to the deployer.
//   BYND_CAP               - hard max supply, in whole tokens (not wei).
//                            Defaults to 100,000,000.
//   BYND_INITIAL_RATE      - combined emission rate at week 0, in whole
//                            BYND per second (not wei). Defaults to 1.0,
//                            which at the 1.5%/week default decay emits
//                            roughly ~40M BYND over the long run — see the
//                            NatSpec in BYNDEmissions.sol for the math.

const fs = require("fs");
const path = require("path");
const { ethers, network } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying from: ${deployer.address}`);
  console.log(`Network: ${network.name}`);

  const veByndAddress = process.env.VEBYND_ADDRESS;
  if (!veByndAddress) {
    throw new Error("VEBYND_ADDRESS is required in packages/contracts/.env");
  }

  const lpTokenAddress = process.env.LP_TOKEN_ADDRESS || ethers.ZeroAddress;
  if (lpTokenAddress === ethers.ZeroAddress) {
    console.log(
      "LP_TOKEN_ADDRESS not set — deploying with the LP pool inactive. " +
      "Call setLpToken() once your veBYND/MEZO pool is seeded."
    );
  }

  const treasury = process.env.TREASURY_ADDRESS || deployer.address;

  const capTokens = process.env.BYND_CAP || "100000000"; // 100M default
  const cap = ethers.parseEther(capTokens);

  const rateTokens = process.env.BYND_INITIAL_RATE || "1"; // 1 BYND/sec default
  const initialRatePerSecond = ethers.parseEther(rateTokens);

  console.log(`\nBYND cap:                 ${capTokens} BYND`);
  console.log(`Initial emission rate:     ${rateTokens} BYND/sec (combined, both pools)`);
  console.log(`veBYND (staking pool):     ${veByndAddress}`);
  console.log(`LP token (LP pool):        ${lpTokenAddress === ethers.ZeroAddress ? "(not set yet)" : lpTokenAddress}`);
  console.log(`Admin / treasury:          ${treasury}\n`);

  // ── 1. Deploy BYND ──────────────────────────────────────────────────
  const BYND = await ethers.getContractFactory("BYND");
  const bynd = await BYND.deploy(treasury, cap);
  await bynd.waitForDeployment();
  const byndAddress = await bynd.getAddress();
  console.log(`BYND deployed:             ${byndAddress}`);

  // ── 2. Deploy BYNDEmissions ─────────────────────────────────────────
  const Emissions = await ethers.getContractFactory("BYNDEmissions");
  const emissions = await Emissions.deploy(
    treasury,
    byndAddress,
    veByndAddress,
    lpTokenAddress,
    initialRatePerSecond
  );
  await emissions.waitForDeployment();
  const emissionsAddress = await emissions.getAddress();
  console.log(`BYNDEmissions deployed:    ${emissionsAddress}`);

  // ── 3. Wire MINTER_ROLE ─────────────────────────────────────────────
  const minterRole = await bynd.MINTER_ROLE();
  const tx = await bynd.grantRole(minterRole, emissionsAddress);
  await tx.wait();
  console.log(`MINTER_ROLE granted:       BYND -> BYNDEmissions`);

  // ── 4. Save deployment record ───────────────────────────────────────
  const outDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const record = {
    network: network.name,
    chainId: (await ethers.provider.getNetwork()).chainId.toString(),
    timestamp: Date.now(),
    deployer: deployer.address,
    treasury,
    BYND: byndAddress,
    BYNDEmissions: emissionsAddress,
    veBYND: veByndAddress,
    lpToken: lpTokenAddress,
    cap: capTokens,
    initialRatePerSecond: rateTokens,
    weeklyDecayBps: 9850,
    lpPoolWeightBps: 7000,
  };

  const outFile = path.join(outDir, `bynd-token-${network.name}-${record.timestamp}.json`);
  fs.writeFileSync(outFile, JSON.stringify(record, null, 2));
  console.log(`\nDeployment record saved:   ${outFile}`);

  console.log("\nNext steps:");
  console.log("1. Verify both contracts (see verify commands).");
  console.log("2. If LP_TOKEN_ADDRESS wasn't set, call setLpToken() once your pool is live.");
  console.log("3. Add BYND / BYNDEmissions addresses to apps/web/.env for the frontend.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
