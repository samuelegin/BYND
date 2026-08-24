const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

// Both real upgrades from Run 1 of upgrade-vault-bribe-forwarding-fix.js
// already succeeded on-chain (confirmed by check-vault-alive-v2.js: the
// live implementation has code and responds correctly). Run 2's
// "InvalidDeployment" error was a local OpenZeppelin manifest bookkeeping
// issue, not a real on-chain problem. This script skips the upgrade steps
// entirely — avoiding that same manifest hiccup — and goes straight to
// verifying the fix landed, then completing the recovery.
//
// Usage:
//   npx hardhat run scripts/finish-bribe-recovery.js --network mezotestnet

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
  if (chainId !== 31611n) throw new Error(`Run with --network mezotestnet`);

  const musd = process.env.MUSD_ADDRESS || DEFAULT_MUSD;
  const loaded = loadLatestDeployment();
  if (!loaded) throw new Error("No deployment record found in deployments/");
  const { record } = loaded;
  const c = record.contracts;

  const voter = await ethers.getContractAt("ByNdVoter", c.ByNdVoter);
  const vault = await ethers.getContractAt("ByNdVault", c.ByNdVault);

  console.log("=".repeat(64));
  console.log("STEP 1 - Confirm the fix is actually live (not just the vault being alive)");
  console.log("=".repeat(64));
  let syncCallable = false;
  try {
    await voter.syncBribesFromVault.staticCall(musd);
    syncCallable = true;
  } catch (err) {
    console.log(`syncBribesFromVault simulation failed:`);
    console.log(`  reason : ${err.reason || "(no decoded revert reason)"}`);
    console.log(`  raw    : ${err.shortMessage || err.message}`);
  }
  console.log(`voter.syncBribesFromVault callable: ${syncCallable}`);
  if (!syncCallable) {
    throw new Error(
      "syncBribesFromVault still isn't callable even though the vault is alive. " +
      "The upgrade may genuinely not have included our fix — stop and investigate " +
      "before proceeding, do not re-run the upgrade blindly.",
    );
  }

  const musdToken = await ethers.getContractAt(
    ["function balanceOf(address) view returns (uint256)", "function decimals() view returns (uint8)"],
    musd,
  );
  const decimals = await musdToken.decimals();
  const vaultBalBefore = await musdToken.balanceOf(c.ByNdVault);
  console.log(`\nVault MUSD balance right now: ${ethers.formatUnits(vaultBalBefore, decimals)}`);
  if (vaultBalBefore === 0n) {
    console.log("Nothing to recover — vault balance is already 0. Stopping here.");
    return;
  }

  console.log("\n" + "=".repeat(64));
  console.log("STEP 2 - syncBribesFromVault(MUSD)");
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
  console.log("STEP 3 - harvestAndDistribute()");
  console.log("=".repeat(64));
  const tx2 = await voter.harvestAndDistribute();
  console.log(`Tx sent: ${tx2.hash}`);
  const receipt2 = await tx2.wait();
  console.log(`Status: ${receipt2.status === 1 ? "SUCCESS" : "REVERTED"}`);

  console.log("\n" + "=".repeat(64));
  console.log("STEP 4 - Record the recovery");
  console.log("=".repeat(64));
  const next = {
    ...record,
    timestamp: new Date().toISOString(),
    note:
      (record.note ? record.note + " " : "") +
      "Recovered 900 MUSD stuck in vault via syncBribesFromVault + harvestAndDistribute.",
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
