const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

// Checks whether ByNdVoter's optimiseAndVote() actually succeeded in casting
// a real vote on Mezo's BoostVoter — or silently swallowed a revert (the
// try/catch around boostVoter.vote() in optimiseAndVote() sets
// epochVoted[currentEpoch] = true regardless of whether the inner call
// succeeded, so "Votes cast: Yes" in the UI does NOT prove a real vote landed
// on-chain).
//
// Usage:
//   npx hardhat run ../check-vote-status.js --network mezotestnet
// (adjust the relative path to wherever you place this file, or drop it
// straight into packages/contracts/scripts/ and run from there)

function loadLatestDeployment() {
  // Same layout as trace-bribe.js: this script lives in scripts/, and
  // deployments/ is the sibling directory one level up in packages/contracts/.
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
  if (chainId !== 31611n) throw new Error(`Run with --network mezotestnet`);

  const deployment = loadLatestDeployment();
  if (!deployment) throw new Error("No deployment record found in deployments/");

  const voter = await ethers.getContractAt("ByNdVoter", deployment.contracts.ByNdVoter);
  const currentEpoch = await voter.currentEpoch();
  const managedTokenIds = await voter.managedTokenIds ? await voter.getManagedTokenIds().catch(() => null) : null;

  console.log("=".repeat(60));
  console.log("STEP 1 — What did ByNdVoter actually try to vote with?");
  console.log("=".repeat(60));
  console.log(`Current epoch     : ${currentEpoch}`);
  console.log(`Epoch voted flag  : ${await voter.epochVoted(currentEpoch)}`);

  let tokenIds;
  try {
    tokenIds = managedTokenIds ?? await voter.managedTokenIds(0).then(() => {
      throw new Error("fallback path");
    });
  } catch {
    // managedTokenIds is a public array — index 0..n until revert
    tokenIds = [];
    for (let i = 0; i < 50; i++) {
      try {
        tokenIds.push(await voter.managedTokenIds(i));
      } catch {
        break;
      }
    }
  }
  console.log(`Managed tokenIds  : [${tokenIds.join(", ")}]`);
  if (tokenIds.length === 0) {
    console.log(`\n*** No managed tokenIds at all — optimiseAndVote() would have`);
    console.log(`*** reverted on "ByNdVoter: no managed tokenIds", so it could not`);
    console.log(`*** have even attempted a real vote. Check how/whether a veBTC`);
    console.log(`*** lock's tokenId was ever registered via addManagedTokenId().`);
    return;
  }

  console.log("\n" + "=".repeat(60));
  console.log("STEP 2 — Look for VoteCastFailed events this epoch");
  console.log("=".repeat(60));
  const filter = voter.filters.VoteCastFailed(currentEpoch);
  const failedEvents = await voter.queryFilter(filter, -9999);
  if (failedEvents.length > 0) {
    console.log(`Found ${failedEvents.length} VoteCastFailed event(s) for epoch ${currentEpoch}:`);
    failedEvents.forEach(e => console.log(`  tokenId ${e.args.tokenId} failed to vote`));
  } else {
    console.log(`No VoteCastFailed events found in the last ~10k blocks for this epoch.`);
    console.log(`(If your RPC free tier caps getLogs range, this may be a false negative —`);
    console.log(`STEP 3's callStatic check below is the more reliable signal.)`);
  }

  console.log("\n" + "=".repeat(60));
  console.log("STEP 3 — Simulate boostVoter.vote() directly to get the real revert reason");
  console.log("=".repeat(60));
  const boostVoterAddr = await voter.boostVoter();
  const boostVoterAbi = [
    "function vote(uint256 tokenId, address[] gaugeVote, uint256[] weights) external",
  ];
  // IMPORTANT: connect with ethers.provider, NOT the default signer runner.
  // A Contract connected to a signer refuses to staticCall with a `from`
  // override that isn't the signer's own address — ethers throws
  // "transaction from mismatch" client-side before the call ever reaches
  // the chain, which looks exactly like a contract revert but isn't one.
  // eth_call against a raw provider has no such restriction: `from` is
  // just a message field, no signature required, so it's the correct way
  // to simulate "as if ByNdVoter called this" on a live network without
  // impersonation/private-key access.
  const boostVoter = await ethers.getContractAt(boostVoterAbi, boostVoterAddr, ethers.provider);

  // Reconstruct whatever gauges ByNdVoter would currently vote with
  const gaugeCount = await voter.gaugesLength ? await voter.gaugesLength().catch(() => 0n) : 0n;
  let gaugeAddrs = [];
  let weights = [];
  for (let i = 0; i < Number(gaugeCount); i++) {
    const g = await voter.gauges(i);
    gaugeAddrs.push(g.gauge);
    weights.push(g.weightBps);
  }
  if (gaugeAddrs.length === 0) {
    console.log("Could not reconstruct configured gauges automatically — falling back to");
    console.log("the known test gauge for a single-gauge simulation.");
    gaugeAddrs = ["0xb61D510dF1f1aeFc23016C39F5beA213E2f6e173"];
    weights = [10000n];
  }
  console.log(`Simulating vote(tokenId=${tokenIds[0]}, gauges=[${gaugeAddrs}], weights=[${weights}])`);
  console.log(`  ...as if called BY ByNdVoter (${deployment.contracts.ByNdVoter})\n`);

  try {
    await boostVoter.vote.staticCall(tokenIds[0], gaugeAddrs, weights, {
      from: deployment.contracts.ByNdVoter,
    });
    console.log("Simulation SUCCEEDED — a real vote() call from ByNdVoter should work.");
    console.log("If claimable(gauge) is still 0 despite this, the issue is elsewhere");
    console.log("(e.g. this simulated vote hasn't actually been submitted as a real tx yet).");
  } catch (err) {
    // "transaction from mismatch" (or similar ethers-side guard errors) here
    // means the simulation itself is still malformed, NOT a contract revert
    // — don't report it as the real reason. Only err.reason (an actual
    // decoded require()/revert string from the chain) is trustworthy.
    if (!err.reason) {
      console.log("Simulation could not run cleanly — this is a script/client-side error,");
      console.log("not a contract revert. Raw error for debugging:");
      console.log(`  ${err.shortMessage || err.message}`);
      console.log("\nThis does NOT confirm or rule out a real on-chain vote failure.");
      return;
    }
    console.log("Simulation REVERTED. Real reason:");
    console.log(`  ${err.reason}`);
    console.log("\nThis is almost certainly why claimable(gauge) has stayed at 0 —");
    console.log("optimiseAndVote()'s try/catch swallowed this exact revert and still");
    console.log("marked epochVoted[currentEpoch] = true, so the UI showed 'Votes cast: Yes'");
    console.log("even though no real vote weight was ever recorded on Mezo's BoostVoter.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
