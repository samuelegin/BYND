const { ethers, upgrades, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

// Upgrades ByNdVault ONLY, for BYND-14 and BYND-15.
//
// ByNdVoter and ByNdStaking are unchanged since the pre-audit remediation
// upgrade and are deliberately not touched here -- re-upgrading ByNdVoter would
// mean redeploying both linked libraries for no reason, and each redeploy is
// another chance to link the wrong version.
//
// BYND-14 (Critical) -- extendLocks() never worked, on any call, since deploy.
//   veMEZO.increaseUnlockTime(tokenId, X) takes X as a DURATION IN SECONDS FROM
//   NOW. The vault passed `block.timestamp + MAXTIME`, an absolute timestamp of
//   ~1.79e9, which veMEZO read as a ~57-year duration and rejected with
//   LockDurationTooLong() every time. The failures were swallowed by the
//   per-token try/catch, so LocksExtended(keeper, 0, ...) emitted and the epoch
//   was marked done while every lock kept decaying. MAXTIME was also wrong:
//   4 * 365 days exceeds veMEZO's real 208-week cap by 345600s.
//
// BYND-15 -- a straggler holding a live gauge vote could never be consolidated.
//   veMEZO rejects merge() with AlreadyVoted(). The vault held the NFTs but
//   never referenced BoostVoter, where vote state lives, so it had no way to
//   clear one. Token 829 has sat in exactly that state since June.
//
// POST-UPGRADE WRITE REQUIRED, and it is atomic here:
//   `boostVoter` is new storage and defaults to address(0). retryMerge()
//   degrades gracefully when it is unset -- it skips the reset and attempts the
//   merge as before -- so an unconfigured proxy is safe, just not fixed. The
//   setter runs through upgradeProxy's `call` option so it lands in the SAME
//   transaction as the upgrade. `call` executes via upgradeToAndCall, which
//   preserves msg.sender as the original caller, so onlyOwner is satisfied by
//   the same signer authorizing the upgrade.
//
// Usage:
//   npx hardhat run scripts/validate-upgrade.js --network mezotestnet
//   npx hardhat run scripts/upgrade-vault-lock-extension-fix.js --network mezotestnet
//
// Optional:
//   DRY_RUN=true   report what would happen and send nothing

// Mezo's BoostVoter on Matsnet. Verified reachable as the vault: staticcalling
// reset(829) from the vault address succeeds against this contract.
const BOOST_VOTER = "0x21d7bDF5a5929AD179F8cA0c9014A0B62ae6Bfd1";

function loadLatestDeployment() {
  const dir = path.join(__dirname, "..", "deployments");
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(`${network.name}-`) && f.endsWith(".json"))
    .sort();
  if (files.length === 0) return null;
  const latest = files[files.length - 1];
  console.log(`Using deployment record: ${latest}\n`);
  return JSON.parse(fs.readFileSync(path.join(dir, latest), "utf8"));
}

async function main() {
  const chainId = (await ethers.provider.getNetwork()).chainId;
  if (chainId !== 31611n) throw new Error(`Run with --network mezotestnet (got ${chainId})`);

  const dryRun = process.env.DRY_RUN === "true";
  const record = loadLatestDeployment();
  if (!record) throw new Error("No deployment record found in deployments/");
  const c = record.contracts;

  const [signer] = await ethers.getSigners();
  const vaultBefore = await ethers.getContractAt("ByNdVault", c.ByNdVault);
  const owner = await vaultBefore.owner();

  console.log(`Signer      : ${signer.address}`);
  console.log(`ByNdVault   : ${c.ByNdVault}`);
  console.log(`BoostVoter  : ${BOOST_VOTER}`);
  if (dryRun) console.log("\n*** DRY_RUN -- no transactions will be sent ***");

  if (owner.toLowerCase() !== signer.address.toLowerCase()) {
    throw new Error(
      `Signer cannot authorize this upgrade: ByNdVault owner is ${owner}. ` +
      `ByNdVault is UUPS and authorizes its own upgrade.`
    );
  }
  console.log("Authority   : signer owns the proxy\n");

  // Reading this off the OLD implementation returns 0x0 both when the variable
  // does not exist yet and when it exists unset. Either way it needs setting.
  const boostVoterBefore = await vaultBefore.boostVoter().catch(() => ethers.ZeroAddress);
  console.log(`boostVoter before: ${boostVoterBefore}`);

  // State that must survive the upgrade, captured before it happens so the
  // comparison afterwards is against observed values rather than expectations.
  const before = {
    canonicalTokenId: await vaultBefore.canonicalTokenId(),
    totalDeposited: await vaultBefore.totalDeposited(),
    totalLockedMEZO: await vaultBefore.totalLockedMEZO(),
    extendCursor: await vaultBefore.extendCursor(),
  };

  console.log("\n" + "=".repeat(64));
  console.log("STEP 1 - Upgrade ByNdVault, setting boostVoter atomically");
  console.log("=".repeat(64));
  if (dryRun) {
    console.log(
      boostVoterBefore === ethers.ZeroAddress
        ? `DRY_RUN: would upgrade with call: setBoostVoter(${BOOST_VOTER})`
        : "DRY_RUN: would upgrade WITHOUT the setter (boostVoter already set)"
    );
    console.log("\nDRY_RUN complete -- nothing was sent.");
    return;
  }

  const ByNdVaultNext = await ethers.getContractFactory("ByNdVault");
  const opts =
    boostVoterBefore === ethers.ZeroAddress
      ? { call: { fn: "setBoostVoter", args: [BOOST_VOTER] } }
      : {};
  const up = await upgrades.upgradeProxy(c.ByNdVault, ByNdVaultNext, opts);
  await up.waitForDeployment();
  console.log(`Upgraded. Proxy unchanged: ${await up.getAddress()}`);

  console.log("\n" + "=".repeat(64));
  console.log("STEP 2 - Record the upgrade");
  console.log("=".repeat(64));
  // Written before verification, matching upgrade-pre-audit-remediation.js: a
  // failed check is worth reporting, not worth losing the record over.
  const next = {
    ...record,
    timestamp: new Date().toISOString(),
    note:
      "BYND-14 / BYND-15 build. ByNdVault only -- ByNdVoter and ByNdStaking are " +
      "unchanged from the pre-audit remediation upgrade and were not touched, so " +
      "the GaugeScan/HarvestLib addresses above still describe the live voter. " +
      "extendLocks() now passes a DURATION (208 weeks) instead of an absolute " +
      "timestamp, and retryMerge() clears a straggler's gauge vote via BoostVoter.",
  };
  const outName = `${network.name}-${Date.now()}.json`;
  fs.writeFileSync(
    path.join(__dirname, "..", "deployments", outName),
    JSON.stringify(next, null, 2) + "\n"
  );
  console.log(`Wrote deployments/${outName}`);

  console.log("\n" + "=".repeat(64));
  console.log("STEP 3 - Verify the new surface is live");
  console.log("=".repeat(64));
  const vault = await ethers.getContractAt("ByNdVault", c.ByNdVault);

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

  // MAXTIME is the whole of BYND-14 in one read. The old build returns
  // 126144000 (4 * 365 days); the new one returns 125798400 (208 weeks). Those
  // 345600 seconds are the entire difference between a call that works and one
  // that reverted on every attempt since deploy.
  await check("vault.MAXTIME (208 weeks)", () => vault.MAXTIME(), (v) => v === 208n * 604800n);
  await check("vault.WEEK", () => vault.WEEK(), (v) => v === 604800n);
  await check(
    "vault.boostVoter",
    () => vault.boostVoter(),
    (v) => v.toLowerCase() === BOOST_VOTER.toLowerCase()
  );

  console.log("\nPreserved state (must match the pre-upgrade reads):");
  const after = {
    canonicalTokenId: await vault.canonicalTokenId(),
    totalDeposited: await vault.totalDeposited(),
    totalLockedMEZO: await vault.totalLockedMEZO(),
    extendCursor: await vault.extendCursor(),
  };
  for (const k of Object.keys(before)) {
    const same = before[k] === after[k];
    checks.push(same);
    console.log(`${same ? "OK  " : "FAIL"}  ${k}: ${before[k]} -> ${after[k]}`);
  }

  console.log("\n" + "=".repeat(64));
  console.log("STEP 4 - Would extendLocks actually work now?");
  console.log("=".repeat(64));
  // The real proof of BYND-14, and the one thing a unit test genuinely cannot
  // give: staticcall the live veMEZO as the vault, with the corrected DURATION
  // argument, for every token the vault holds. This sends nothing.
  try {
    const ids = await vault.getAllTokenIds();
    const uI = new ethers.Interface(["function increaseUnlockTime(uint256,uint256)"]);
    const MAXTIME = 208n * 604800n;
    let ok = 0;
    for (const id of ids) {
      try {
        await ethers.provider.call({
          to: c.veMEZO || "0xaCE816CA2bcc9b12C59799dcC5A959Fb9b98111b",
          from: c.ByNdVault,
          data: uI.encodeFunctionData("increaseUnlockTime", [id, MAXTIME]),
        });
        console.log(`OK    token ${id}: extension would succeed`);
        ok++;
      } catch (e) {
        const d = e?.data ?? e?.info?.error?.data;
        console.log(`      token ${id}: would revert ${typeof d === "string" ? d.slice(0, 10) : "?"}`);
      }
    }
    console.log(`\n${ok}/${ids.length} tokens would extend. Before this build: 0/${ids.length}.`);
  } catch (e) {
    console.log(`Could not probe: ${e.message.split("\n")[0]}`);
  }

  const failed = checks.filter((x) => !x).length;
  console.log();
  if (failed > 0) {
    console.error(
      `${failed} post-upgrade check(s) FAILED. The proxy is live either way -- ` +
      `find out why before running a keeper against it.`
    );
    process.exitCode = 1;
  } else {
    console.log(
      "All post-upgrade checks passed. Next: call extendLocks() and confirm the " +
      "LocksExtended event reports a NON-ZERO count -- that is the first time it " +
      "ever will have. Then retryMerge(829) to consolidate the last straggler."
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
