const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

// Traces a funded bribe end-to-end so you can see exactly where it currently
// sits, instead of guessing from claimable(gauge) alone:
//   1. Is it still on Mezo's gauge (unclaimed)?
//   2. Has ByNdVoter already claimed+harvested it (check event history)?
//   3. Did it land in ByNdStaking's reward accounting, or get orphaned as a
//      raw balance because totalStaked was 0 at harvest time?
//
// Usage:
//   GAUGE_ADDRESS=0x... BRIBE_TOKEN=0x... npx hardhat run scripts/trace-bribe.js --network mezotestnet

const BOOST_VOTER_ABI = [
  "function claimable(address) view returns (uint256)",
  "function isAlive(address) view returns (bool)",
  "function gaugeToBribe(address) view returns (address)",
];

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

const DEFAULT_BOOST_VOTER = "0x21d7bDF5a5929AD179F8cA0c9014A0B62ae6Bfd1";
const DEFAULT_GAUGE = "0xb61D510dF1f1aeFc23016C39F5beA213E2f6e173";
const KNOWN_TOKENS = {
  MEZO: "0x7B7c000000000000000000000000000000000001",
  MUSD: "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503",
};

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
  if (chainId !== 31611n) {
    throw new Error(`Run with --network mezotestnet (got chainId ${chainId})`);
  }

  const deployment = loadLatestDeployment();
  if (!deployment) throw new Error("No deployment record found in deployments/");

  const boostVoterAddr = process.env.BOOST_VOTER_ADDRESS || DEFAULT_BOOST_VOTER;
  const gauge = process.env.GAUGE_ADDRESS || DEFAULT_GAUGE;
  const bribeToken = process.env.BRIBE_TOKEN || KNOWN_TOKENS.MUSD;

  const boostVoter = await ethers.getContractAt(BOOST_VOTER_ABI, boostVoterAddr);
  const token = await ethers.getContractAt(ERC20_ABI, bribeToken);
  const decimals = await token.decimals();
  const symbol = await token.symbol().catch(() => "TOKEN");

  console.log("=".repeat(60));
  console.log("STEP 1 — Did the funding tx actually land? (raw bribe-contract balance,");
  console.log("bypasses claimable()'s interpretation entirely)");
  console.log("=".repeat(60));
  const bribeContractAddr = await boostVoter.gaugeToBribe(gauge);
  console.log(`Gauge          : ${gauge}`);
  console.log(`Bribe contract : ${bribeContractAddr}`);
  const bribeRawBalance = await token.balanceOf(bribeContractAddr);
  console.log(`${symbol} balance held by bribe contract: ${ethers.formatUnits(bribeRawBalance, decimals)}`);
  if (bribeRawBalance > 0n) {
    console.log(`  -> Funds ARE on Mezo's bribe contract. So the 1k MUSD really landed —`);
    console.log(`     claimable(gauge) below is just measuring something different (likely`);
    console.log(`     per-voter/per-epoch entitlement, not a simple running total).`);
  } else {
    console.log(`  -> No ${symbol} sitting in the bribe contract at all. Either the funding`);
    console.log(`     tx targeted a different gauge/bribe contract, or it's already been`);
    console.log(`     fully claimed out by someone.`);
  }

  console.log("\n" + "=".repeat(60));
  console.log("STEP 2 — What does claimable(gauge) say right now?");
  console.log("=".repeat(60));
  console.log(`Alive          : ${await boostVoter.isAlive(gauge)}`);
  const gaugeClaimable = await boostVoter.claimable(gauge);
  console.log(`claimable(gauge): ${ethers.formatUnits(gaugeClaimable, decimals)} ${symbol}`);

  console.log("\n" + "=".repeat(60));
  console.log("STEP 3 — Has ByNdVoter (this deployment) ever harvested it?");
  console.log("=".repeat(60));
  const voter = await ethers.getContractAt("ByNdVoter", deployment.contracts.ByNdVoter);
  const currentEpoch = await voter.currentEpoch();
  console.log(`ByNdVoter      : ${deployment.contracts.ByNdVoter}`);
  console.log(`Current epoch  : ${currentEpoch}`);
  console.log(`Epoch voted    : ${await voter.epochVoted(currentEpoch)}`);
  console.log(`Epoch harvested: ${await voter.epochHarvested(currentEpoch)}`);

  // Direct per-epoch state check instead of scanning event logs — avoids the
  // RPC's 10,000-block getLogs range limit entirely, and currentEpoch is
  // always small so this is cheap.
  let anyPastHarvest = false;
  for (let e = 0n; e < currentEpoch; e++) {
    const harvested = await voter.epochHarvested(e);
    if (harvested) {
      anyPastHarvest = true;
      console.log(`  epoch ${e}: harvested = true`);
    }
  }
  if (currentEpoch === 0n) {
    console.log(`  This ByNdVoter is at epoch 0 — it has never completed a full vote+harvest`);
    console.log(`  cycle since it was deployed. It cannot be the thing that drained the bribe.`);
  } else if (!anyPastHarvest) {
    console.log(`  No past epoch on this ByNdVoter shows harvested = true either.`);
  }

  console.log("\n" + "=".repeat(60));
  console.log("STEP 4 — Did it reach stakers, or get orphaned in ByNdStaking?");
  console.log("=".repeat(60));
  const staking = await ethers.getContractAt("ByNdStaking", deployment.contracts.ByNdStaking);
  const totalStaked = await staking.totalStaked();
  const rawStakingBalance = await token.balanceOf(deployment.contracts.ByNdStaking);
  const isRewardToken = await staking.isRewardToken(bribeToken);
  console.log(`ByNdStaking address        : ${deployment.contracts.ByNdStaking}`);
  console.log(`totalStaked (veBYND) now   : ${ethers.formatEther(totalStaked)}`);
  console.log(`${symbol} raw balance held  : ${ethers.formatUnits(rawStakingBalance, decimals)}`);
  console.log(`Registered as reward token : ${isRewardToken}`);

  if (rawStakingBalance > 0n && !isRewardToken) {
    console.log(`\n  *** ORPHANED: ${symbol} is sitting in ByNdStaking's balance but was`);
    console.log(`  *** never registered as a reward token — notifyRewardAmount() must have`);
    console.log(`  *** been called while totalStaked was 0, which returns early.`);
  } else if (rawStakingBalance > 0n && isRewardToken) {
    console.log(`\n  Registered correctly — accounted for in rewardPerTokenStored, claimable`);
    console.log(`  by whoever is staked proportional to their share.`);
  } else {
    console.log(`\n  No ${symbol} sitting in ByNdStaking right now — consistent with STEP 3`);
    console.log(`  showing this ByNdVoter never harvested.`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
