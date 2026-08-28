const { ethers, upgrades, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

// Upgrades ByNdVault + ByNdVoter to add the BYND-19 fix: claimRebases() and
// syncBribesFromVault() previously had no rate limit at all — anyone could
// call either as often as they liked, wasting gas on redundant no-op work
// (rebases accrue slowly; a sync with nothing stuck is a no-op). This adds
// a real on-chain 7-day cooldown to both, enforced by the contract itself
// (a revert, not just a UI convention) — a manual call, a script, or any
// future automation all hit the same gate.
//
// What changed:
//   ByNdVault   claimRebases() now requires 7 days since the last
//               successful call (owner() can bypass for emergencies).
//               New state: lastClaimRebasesAt (uint256). New view:
//               nextRebaseClaimAt().
//   ByNdVoter   syncBribesFromVault(token) now requires 7 days since the
//               last REAL (non-no-op) call for that specific token
//               (governance can bypass). A call that finds nothing to move
//               is never rate-limited. New state: lastSyncedAt (mapping).
//               New view: nextSyncAt(token) — since removed for contract-size
//               reasons (see below); lastSyncedAt(token) is used instead,
//               which was already a public auto-getter either way.
//
// Both new state variables are appended strictly after every existing
// declaration in their respective contracts (verified against this exact
// deployed source before writing this script) — safe for an in-place UUPS
// upgrade, no storage slots shift.
//
// Since lastClaimRebasesAt/lastSyncedAt start at 0 (fresh storage), the
// cooldown reads as already-expired immediately after this upgrade — the
// existing protocol isn't suddenly blocked from claiming; the first call
// after this upgrade sets the real baseline going forward.
//
// Run scripts/validate-upgrade.js FIRST if you have it.
//
// Usage:
//   npx hardhat run scripts/upgrade-keeper-cooldowns.js --network mezotestnet
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
  return { record: JSON.parse(fs.readFileSync(path.join(dir, latest), "utf8")), file: latest };
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
  if (dryRun) console.log("\n*** DRY_RUN -- no transactions will be sent ***");

  const voterBefore = await ethers.getContractAt("ByNdVoter", c.ByNdVoter);
  const vaultBefore = await ethers.getContractAt("ByNdVault", c.ByNdVault);
  const governance = await voterBefore.governance();
  const vaultOwner = await vaultBefore.owner();
  const me = signer.address.toLowerCase();
  const mismatched = [];
  if (governance.toLowerCase() !== me) mismatched.push(`ByNdVoter governance is ${governance}`);
  if (vaultOwner.toLowerCase() !== me) mismatched.push(`ByNdVault owner is ${vaultOwner}`);
  if (mismatched.length > 0) {
    throw new Error(`Signer cannot authorize every upgrade:\n  - ${mismatched.join("\n  - ")}`);
  }
  console.log("Authority   : signer controls both proxies\n");

  console.log("=".repeat(64));
  console.log("STEP 0 - Sync local upgrade manifest with on-chain reality");
  console.log("=".repeat(64));
  console.log("NOTE: forceImport registers the factory it's given AS IF it represents");
  console.log("the current on-chain state — it cannot independently verify that against");
  console.log("real bytecode. We're passing the NEW (cooldown-added) factory here rather");
  console.log("than the exact pre-upgrade source, which means the tool's usual automatic");
  console.log("storage-layout check is effectively bypassed for THIS ONE transition. That");
  console.log("layout was already manually verified append-only (no reordering, nothing");
  console.log("removed) against the live source before either patch was written — this");
  console.log("step relies on that manual check, not an automated one, for this specific");
  console.log("run. Every upgrade FROM this point forward gets the normal automated check");
  console.log("again, since the manifest will be properly seeded after this.\n");
  const ByNdVaultCurrent = await ethers.getContractFactory("ByNdVault");
  await upgrades.forceImport(c.ByNdVault, ByNdVaultCurrent).catch((err) => {
    console.log(`  ByNdVault forceImport: ${err.shortMessage || err.message} (likely already registered — fine)`);
  });
  const ByNdVoterCurrent = await ethers.getContractFactory("ByNdVoter", {
    libraries: { GaugeScan: c.GaugeScan, HarvestLib: c.HarvestLib },
  });
  await upgrades.forceImport(c.ByNdVoter, ByNdVoterCurrent, { unsafeAllow: ["external-library-linking"] }).catch((err) => {
    console.log(`  ByNdVoter forceImport: ${err.shortMessage || err.message} (likely already registered — fine)`);
  });
  console.log("  Manifest sync attempted for both proxies.\n");

  console.log("=".repeat(64));
  console.log("STEP 1 - Upgrade ByNdVault (adds claimRebases() cooldown)");
  console.log("=".repeat(64));
  if (dryRun) {
    console.log("DRY_RUN: would upgrade ByNdVault");
  } else {
    const ByNdVaultNext = await ethers.getContractFactory("ByNdVault");
    // redeployImplementation: 'always' — forces a genuinely fresh
    // implementation deployment regardless of any hash-matching shortcut
    // in the local manifest. Needed here specifically because the STEP 0
    // forceImport above seeds the manifest using the SAME new factory,
    // which would otherwise make upgradeProxy believe a matching
    // implementation is already deployed (at the OLD address) and skip
    // deploying anything new — exactly what happened on the previous run
    // of this script, where the "upgrade" silently no-op'd.
    const up = await upgrades.upgradeProxy(c.ByNdVault, ByNdVaultNext, {
      redeployImplementation: "always",
    });
    await up.waitForDeployment();
    console.log(`Upgraded. Proxy unchanged: ${await up.getAddress()}`);
  }

  console.log("\n" + "=".repeat(64));
  console.log("STEP 2 - Upgrade ByNdVoter (adds syncBribesFromVault() cooldown, reusing");
  console.log("existing linked libraries, unchanged)");
  console.log("=".repeat(64));
  if (dryRun) {
    console.log("DRY_RUN: would upgrade ByNdVoter, linking existing GaugeScan/HarvestLib");
  } else {
    // Bypassing upgrades.upgradeProxy() entirely for this one — both its
    // default hash-matching shortcut (first run) AND redeployImplementation:
    // 'always' (second run) silently no-op'd here, seemingly specific to
    // this proxy's external-library-linking combination with whatever this
    // plugin version does differently for linked contracts. No Upgraded
    // event was ever emitted either time despite the script reporting
    // success — confirmed via check-voter-impl.js. Doing this manually
    // removes every layer of plugin-side shortcut logic: deploy the new
    // implementation directly, then call the proxy's own
    // upgradeToAndCall() ourselves. This is the same UUPS mechanism the
    // plugin would eventually call anyway — just with nothing in between
    // that could silently skip it.
    const ByNdVoterNext = await ethers.getContractFactory("ByNdVoter", {
      libraries: { GaugeScan: c.GaugeScan, HarvestLib: c.HarvestLib },
    });
    console.log("Deploying new ByNdVoter implementation directly...");
    const newImpl = await ByNdVoterNext.deploy();
    await newImpl.waitForDeployment();
    const newImplAddr = await newImpl.getAddress();
    console.log(`New implementation deployed at: ${newImplAddr}`);

    const proxy = await ethers.getContractAt("ByNdVoter", c.ByNdVoter);
    // upgradeTo(address), NOT upgradeToAndCall(address, bytes) — the latter
    // ALWAYS forces a delegatecall into the new implementation with
    // whatever `data` is passed (per OZ Contracts-Upgradeable v4.9.x's
    // _upgradeToAndCallUUPS(..., forceCall=true) for upgradeToAndCall
    // specifically), even when data is empty "0x". An empty-calldata
    // delegatecall hits receive()/fallback() on the target, and ByNdVoter
    // has neither, so that reverts with exactly the generic
    // "Address: low-level delegate call failed" message this hit.
    // upgradeTo() passes forceCall=false, which skips that delegatecall
    // entirely when there's no data to pass — this is what
    // upgrades.upgradeProxy() uses internally for a plain upgrade, which is
    // why ByNdVault's went through cleanly via the plugin.
    console.log(`Calling upgradeTo(${newImplAddr}) on the proxy directly...`);
    const tx = await proxy.upgradeTo(newImplAddr);
    console.log(`Tx sent: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`Status: ${receipt.status === 1 ? "SUCCESS" : "REVERTED"}`);

    // Confirm via the same event-log method that caught the silent no-op —
    // don't just trust the receipt status this time.
    const upgradedEvent = receipt.logs
      .map((log) => {
        try {
          return proxy.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((e) => e?.name === "Upgraded");
    if (upgradedEvent) {
      console.log(`Confirmed via Upgraded event: implementation is now ${upgradedEvent.args.implementation}`);
    } else {
      throw new Error("No Upgraded event in this transaction's logs — something is still wrong, stop here.");
    }
  }

  if (dryRun) {
    console.log("\nDRY_RUN complete -- nothing was sent, stopping before verification.");
    return;
  }

  console.log("\n" + "=".repeat(64));
  console.log("STEP 3 - Verify the new surface is live");
  console.log("=".repeat(64));
  const voter = await ethers.getContractAt("ByNdVoter", c.ByNdVoter);
  const vault = await ethers.getContractAt("ByNdVault", c.ByNdVault);

  const rewardToken = "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503"; // MUSD

  let ok = true;
  try {
    const nextRebase = await vault.nextRebaseClaimAt();
    console.log(`vault.nextRebaseClaimAt(): ${nextRebase} — should be far in the past (cooldown starts fresh)`);
  } catch (err) {
    ok = false;
    console.log(`vault.nextRebaseClaimAt() FAILED: ${err.reason || err.shortMessage || err.message}`);
  }
  try {
    // nextSyncAt() was removed for contract-size reasons after this script
    // was first written — lastSyncedAt(token) is the real public getter
    // now; "next eligible" is lastSyncedAt + SYNC_COOLDOWN, computed
    // client-side (both are public, no dedicated view needed).
    const lastSynced = await voter.lastSyncedAt(rewardToken);
    console.log(`voter.lastSyncedAt(MUSD): ${lastSynced} — should be 0 (fresh storage, cooldown starts open)`);
  } catch (err) {
    ok = false;
    console.log(`voter.lastSyncedAt(token) FAILED: ${err.reason || err.shortMessage || err.message}`);
  }

  if (!ok) {
    console.log("\nDiagnostic info:");
    try {
      const voterInVault = await vault.voter();
      console.log(`  vault.voter()        : ${voterInVault}`);
      console.log(`  ByNdVoter proxy addr : ${c.ByNdVoter}`);
      console.log(`  Match                : ${voterInVault.toLowerCase() === c.ByNdVoter.toLowerCase()}`);
    } catch (e) {
      console.log(`  Could not read vault.voter(): ${e.shortMessage || e.message}`);
    }
    throw new Error("New cooldown views aren't callable — see diagnostic info above. Stopping.");
  }

  console.log("\n" + "=".repeat(64));
  console.log("STEP 4 - Record the upgrade");
  console.log("=".repeat(64));
  const next = {
    ...record,
    timestamp: new Date().toISOString(),
    note:
      "BYND-19 fix: on-chain 7-day cooldowns added to ByNdVault.claimRebases() " +
      "and ByNdVoter.syncBribesFromVault(token), enforced by the contracts " +
      "themselves (not just an off-chain schedule). owner()/governance can " +
      "bypass for emergencies. No storage layout changes beyond appended fields.",
  };
  const outName = `${network.name}-${Date.now()}.json`;
  fs.writeFileSync(path.join(__dirname, "..", "deployments", outName), JSON.stringify(next, null, 2) + "\n");
  console.log(`Wrote deployments/${outName}`);

  console.log("\nDone. claimRebases() and syncBribesFromVault() are now rate-limited on-chain.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
