const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

// Every prior diagnostic (trace-bribe.js STEP 2, check-real-claimable.js)
// reads BoostVoter.claimable(gauge) — which useProtocol.ts already
// documented as broken on this deployment (BoostVoter's own rewardToken()
// is unset, so it always returns 0 regardless of real bribe state). None of
// them have actually asked the Bribe contract itself what tokenId 860 has
// earned. This script does that directly.
//
// Usage:
//   npx hardhat run scripts/check-bribe-earned.js --network mezotestnet

const BOOST_VOTER_ABI = [
  "function gaugeToBribe(address) view returns (address)",
  "function epochStart(uint256) view returns (uint256)",
];

// Solidly/Velodrome-style Bribe.sol convention (matches the
// tokenRewardsPerEpoch(address,uint256) signature ByNdVoter.sol already
// depends on) — try the common view names for a per-tokenId claim amount.
const BRIBE_CANDIDATE_ABI = [
  "function earned(address token, uint256 tokenId) view returns (uint256)",
  "function earned(uint256 tokenId, address token) view returns (uint256)",
  "function tokenRewardsPerEpoch(address token, uint256 epochStart) view returns (uint256)",
  "function balanceOfAt(uint256 tokenId, uint256 epochStart) view returns (uint256)",
  "function checkpoints(uint256 tokenId, uint256 index) view returns (uint256 timestamp, uint256 balanceOf)",
  "function numCheckpoints(uint256 tokenId) view returns (uint256)",
  "function totalSupplyAt(uint256 epochStart) view returns (uint256)",
  "function lastEarn(address token, uint256 tokenId) view returns (uint256)",
];

const DEFAULT_BOOST_VOTER = "0x21d7bDF5a5929AD179F8cA0c9014A0B62ae6Bfd1";
const DEFAULT_GAUGE = "0xb61D510dF1f1aeFc23016C39F5beA213E2f6e173";
const MUSD = "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503";

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
  if (chainId !== 31611n) throw new Error(`Run with --network mezotestnet`);

  const deployment = loadLatestDeployment();
  if (!deployment) throw new Error("No deployment record found in deployments/");

  const gauge = process.env.GAUGE_ADDRESS || DEFAULT_GAUGE;
  const bribeToken = process.env.BRIBE_TOKEN || MUSD;
  const tokenId = BigInt(process.env.TOKEN_ID || "860");
  const boostVoterAddr = process.env.BOOST_VOTER_ADDRESS || DEFAULT_BOOST_VOTER;

  const boostVoter = await ethers.getContractAt(BOOST_VOTER_ABI, boostVoterAddr, ethers.provider);
  const bribeAddr = await boostVoter.gaugeToBribe(gauge);
  const bribe = await ethers.getContractAt(BRIBE_CANDIDATE_ABI, bribeAddr, ethers.provider);

  console.log("=".repeat(60));
  console.log(`Bribe contract: ${bribeAddr}`);
  console.log(`tokenId       : ${tokenId}`);
  console.log(`token         : ${bribeToken}`);
  console.log("=".repeat(60));

  const now = Math.floor(Date.now() / 1000);
  let epochStart;
  try {
    epochStart = await boostVoter.epochStart(now);
    console.log(`Current real epochStart: ${epochStart} (${new Date(Number(epochStart) * 1000).toISOString()})`);
  } catch {
    console.log("Could not read epochStart from BoostVoter.");
  }

  for (const [label, call] of [
    ["earned(token, tokenId)", () => bribe["earned(address,uint256)"](bribeToken, tokenId)],
    ["earned(tokenId, token)", () => bribe["earned(uint256,address)"](tokenId, bribeToken)],
    ["tokenRewardsPerEpoch(token, epochStart)", () => bribe.tokenRewardsPerEpoch(bribeToken, epochStart)],
    ["numCheckpoints(tokenId)", () => bribe.numCheckpoints(tokenId)],
    ["totalSupplyAt(epochStart)", () => bribe.totalSupplyAt(epochStart)],
    ["lastEarn(token, tokenId)", () => bribe.lastEarn(bribeToken, tokenId)],
  ]) {
    try {
      const result = await call();
      console.log(`${label.padEnd(40)}: ${result.toString()}`);
    } catch (err) {
      console.log(`${label.padEnd(40)}: not available (${err.shortMessage || "reverted / no such function"})`);
    }
  }

  console.log("\nIf numCheckpoints(tokenId) reads 0, our vote's weight was never");
  console.log("checkpointed INTO the bribe contract itself — even though BoostVoter's");
  console.log("own votes/usedWeights storage shows real weight. That would mean the two");
  console.log("contracts are out of sync: BoostVoter recorded the vote, but never called");
  console.log("through to Bribe._deposit(weight, tokenId) to register it for rewards.");
  console.log("If earned(...) reads > 0 for either signature, that's the real claimable");
  console.log("amount — compare it against what claimBribesBatch() actually pulled in.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
