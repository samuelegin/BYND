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
//   USE_TIMELOCK            - set to "true" to gate BYNDEmissions.setParams()
//                            / setLpToken() behind an OZ TimelockController
//                            instead of granting ADMIN_ROLE straight to
//                            treasury. Recommended before mainnet; optional
//                            for testnet. When enabled, treasury only gets
//                            proposer/executor rights on the timelock, not
//                            ADMIN_ROLE on BYNDEmissions directly — changes
//                            to decay rate / LP-staking split then require
//                            going through the timelock's schedule()/
//                            execute() flow with TIMELOCK_MIN_DELAY_SECONDS
//                            of delay in between, so no single key can
//                            change protocol economics instantly.
//   TIMELOCK_MIN_DELAY_SECONDS - delay enforced between schedule() and
//                            execute() on the timelock. Defaults to 172800
//                            (2 days). Only used when USE_TIMELOCK=true.

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

  // ── 3b. Optional: gate setParams()/setLpToken() behind a timelock ───
  const useTimelock = (process.env.USE_TIMELOCK || "").toLowerCase() === "true";
  let timelockAddress = null;
  let timelockMinDelay = null;

  if (useTimelock) {
    timelockMinDelay = process.env.TIMELOCK_MIN_DELAY_SECONDS || "172800"; // 2 days
    console.log(`\nDeploying TimelockController (min delay: ${timelockMinDelay}s)...`);

    // treasury is both proposer and executor for now (single-key controlled,
    // but every setParams()/setLpToken() call is still forced through the
    // delay — the point isn't multisig-style access control yet, it's
    // removing the ability to change protocol economics instantly).
    const Timelock = await ethers.getContractFactory("TimelockController");
    const timelock = await Timelock.deploy(
      timelockMinDelay,
      [treasury],       // proposers
      [treasury],       // executors
      ethers.ZeroAddress // no separate timelock admin — avoids a second bypass path
    );
    await timelock.waitForDeployment();
    timelockAddress = await timelock.getAddress();
    console.log(`TimelockController deployed: ${timelockAddress}`);

    const adminRole = await emissions.ADMIN_ROLE();
    const defaultAdminRole = await emissions.DEFAULT_ADMIN_ROLE();

    let t = await emissions.grantRole(adminRole, timelockAddress);
    await t.wait();
    t = await emissions.grantRole(defaultAdminRole, timelockAddress);
    await t.wait();
    console.log(`ADMIN_ROLE + DEFAULT_ADMIN_ROLE on BYNDEmissions granted to TimelockController`);

    // renounceRole can only be called BY the account being renounced
    // (AccessControl enforces msg.sender == account) — this script signs as
    // `deployer`, so it can only self-service this when treasury IS the
    // deployer wallet. If a separate TREASURY_ADDRESS (e.g. a multisig) was
    // used, that account has to renounce its own roles itself afterward.
    if (treasury.toLowerCase() === deployer.address.toLowerCase()) {
      t = await emissions.renounceRole(adminRole, treasury);
      await t.wait();
      t = await emissions.renounceRole(defaultAdminRole, treasury);
      await t.wait();
      console.log(`ADMIN_ROLE + DEFAULT_ADMIN_ROLE on BYNDEmissions renounced by treasury (== deployer)`);
    } else {
      console.log(
        `\nWARNING: treasury (${treasury}) still holds ADMIN_ROLE + DEFAULT_ADMIN_ROLE ` +
        `on BYNDEmissions alongside the TimelockController — this script signs as the ` +
        `deployer wallet and can't renounce another account's role for it. ` +
        `Have the treasury account call emissions.renounceRole(ADMIN_ROLE, treasury) ` +
        `and emissions.renounceRole(DEFAULT_ADMIN_ROLE, treasury) itself once you're ` +
        `ready to fully hand control to the timelock — until then, treasury retains ` +
        `an instant bypass around the delay.`
      );
    }
    console.log(
      `\nNOTE: setLpToken() is also ADMIN_ROLE-gated, so once your veBYND/MEZO ` +
      `pool is seeded, wiring it in now goes through the timelock too — schedule() ` +
      `it, wait ${timelockMinDelay}s, then execute().`
    );
  } else {
    console.log(
      `\nUSE_TIMELOCK not set — treasury (${treasury}) holds ADMIN_ROLE on ` +
      `BYNDEmissions directly, so setParams()/setLpToken() take effect instantly. ` +
      `Set USE_TIMELOCK=true to gate them behind a delay instead.`
    );
  }

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
    timelock: useTimelock ? { address: timelockAddress, minDelaySeconds: timelockMinDelay } : null,
  };

  const outFile = path.join(outDir, `bynd-token-${network.name}-${record.timestamp}.json`);
  fs.writeFileSync(outFile, JSON.stringify(record, null, 2));
  console.log(`\nDeployment record saved:   ${outFile}`);

  console.log("\nNext steps:");
  console.log("1. Verify both contracts (see verify commands).");
  console.log(
    useTimelock
      ? "2. If LP_TOKEN_ADDRESS wasn't set, schedule() + execute() setLpToken() through the TimelockController once your pool is live."
      : "2. If LP_TOKEN_ADDRESS wasn't set, call setLpToken() once your pool is live."
  );
  console.log("3. Add BYND / BYNDEmissions addresses to apps/web/.env for the frontend.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
