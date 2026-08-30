const { ethers, network } = require("hardhat");

// optimiseAndVote() reverted with "ByNdVoter: votes not cast" — meaning
// EVERY managedTokenIds[i]'s boostVoter.vote() attempt failed inside the
// try/catch. Those per-tokenId VoteCastFailed events never actually landed
// on-chain (the whole tx reverted), so there's nothing to look up after the
// fact — this re-simulates each attempt individually to surface the real
// reason.
//
// Usage:
//   npx hardhat run scripts/diagnose-vote-failure.js --network mezotestnet

const BYND_VOTER = "0x76b7e2EbD2839c36802442931382032e8840218d";

const VOTER_ABI = [
  "function managedTokenIds(uint256) view returns (uint256)",
  "function currentEpoch() view returns (uint256)",
  "function epochVoted(uint256) view returns (bool)",
  "function boostVoter() view returns (address)",
  "function gauges(uint256) view returns (address gauge, address bribe, string name, uint256 weightBps)",
];

const BOOST_VOTER_ABI = [
  "function vote(uint256,address[],uint256[])",
  "function isAlive(address) view returns (bool)",
];

async function main() {
  const chainId = (await ethers.provider.getNetwork()).chainId;
  if (chainId !== 31611n) throw new Error("Run with --network mezotestnet");

  const voter = await ethers.getContractAt(VOTER_ABI, BYND_VOTER, ethers.provider);

  console.log("=".repeat(60));
  console.log("STEP 1 — managedTokenIds");
  console.log("=".repeat(60));
  const tokenIds = [];
  for (let i = 0; i < 20; i++) {
    try {
      tokenIds.push(await voter.managedTokenIds(i));
    } catch {
      break;
    }
  }
  console.log(`managedTokenIds (${tokenIds.length}): [${tokenIds.join(", ")}]`);

  console.log("\n" + "=".repeat(60));
  console.log("STEP 2 — configured gauges array (governance-set via setGauges)");
  console.log("=".repeat(60));
  const configuredGauges = [];
  for (let i = 0; i < 10; i++) {
    try {
      const g = await voter.gauges(i);
      configuredGauges.push(g);
    } catch {
      break;
    }
  }
  if (configuredGauges.length === 0) {
    console.log("EMPTY. optimiseAndVote() falls through to _selectOptimalGauges() (auto-select)");
    console.log("instead of using a governance-configured set — this alone isn't necessarily");
    console.log("the problem, but is worth knowing which path is active.");
  } else {
    for (const g of configuredGauges) {
      console.log(`  gauge=${g.gauge}  weightBps=${g.weightBps}  name="${g.name}"`);
    }
  }

  const boostVoterAddr = await voter.boostVoter();
  const boostVoter = await ethers.getContractAt(BOOST_VOTER_ABI, boostVoterAddr, ethers.provider);

  // Reconstruct what optimiseAndVote() would actually pass as gaugeAddrs/
  // weights right now.
  let gaugeAddrs, weights;
  if (configuredGauges.length > 0) {
    gaugeAddrs = configuredGauges.map((g) => g.gauge);
    weights = configuredGauges.map((g) => g.weightBps);
  } else {
    console.log("\n(Auto-select path — this script only re-simulates the configured-gauges");
    console.log("path faithfully. If gauges[] is empty, ask for a follow-up script that");
    console.log("mirrors _selectOptimalGauges() instead.)");
    gaugeAddrs = [];
    weights = [];
  }

  if (gaugeAddrs.length > 0) {
    console.log("\n" + "=".repeat(60));
    console.log("STEP 3 — is each configured gauge still alive on Mezo's real BoostVoter?");
    console.log("=".repeat(60));
    for (const g of gaugeAddrs) {
      const alive = await boostVoter.isAlive(g).catch((e) => `ERROR: ${e.shortMessage || e.message}`);
      console.log(`  ${g}: alive = ${alive}`);
    }

    console.log("\n" + "=".repeat(60));
    console.log("STEP 4 — simulate boostVoter.vote() for EACH managed tokenId, as ByNdVoter");
    console.log("=".repeat(60));
    for (const tokenId of tokenIds) {
      console.log(`\ntokenId ${tokenId}:`);
      try {
        await boostVoter.vote.staticCall(tokenId, gaugeAddrs, weights, { from: BYND_VOTER });
        console.log("  Simulation SUCCEEDED — this one should actually work.");
      } catch (err) {
        console.log(`  REVERTED. Reason: ${err.reason || "(no decoded reason)"}`);
        console.log(`  Raw: ${err.shortMessage || err.message}`);
      }
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
