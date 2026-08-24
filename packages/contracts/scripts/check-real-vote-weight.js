const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

// STEP 3 of check-vote-status.js only proves a vote() call WOULD succeed
// right now — it does not prove the historical optimiseAndVote() call
// actually recorded real weight on Mezo's BoostVoter at the time it ran.
// This script reads the weight directly instead of simulating.
//
// Usage:
//   npx hardhat run scripts/check-real-vote-weight.js --network mezotestnet

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

// Common ve(3,3)-style BoostVoter view functions. Not every fork exposes
// all of these under these exact names, so we try each and report which
// ones actually exist on this deployment rather than assuming.
const CANDIDATE_ABI = [
  "function votes(uint256 tokenId, address gauge) view returns (uint256)",
  "function usedWeights(uint256 tokenId) view returns (uint256)",
  "function weights(address gauge) view returns (uint256)",
  "function totalWeight() view returns (uint256)",
  "function lastVoted(uint256 tokenId) view returns (uint256)",
];

async function main() {
  const chainId = (await ethers.provider.getNetwork()).chainId;
  if (chainId !== 31611n) throw new Error(`Run with --network mezotestnet`);

  const deployment = loadLatestDeployment();
  if (!deployment) throw new Error("No deployment record found in deployments/");

  const voter = await ethers.getContractAt("ByNdVoter", deployment.contracts.ByNdVoter);
  const boostVoterAddr = await voter.boostVoter();
  const boostVoter = await ethers.getContractAt(CANDIDATE_ABI, boostVoterAddr, ethers.provider);

  const tokenId = 860n;
  const gauge = "0xb61D510dF1f1aeFc23016C39F5beA213E2f6e173";

  console.log("=".repeat(60));
  console.log(`Checking real recorded vote weight for tokenId ${tokenId} on gauge ${gauge}`);
  console.log("=".repeat(60));

  for (const fn of ["votes", "usedWeights", "weights", "totalWeight", "lastVoted"]) {
    try {
      let result;
      if (fn === "votes") result = await boostVoter.votes(tokenId, gauge);
      else if (fn === "usedWeights") result = await boostVoter.usedWeights(tokenId);
      else if (fn === "weights") result = await boostVoter.weights(gauge);
      else if (fn === "totalWeight") result = await boostVoter.totalWeight();
      else if (fn === "lastVoted") result = await boostVoter.lastVoted(tokenId);
      console.log(`${fn.padEnd(14)}: ${result.toString()}`);
    } catch (err) {
      console.log(`${fn.padEnd(14)}: not available on this contract (${err.shortMessage || "no such function"})`);
    }
  }

  console.log("\nInterpretation:");
  console.log("- votes(tokenId, gauge) > 0 or usedWeights(tokenId) > 0 means real");
  console.log("  voting weight IS recorded on-chain — the vote genuinely landed.");
  console.log("- If every field above reads 0 / unavailable, no real weight was ever");
  console.log("  recorded, regardless of what epochVoted or the simulation says.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
