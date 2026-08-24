const { ethers, upgrades, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

// Upgrades ByNdVoter + ByNdVault to add the BYND-16 fix: Mezo's Bribe
// contract pays claimBribes() payouts to the veMEZO NFT's registered owner
// (the vault), not to msg.sender (ByNdVoter). A real claim landed 900 MUSD
// in the vault instead of ByNdVoter, and harvestAndDistribute() -- which
// only checks its own balance delta -- always saw 0 and reverted with
// "nothing harvested". This is structural, not a one-off: every future
// epoch hits the same wall without this fix.
//
// What changed:
//   ByNdVault   Adds forwardBribeToken(token, amount), gated to only accept
//               calls from `voter` (the already-stored ByNdVoter address).
//               No new storage — pure function addition, layout-safe.
//   ByNdVoter   Adds syncBribesFromVault(token), a new permissionless
//               keeper step (matches the existing Extend locks / Vote /
//               Claim bribes / Harvest pattern) that pulls whatever balance
//               claimBribesBatch() actually deposited into the vault, into
//               this contract. Deliberately NOT wired into
//               claimBribesBatch() itself — ByNdVoter sits close to the
//               24576-byte deployment limit (664 bytes headroom as of the
//               last size fix), so this stays a separate small function
//               rather than growing an existing one. No new storage either.
//
// After the upgrade, this script immediately:
//   1. Calls syncBribesFromVault(MUSD) to pull the 900 MUSD stuck in the
//      vault right now into ByNdVoter.
//   2. Calls harvestAndDistribute() to confirm the fix actually closes the
//      loop — this should now succeed where it always reverted before.
//
// Run scripts/validate-upgrade.js FIRST if you have it — it's the only
// check that compares new implementations against what's actually deployed
// for storage-layout violations, which `hardhat test` (fresh proxies every
// run) can never catch.
//
// Usage:
//   npx hardhat run scripts/upgrade-vault-bribe-forwarding-fix.js --network mezotestnet
//
// Optional:
//   DRY_RUN=true   report what would happen and send nothing
//   MUSD_ADDRESS=0x...   override the token to sync (defaults to MUSD)

const DEFAULT_MUSD = "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503";

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
  const musd = process.env.MUSD_ADDRESS || DEFAULT_MUSD;
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

  const musdToken = await ethers.getContractAt(
    ["function balanceOf(address) view returns (uint256)", "function decimals() view returns (uint8)"],
    musd,
  );
  const decimals = await musdToken.decimals();
  const vaultBalBefore = await musdToken.balanceOf(c.ByNdVault);
  console.log(`Vault MUSD balance before upgrade: ${ethers.formatUnits(vaultBalBefore, decimals)}\n`);

  console.log("=".repeat(64));
  console.log("STEP 1 - Upgrade ByNdVoter (reusing existing linked libraries, unchanged)");
  console.log("=".repeat(64));
  if (dryRun) {
    console.log("DRY_RUN: would upgrade ByNdVoter, linking existing GaugeScan/HarvestLib");
  } else {
    const ByNdVoterNext = await ethers.getContractFactory("ByNdVoter", {
      libraries: { GaugeScan: c.GaugeScan, HarvestLib: c.HarvestLib },
    });
    const up = await upgrades.upgradeProxy(c.ByNdVoter, ByNdVoterNext, {
      unsafeAllow: ["external-library-linking"],
    });
    await up.waitForDeployment();
    console.log(`Upgraded. Proxy unchanged: ${await up.getAddress()}`);
  }

  console.log("\n" + "=".repeat(64));
  console.log("STEP 2 - Upgrade ByNdVault");
  console.log("=".repeat(64));
  if (dryRun) {
    console.log("DRY_RUN: would upgrade ByNdVault");
  } else {
    const ByNdVaultNext = await ethers.getContractFactory("ByNdVault");
    const up = await upgrades.upgradeProxy(c.ByNdVault, ByNdVaultNext);
    await up.waitForDeployment();
    console.log(`Upgraded. Proxy unchanged: ${await up.getAddress()}`);
  }

  if (dryRun) {
    console.log("\nDRY_RUN complete -- nothing was sent, stopping before recovery steps.");
    return;
  }

  console.log("\n" + "=".repeat(64));
  console.log("STEP 3 - Verify the new surface is live");
  console.log("=".repeat(64));
  const voter = await ethers.getContractAt("ByNdVoter", c.ByNdVoter);
  const vault = await ethers.getContractAt("ByNdVault", c.ByNdVault);
  // A successful call to a function that only exists in the new build IS the
  // evidence the upgrade landed, rather than silently no-op'd. Surface the
  // REAL revert reason instead of collapsing to a boolean — a swallowed
  // error here just hides what actually went wrong.
  let vaultBalCheck = false;
  try {
    await voter.syncBribesFromVault.staticCall(musd);
    vaultBalCheck = true;
  } catch (err) {
    console.log(`syncBribesFromVault simulation failed:`);
    console.log(`  reason : ${err.reason || "(no decoded revert reason)"}`);
    console.log(`  raw    : ${err.shortMessage || err.message}`);
  }
  console.log(`voter.syncBribesFromVault callable: ${vaultBalCheck}`);
  if (!vaultBalCheck) {
    // Don't hard-stop anymore — the boolean-only version stopped here with
    // no diagnostic info. Print what we can about current wiring instead,
    // since that's usually the real cause (e.g. vault.voter not pointing at
    // this proxy after upgrade, or an implementation address mismatch).
    console.log("\nDiagnostic info:");
    try {
      const voterInVault = await vault.voter();
      console.log(`  vault.voter()        : ${voterInVault}`);
      console.log(`  ByNdVoter proxy addr : ${c.ByNdVoter}`);
      console.log(`  Match                : ${voterInVault.toLowerCase() === c.ByNdVoter.toLowerCase()}`);
    } catch (e) {
      console.log(`  Could not read vault.voter(): ${e.shortMessage || e.message}`);
    }
    throw new Error("syncBribesFromVault isn't callable — see diagnostic info above. Stopping.");
  }

  console.log("\n" + "=".repeat(64));
  console.log("STEP 4 - Recover the stuck 900 MUSD: syncBribesFromVault(MUSD)");
  console.log("=".repeat(64));
  const tx1 = await voter.syncBribesFromVault(musd);
  console.log(`Tx sent: ${tx1.hash}`);
  const receipt1 = await tx1.wait();
  console.log(`Status: ${receipt1.status === 1 ? "SUCCESS" : "REVERTED"}`);

  const voterBalAfter = await musdToken.balanceOf(c.ByNdVoter);
  const vaultBalAfter = await musdToken.balanceOf(c.ByNdVault);
  console.log(`ByNdVoter MUSD balance now: ${ethers.formatUnits(voterBalAfter, decimals)}`);
  console.log(`ByNdVault MUSD balance now: ${ethers.formatUnits(vaultBalAfter, decimals)}`);

  if (voterBalAfter === 0n) {
    console.log("\n*** Sync moved nothing. Do NOT proceed to harvest — investigate first.");
    return;
  }

  console.log("\n" + "=".repeat(64));
  console.log("STEP 5 - harvestAndDistribute() — should finally succeed");
  console.log("=".repeat(64));
  const tx2 = await voter.harvestAndDistribute();
  console.log(`Tx sent: ${tx2.hash}`);
  const receipt2 = await tx2.wait();
  console.log(`Status: ${receipt2.status === 1 ? "SUCCESS" : "REVERTED"}`);

  console.log("\n" + "=".repeat(64));
  console.log("STEP 6 - Record the upgrade");
  console.log("=".repeat(64));
  const next = {
    ...record,
    timestamp: new Date().toISOString(),
    note:
      "BYND-16 fix: ByNdVault.forwardBribeToken() + ByNdVoter.syncBribesFromVault() " +
      "added to route claimBribes() payouts (which Mezo's Bribe contract sends to " +
      "the vault, the veMEZO NFT's registered owner) back into ByNdVoter for " +
      "harvestAndDistribute() to see. No new storage on either contract.",
  };
  const outName = `${network.name}-${Date.now()}.json`;
  fs.writeFileSync(path.join(__dirname, "..", "deployments", outName), JSON.stringify(next, null, 2) + "\n");
  console.log(`Wrote deployments/${outName}`);

  console.log("\nDone. Recheck the terminal UI — the 900 MUSD should now show as distributed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
