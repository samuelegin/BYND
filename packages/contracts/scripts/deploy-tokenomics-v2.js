// scripts/deploy-tokenomics-v2.js
//
// Deploys the full mainnet tokenomics redesign as one coherent stack:
// BYND, a shared TimelockController, BYNDEmissions, BYNDTeamVesting,
// BYNDInvestorVesting, BYNDTreasuryReserve, BYNDEcosystemReserve — then
// wires MINTER_ROLE (BYND -> every minting contract) and TIMELOCK_ROLE
// (every monetary-policy contract -> the one shared timelock).
//
// Supersedes scripts/deploy-bynd-token.js, which:
//   - still defaulted to the old 1 BYND/sec rate, not the confirmed 0.8
//   - recorded the old lpPoolWeightBps field/70-30 split, not today's
//     lpWeightBps/stakingWeightBps (60/40)
//   - wired its timelock to ADMIN_ROLE + DEFAULT_ADMIN_ROLE, which is
//     STALE against the current BYNDEmissions.sol: setWeeklyDecayBps(),
//     setEmissionSplit(), and setLpToken() are gated by TIMELOCK_ROLE
//     specifically now, a role that script never granted at all — running
//     it as-is would deploy a timelock with no actual power over the
//     contract
//   - only touched BYND + BYNDEmissions, nothing about vesting/reserves
//
// ONE shared TimelockController governs the whole stack, not five
// separate ones — a single, coherent governance path for all
// monetary-policy decisions across the entire tokenomics system, matching
// the "multisig -> timelock -> governance" model from the brief.
//
// Required env vars (packages/contracts/.env):
//   DEPLOYER_PRIVATE_KEY   - deployer wallet
//   VEBYND_ADDRESS         - your already-deployed VeBYND token address
//
// Optional env vars:
//   LP_TOKEN_ADDRESS       - veBYND/MEZO LP token address, if already
//                            seeded. Leave unset to deploy with the LP
//                            pool inactive and call setLpToken() later
//                            through the timelock.
//   TREASURY_ADDRESS       - receives DEFAULT_ADMIN_ROLE / ADMIN_ROLE
//                            (role-management only, NOT monetary policy)
//                            on every new contract. Defaults to deployer.
//   BYND_CAP               - global hard cap, whole tokens. Default 100M.
//   BYND_INITIAL_RATE      - combined emission rate at week 0, whole BYND
//                            per second. Default 0.8 — the confirmed
//                            mainnet tokenomics parameter (NOT 1.0).
//   TIMELOCK_PROPOSER      - address allowed to schedule timelock actions.
//                            Defaults to the deployer wallet — swap this
//                            to a real multisig before mainnet (see the
//                            WARNING this script prints when it's unset).
//   TIMELOCK_MIN_DELAY_SECONDS - delay between schedule() and execute().
//                            Defaults to 172800 (48 hours, confirmed).
//   TGE_TIMESTAMP           - unix timestamp the team vesting pool's
//                            12-month cliff is measured from. Defaults to
//                            "now" (this deploy) if unset — set this
//                            explicitly if you're deploying the vesting
//                            pool ahead of the real token-generation
//                            event, so the cliff is measured from the
//                            actual launch date, not today.

const fs = require("fs");
const path = require("path");
const { ethers, network } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying from: ${deployer.address}`);
  console.log(`Network: ${network.name}\n`);

  const veByndAddress = process.env.VEBYND_ADDRESS;
  if (!veByndAddress) {
    throw new Error("VEBYND_ADDRESS is required in packages/contracts/.env");
  }

  const lpTokenAddress = process.env.LP_TOKEN_ADDRESS || ethers.ZeroAddress;
  const treasury = process.env.TREASURY_ADDRESS || deployer.address;

  const capTokens = process.env.BYND_CAP || "100000000";
  const cap = ethers.parseEther(capTokens);

  const rateTokens = process.env.BYND_INITIAL_RATE || "0.8"; // confirmed mainnet default
  const initialRatePerSecond = ethers.parseEther(rateTokens);

  const timelockProposer = process.env.TIMELOCK_PROPOSER || deployer.address;
  const timelockMinDelay = process.env.TIMELOCK_MIN_DELAY_SECONDS || "172800"; // 48h, confirmed
  if (!process.env.TIMELOCK_PROPOSER) {
    console.log(
      "WARNING: TIMELOCK_PROPOSER not set — using the deployer wallet as the " +
      "sole proposer. This is fine for testnet, but swap to a real multisig " +
      "before mainnet: whoever holds proposer rights can schedule any " +
      "monetary-policy change, subject only to the timelock delay.\n"
    );
  }

  const tgeTimestamp = process.env.TGE_TIMESTAMP || String(Math.floor(Date.now() / 1000));
  if (!process.env.TGE_TIMESTAMP) {
    console.log(
      "NOTE: TGE_TIMESTAMP not set — using this deploy's own timestamp as TGE. " +
      "If you're deploying team vesting ahead of the real launch date, set " +
      "TGE_TIMESTAMP explicitly so the 12-month cliff is measured from the " +
      "actual token-generation event, not today.\n"
    );
  }

  console.log(`BYND cap:                  ${capTokens} BYND`);
  console.log(`Initial emission rate:     ${rateTokens} BYND/sec (combined, both pools)`);
  console.log(`veBYND (staking pool):     ${veByndAddress}`);
  console.log(`LP token (LP pool):        ${lpTokenAddress === ethers.ZeroAddress ? "(not set yet)" : lpTokenAddress}`);
  console.log(`Admin / treasury:          ${treasury}`);
  console.log(`Timelock proposer:         ${timelockProposer}`);
  console.log(`Timelock min delay:        ${timelockMinDelay}s`);
  console.log(`TGE timestamp:             ${tgeTimestamp} (${new Date(Number(tgeTimestamp) * 1000).toISOString()})\n`);

  // ── 1. Deploy BYND ─────────────────────────────────────────────────────
  const BYND = await ethers.getContractFactory("BYND");
  const bynd = await BYND.deploy(treasury, cap);
  await bynd.waitForDeployment();
  const byndAddress = await bynd.getAddress();
  console.log(`BYND deployed:              ${byndAddress}`);

  // ── 2. Deploy the ONE shared TimelockController ─────────────────────────
  // executors: address(0) grants EXECUTOR_ROLE to everyone — standard OZ
  // pattern, safe because proposing (the actually-restricted step) already
  // requires PROPOSER_ROLE; once something is proposed and the delay has
  // passed, there's no meaningful reason to also restrict who triggers it.
  // admin: the deployer, temporarily — needed to add the real multisig as
  // proposer later without redeploying. Renounce this before mainnet (see
  // the printed reminder at the end of this script).
  console.log(`\nDeploying TimelockController (min delay: ${timelockMinDelay}s)...`);
  const Timelock = await ethers.getContractFactory("TimelockController");
  const timelock = await Timelock.deploy(
    timelockMinDelay,
    [timelockProposer],
    [ethers.ZeroAddress],
    deployer.address,
  );
  await timelock.waitForDeployment();
  const timelockAddress = await timelock.getAddress();
  console.log(`TimelockController deployed: ${timelockAddress}`);

  // ── 3. Deploy BYNDEmissions ──────────────────────────────────────────────
  const Emissions = await ethers.getContractFactory("BYNDEmissions");
  const emissions = await Emissions.deploy(
    treasury, byndAddress, veByndAddress, lpTokenAddress, initialRatePerSecond,
  );
  await emissions.waitForDeployment();
  const emissionsAddress = await emissions.getAddress();
  console.log(`BYNDEmissions deployed:      ${emissionsAddress}`);

  // ── 4. Deploy vesting + reserve pools ────────────────────────────────────
  const TeamVesting = await ethers.getContractFactory("BYNDTeamVesting");
  const teamVesting = await TeamVesting.deploy(treasury, byndAddress, tgeTimestamp);
  await teamVesting.waitForDeployment();
  const teamVestingAddress = await teamVesting.getAddress();
  console.log(`BYNDTeamVesting deployed:    ${teamVestingAddress}`);

  const InvestorVesting = await ethers.getContractFactory("BYNDInvestorVesting");
  const investorVesting = await InvestorVesting.deploy(treasury, byndAddress);
  await investorVesting.waitForDeployment();
  const investorVestingAddress = await investorVesting.getAddress();
  console.log(`BYNDInvestorVesting deployed: ${investorVestingAddress}`);

  const TreasuryReserve = await ethers.getContractFactory("BYNDTreasuryReserve");
  const treasuryReserve = await TreasuryReserve.deploy(treasury, byndAddress);
  await treasuryReserve.waitForDeployment();
  const treasuryReserveAddress = await treasuryReserve.getAddress();
  console.log(`BYNDTreasuryReserve deployed: ${treasuryReserveAddress}`);

  const EcosystemReserve = await ethers.getContractFactory("BYNDEcosystemReserve");
  const ecosystemReserve = await EcosystemReserve.deploy(treasury, byndAddress);
  await ecosystemReserve.waitForDeployment();
  const ecosystemReserveAddress = await ecosystemReserve.getAddress();
  console.log(`BYNDEcosystemReserve deployed: ${ecosystemReserveAddress}\n`);

  // ── 5. Wire MINTER_ROLE (BYND -> every minting contract) ────────────────
  const minterRole = await bynd.MINTER_ROLE();
  for (const [label, addr] of [
    ["BYNDEmissions", emissionsAddress],
    ["BYNDTeamVesting", teamVestingAddress],
    ["BYNDInvestorVesting", investorVestingAddress],
    ["BYNDTreasuryReserve", treasuryReserveAddress],
    ["BYNDEcosystemReserve", ecosystemReserveAddress],
  ]) {
    const tx = await bynd.grantRole(minterRole, addr);
    await tx.wait();
    console.log(`MINTER_ROLE granted:         BYND -> ${label}`);
  }

  // ── 6. Wire TIMELOCK_ROLE (every monetary-policy contract -> timelock) ──
  // ADMIN_ROLE/DEFAULT_ADMIN_ROLE deliberately stay with `treasury` on every
  // contract — those only govern role management (who can grant/revoke
  // roles), not monetary policy, so there's nothing to renounce here. This
  // is the actual fix for what deploy-bynd-token.js got wrong: TIMELOCK_ROLE
  // is the role that gates real economic parameters, and it's what actually
  // needs to point at the timelock, not ADMIN_ROLE.
  console.log("");
  for (const [label, contract] of [
    ["BYNDEmissions", emissions],
    ["BYNDTeamVesting", teamVesting],
    ["BYNDInvestorVesting", investorVesting],
    ["BYNDTreasuryReserve", treasuryReserve],
    ["BYNDEcosystemReserve", ecosystemReserve],
  ]) {
    const timelockRole = await contract.TIMELOCK_ROLE();
    const tx = await contract.grantRole(timelockRole, timelockAddress);
    await tx.wait();
    console.log(`TIMELOCK_ROLE granted:       ${label} -> TimelockController`);
  }

  // ── 7. Save deployment record ────────────────────────────────────────────
  const outDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const record = {
    network: network.name,
    chainId: (await ethers.provider.getNetwork()).chainId.toString(),
    timestamp: Date.now(),
    deployer: deployer.address,
    treasury,
    contracts: {
      BYND: byndAddress,
      TimelockController: timelockAddress,
      BYNDEmissions: emissionsAddress,
      BYNDTeamVesting: teamVestingAddress,
      BYNDInvestorVesting: investorVestingAddress,
      BYNDTreasuryReserve: treasuryReserveAddress,
      BYNDEcosystemReserve: ecosystemReserveAddress,
    },
    veBYND: veByndAddress,
    lpToken: lpTokenAddress,
    cap: capTokens,
    initialRatePerSecond: rateTokens,
    weeklyDecayBps: 9850,
    lpWeightBps: 6000,
    stakingWeightBps: 4000,
    maxProtocolEmissions: "40000000",
    teamPoolCap: "10000000",
    investorPoolCap: "10000000",
    treasuryReserveCap: "15000000",
    ecosystemReserveCap: "20000000",
    tgeTimestamp,
    timelock: { address: timelockAddress, minDelaySeconds: timelockMinDelay, proposer: timelockProposer },
  };

  const outFile = path.join(outDir, `tokenomics-v2-${network.name}-${record.timestamp}.json`);
  fs.writeFileSync(outFile, JSON.stringify(record, null, 2));
  console.log(`\nDeployment record saved:     ${outFile}`);

  console.log("\nNext steps:");
  console.log("1. Verify every contract (see verify commands).");
  console.log(
    lpTokenAddress === ethers.ZeroAddress
      ? "2. Once your veBYND/MEZO pool is seeded, schedule() + execute() setLpToken() through the timelock."
      : "2. LP pool already set.",
  );
  console.log(
    `3. Before mainnet: transfer the timelock's TIMELOCK_ADMIN_ROLE to your real multisig, ` +
    `add the multisig as a proposer, then have the deployer renounce its own ` +
    `TIMELOCK_ADMIN_ROLE — see the deploy plan for the exact commands.`,
  );
  console.log("4. Add all seven contract addresses to apps/web/.env for the frontend.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
