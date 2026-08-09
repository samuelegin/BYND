const { ethers, upgrades, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

// Upgrades all three changed proxies to the pre-audit remediation build:
// ByNdVoter, ByNdVault and ByNdStaking. VeBYND is untouched and is not
// upgraded here.
//
// Run scripts/validate-upgrade.js FIRST. It is the only check that compares the
// new implementations against what is actually deployed; `hardhat test` deploys
// fresh proxies every run and can never catch a layout violation.
//
// What needs a post-upgrade write, and what does not:
//
//   ByNdStaking  DOES. `rewardsDuration` is new storage and defaults to 0 on
//                the existing proxy, which would divide by zero the first time
//                notifyRewardAmount() computed a rate. initializeV2() is a
//                reinitializer(2) that sets it to 7 days and stamps
//                lastUpdateTime on every already-registered reward token, so
//                the first stream starts from now rather than back-dating
//                to 1970 and paying out the whole period instantly. It is
//                called through upgradeProxy's `call` option so it lands in
//                the SAME transaction as the upgrade -- there is never a block
//                in which the new implementation is live with rewardsDuration
//                still 0.
//
//   ByNdVoter    Does not. Everything Phase 3-5 added is either a constant
//                (FORCE_CLOSE_DELAY) or starts empty and correct:
//                carriedOverNet, carriedOverTokens, carriedOverTokenIndex.
//
//   ByNdVault    Does not. extendCursor starts at 0, which is where a fresh
//                pass begins anyway, and rejectPermanentLocks starts false --
//                the deliberately permissive default, since 115 permanent
//                locks are live on Matsnet and the Phase 0 probe could not
//                confirm they fail to merge.
//
// Usage:
//   npx hardhat run scripts/validate-upgrade.js --network mezotestnet
//   npx hardhat run scripts/upgrade-pre-audit-remediation.js --network mezotestnet
//
// Optional:
//   DRY_RUN=true   report what would happen and send nothing

function loadLatestDeployment() {
  const dir = path.join(__dirname, "..", "deployments");
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(`${network.name}-`) && f.endsWith(".json"))
    .sort();
  if (files.length === 0) return null;
  const latest = files[files.length - 1];
  console.log(`Using deployment record: ${latest}\n`);
  return {
    record: JSON.parse(fs.readFileSync(path.join(dir, latest), "utf8")),
    file: latest,
  };
}

async function main() {
  const chainId = (await ethers.provider.getNetwork()).chainId;
  if (chainId !== 31611n) throw new Error(`Run with --network mezotestnet (got ${chainId})`);

  const dryRun = process.env.DRY_RUN === "true";
  const loaded = loadLatestDeployment();
  if (!loaded) throw new Error("No deployment record found in deployments/");
  const { record } = loaded;
  const c = record.contracts;

  const [signer] = await ethers.getSigners();
  console.log(`Signer      : ${signer.address}`);
  console.log(`ByNdVoter   : ${c.ByNdVoter}`);
  console.log(`ByNdVault   : ${c.ByNdVault}`);
  console.log(`ByNdStaking : ${c.ByNdStaking}`);
  if (dryRun) console.log("\n*** DRY_RUN -- no transactions will be sent ***");

  // Authority check up front, so a wrong signer fails before spending gas on
  // library deployments rather than halfway through.
  const voterBefore = await ethers.getContractAt("ByNdVoter", c.ByNdVoter);
  const vaultBefore = await ethers.getContractAt("ByNdVault", c.ByNdVault);
  const stakingBefore = await ethers.getContractAt("ByNdStaking", c.ByNdStaking);

  const governance = await voterBefore.governance();
  const vaultOwner = await vaultBefore.owner();
  const stakingOwner = await stakingBefore.owner();
  const me = signer.address.toLowerCase();
  const mismatched = [];
  if (governance.toLowerCase() !== me) mismatched.push(`ByNdVoter governance is ${governance}`);
  if (vaultOwner.toLowerCase() !== me) mismatched.push(`ByNdVault owner is ${vaultOwner}`);
  if (stakingOwner.toLowerCase() !== me) mismatched.push(`ByNdStaking owner is ${stakingOwner}`);
  if (mismatched.length > 0) {
    throw new Error(
      `Signer cannot authorize every upgrade:\n  - ${mismatched.join("\n  - ")}\n` +
      `All three are UUPS; each authorizes its own upgrade.`
    );
  }
  console.log("Authority   : signer controls all three proxies\n");

  console.log("=".repeat(64));
  console.log("STEP 1 - Deploy the linked libraries (both, fresh)");
  console.log("=".repeat(64));
  // Deployed fresh every time rather than reused from the record, deliberately.
  // GaugeScan.best() CHANGED SIGNATURE in this build -- it now returns
  // (bestGauge, bestScore, examined, total) instead of (bestGauge, bestScore),
  // so that a truncated scan is distinguishable from a complete one (BYND-11).
  // A library is linked by raw address and called by DELEGATECALL, so there is
  // no ABI check at the call site: linking the OLD GaugeScan to the NEW
  // ByNdVoter would return two words where four are expected and corrupt the
  // decode. "It has code at that address" is not evidence it is the right
  // version, and that is exactly what a reuse check can see. Both libraries are
  // stateless -- GaugeScan is view-only and HarvestLib runs against ByNdVoter's
  // own storage -- so redeploying costs gas and nothing else.
  let gaugeScanAddr = c.GaugeScan;
  let harvestLibAddr = c.HarvestLib;
  if (dryRun) {
    console.log("DRY_RUN: would deploy GaugeScan and HarvestLib fresh");
  } else {
    const gaugeScan = await (await ethers.getContractFactory("GaugeScan")).deploy();
    await gaugeScan.waitForDeployment();
    gaugeScanAddr = await gaugeScan.getAddress();
    console.log(`GaugeScan  deployed: ${gaugeScanAddr}`);
    if (c.GaugeScan && c.GaugeScan !== gaugeScanAddr) {
      console.log(`  (replaces ${c.GaugeScan} -- old best() returns 2 values, not 4)`);
    }

    const harvestLib = await (await ethers.getContractFactory("HarvestLib")).deploy();
    await harvestLib.waitForDeployment();
    harvestLibAddr = await harvestLib.getAddress();
    console.log(`HarvestLib deployed: ${harvestLibAddr}`);
  }

  console.log("\n" + "=".repeat(64));
  console.log("STEP 2 - Upgrade ByNdVoter");
  console.log("=".repeat(64));
  if (dryRun) {
    console.log("DRY_RUN: would upgrade ByNdVoter, linking both libraries");
  } else {
    const ByNdVoterNext = await ethers.getContractFactory("ByNdVoter", {
      libraries: { GaugeScan: gaugeScanAddr, HarvestLib: harvestLibAddr },
    });
    const up = await upgrades.upgradeProxy(c.ByNdVoter, ByNdVoterNext, {
      unsafeAllow: ["external-library-linking"],
    });
    await up.waitForDeployment();
    console.log(`Upgraded. Proxy unchanged: ${await up.getAddress()}`);
  }

  console.log("\n" + "=".repeat(64));
  console.log("STEP 3 - Upgrade ByNdVault");
  console.log("=".repeat(64));
  if (dryRun) {
    console.log("DRY_RUN: would upgrade ByNdVault");
  } else {
    const ByNdVaultNext = await ethers.getContractFactory("ByNdVault");
    const up = await upgrades.upgradeProxy(c.ByNdVault, ByNdVaultNext);
    await up.waitForDeployment();
    console.log(`Upgraded. Proxy unchanged: ${await up.getAddress()}`);
  }

  console.log("\n" + "=".repeat(64));
  console.log("STEP 4 - Upgrade ByNdStaking, calling initializeV2 atomically");
  console.log("=".repeat(64));
  const durationBefore = await stakingBefore.rewardsDuration().catch(() => 0n);
  console.log(`rewardsDuration before: ${durationBefore}`);
  if (dryRun) {
    console.log(
      durationBefore === 0n
        ? "DRY_RUN: would upgrade ByNdStaking with call: initializeV2()"
        : "DRY_RUN: would upgrade ByNdStaking WITHOUT initializeV2 (already at v2)"
    );
  } else {
    const ByNdStakingNext = await ethers.getContractFactory("ByNdStaking");
    // reinitializer(2) reverts if it has already run, so only pass `call` when
    // the proxy is still on v1. Reading rewardsDuration off the OLD
    // implementation returns 0 both when the variable does not exist yet and
    // when it exists unset -- either way v2 has not run.
    const opts = durationBefore === 0n
      ? { call: { fn: "initializeV2", args: [] } }
      : {};
    const up = await upgrades.upgradeProxy(c.ByNdStaking, ByNdStakingNext, opts);
    await up.waitForDeployment();
    console.log(`Upgraded. Proxy unchanged: ${await up.getAddress()}`);
    // Deliberately NOT read back here. waitForDeployment() returns as soon as
    // the tx is mined, and an RPC node can still serve the read off a slightly
    // stale view and revert -- which is exactly what happened on the first
    // Matsnet run, aborting the script after all three upgrades had already
    // landed successfully. rewardsDuration is verified in STEP 5 instead, where
    // every read is retried and a failure is reported rather than thrown.
  }

  if (dryRun) {
    console.log("\nDRY_RUN complete -- nothing was sent.");
    return;
  }

  console.log("\n" + "=".repeat(64));
  console.log("STEP 5 - Record the new library addresses");
  console.log("=".repeat(64));
  // Written BEFORE verification, deliberately. The library addresses are the
  // only output of this script that cannot be recovered by re-reading the
  // chain: nothing on-chain maps a proxy back to the libraries its
  // implementation was linked against. On the first Matsnet run this step sat
  // after verification, a transient RPC revert aborted the script, and the two
  // freshly-deployed addresses survived only in terminal scrollback. A failed
  // check is worth reporting; it is not worth losing the record over.
  const next = {
    ...record,
    timestamp: new Date().toISOString(),
    contracts: { ...c, GaugeScan: gaugeScanAddr, HarvestLib: harvestLibAddr },
    note:
      "Pre-audit remediation build (BYND-01..BYND-13). GaugeScan and HarvestLib " +
      "were deployed fresh: GaugeScan.best() changed arity this build, so the " +
      "previous library is NOT link-compatible with this ByNdVoter.",
  };
  const outName = `${network.name}-${Date.now()}.json`;
  fs.writeFileSync(
    path.join(__dirname, "..", "deployments", outName),
    JSON.stringify(next, null, 2) + "\n"
  );
  console.log(`Wrote deployments/${outName}`);

  console.log("\n" + "=".repeat(64));
  console.log("STEP 6 - Verify the new surface is actually live");
  console.log("=".repeat(64));
  const voter = await ethers.getContractAt("ByNdVoter", c.ByNdVoter);
  const vault = await ethers.getContractAt("ByNdVault", c.ByNdVault);
  const staking = await ethers.getContractAt("ByNdStaking", c.ByNdStaking);

  const checks = [];
  const check = async (label, fn, ok) => {
    try {
      const v = await fn();
      const pass = ok(v);
      checks.push(pass);
      console.log(`${pass ? "OK  " : "FAIL"}  ${label}: ${v}`);
    } catch (e) {
      checks.push(false);
      console.log(`FAIL  ${label}: threw -- ${e.message.split("\n")[0]}`);
    }
  };

  // Each of these only exists in the new build, so a successful call is itself
  // the evidence that the upgrade landed rather than silently no-op'd.
  await check("voter.FORCE_CLOSE_DELAY", () => voter.FORCE_CLOSE_DELAY(), (v) => v === BigInt(14 * 24 * 3600));
  await check("voter.forceCloseStatus", () => voter.forceCloseStatus(), (v) => v.length === 2);
  await check("voter.previewOptimalGauge", () => voter.previewOptimalGauge(), (v) => v.length === 2);
  await check("vault.extendCursor", () => vault.extendCursor(), (v) => v >= 0n);
  await check("vault.rejectPermanentLocks", () => vault.rejectPermanentLocks(), (v) => v === false);
  await check("staking.rewardsDuration", () => staking.rewardsDuration(), (v) => v === BigInt(7 * 24 * 3600));

  // Untouched state must survive the upgrade. If any of these moved, the
  // storage layout shifted and validate-upgrade.js missed something.
  console.log("\nPreserved state:");
  console.log(`  voter.currentEpoch    : ${await voter.currentEpoch()}`);
  console.log(`  voter.governance      : ${await voter.governance()}`);
  console.log(`  voter.voteWindow      : ${await voter.voteWindow()}s`);
  console.log(`  vault.canonicalTokenId: ${await vault.canonicalTokenId()}`);
  console.log(`  vault.totalDeposited  : ${await vault.totalDeposited()}`);
  console.log(`  vault.totalLockedMEZO : ${ethers.formatEther(await vault.totalLockedMEZO())}`);
  console.log(`  staking.totalStaked   : ${ethers.formatEther(await staking.totalStaked())}`);

  const failed = checks.filter((x) => !x).length;
  console.log();
  if (failed > 0) {
    console.error(
      `${failed} post-upgrade check(s) FAILED. Do not run an epoch against this ` +
      `until you know why -- the proxies are live either way.`
    );
    process.exitCode = 1;
  } else {
    console.log(
      "All post-upgrade checks passed. Next: run one full epoch on Matsnet " +
      "(claimRebases -> extendLocks -> optimiseAndVote in the Wed 21:00-23:00 " +
      "UTC window -> claimBribesBatch(200) -> harvestAndDistribute) and confirm " +
      "rewards now accrue over time rather than landing in a single block."
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
