const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

// earned(token, 860) on the Bribe contract confirms 900 MUSD is genuinely
// claimable. So if claimBribesBatch() pulled in nothing, the real
// boostVoter.claimBribes() call inside it must be reverting — and exactly
// like optimiseAndVote(), that call is wrapped in try/catch { emit
// BribeClaimFailed }, which would hide the real reason. This checks for
// that event and re-simulates the call (via raw provider, so an arbitrary
// `from` override works without needing ByNdVoter's private key) to surface
// the actual revert string.
//
// Usage:
//   npx hardhat run scripts/check-claim-bribes-status.js --network mezotestnet

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

const BYND_VOTER_ABI = [
  "function currentEpoch() view returns (uint256)",
  "function managedTokenIds(uint256) view returns (uint256)",
  "function boostVoter() view returns (address)",
  // NOTE: Gauge.tokens is a dynamically-sized array member of the Gauge
  // struct — Solidity's auto-generated public getter for an array of
  // structs SKIPS dynamic array/mapping members entirely, so gauges(i)
  // only actually returns these four fields, never `tokens`. Declaring
  // `tokens` in this ABI caused a decode error, not a revert.
  "function gauges(uint256) view returns (address gauge, address bribe, string name, uint256 weightBps)",
  "event BribeClaimFailed(uint256 indexed epoch, uint256 indexed tokenId)",
];

const BOOST_VOTER_ABI = [
  "function claimBribes(address[] _bribes, address[][] _tokens, uint256 _tokenId) external",
];

async function main() {
  const chainId = (await ethers.provider.getNetwork()).chainId;
  if (chainId !== 31611n) throw new Error(`Run with --network mezotestnet`);

  const deployment = loadLatestDeployment();
  if (!deployment) throw new Error("No deployment record found in deployments/");

  const voter = await ethers.getContractAt(BYND_VOTER_ABI, deployment.contracts.ByNdVoter, ethers.provider);
  const currentEpoch = await voter.currentEpoch();
  const tokenId = await voter.managedTokenIds(0);

  console.log("=".repeat(60));
  console.log("STEP 1 — Look for BribeClaimFailed events this epoch");
  console.log("=".repeat(60));
  console.log(`Current epoch: ${currentEpoch}`);
  const filter = voter.filters.BribeClaimFailed(currentEpoch, tokenId);
  const events = await voter.queryFilter(filter, -9999).catch((e) => {
    console.log(`(getLogs failed / range-limited: ${e.shortMessage || e.message})`);
    return [];
  });
  if (events.length > 0) {
    console.log(`Found ${events.length} BribeClaimFailed event(s) for tokenId ${tokenId} this epoch —`);
    console.log(`confirmed: the real on-chain claimBribes() call reverted.`);
  } else {
    console.log(`No BribeClaimFailed events found in the last ~10k blocks (may be a false`);
    console.log(`negative if RPC log range is capped — STEP 2 below is the reliable signal).`);
  }

  console.log("\n" + "=".repeat(60));
  console.log("STEP 2 — Simulate boostVoter.claimBribes() directly to get the real revert reason");
  console.log("=".repeat(60));

  const boostVoterAddr = await voter.boostVoter();
  // Reconstruct exactly what claimBribesBatch() builds: bribes[] pulled
  // from our own stored `gauges` config. `tokens` isn't readable on-chain
  // (see ABI note above) — setup-test-gauge.js is the only place it was
  // ever set, to [MUSD], so we use that known value directly rather than
  // trying to read it back.
  const KNOWN_GAUGE_TOKENS = ["0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503"]; // MUSD
  const gauge0 = await voter.gauges(0);
  const bribes = [gauge0.bribe];
  const bribeTokens = [KNOWN_GAUGE_TOKENS];
  console.log(`Simulating claimBribes(bribes=[${bribes}], tokens=[[${bribeTokens[0]}]], tokenId=${tokenId})`);
  console.log(`  ...as if called BY ByNdVoter (${deployment.contracts.ByNdVoter})\n`);

  // Connected via ethers.provider (not a signer) so the `from` override
  // works via plain eth_call — no private key / impersonation needed, and
  // no risk of the "transaction from mismatch" false negative we hit
  // earlier when this pattern was tried through a signer-connected Contract.
  const boostVoter = await ethers.getContractAt(BOOST_VOTER_ABI, boostVoterAddr, ethers.provider);

  try {
    await boostVoter.claimBribes.staticCall(bribes, bribeTokens, tokenId, {
      from: deployment.contracts.ByNdVoter,
    });
    console.log("Simulation SUCCEEDED — claimBribes() should work as called by ByNdVoter.");
    console.log("If claimBribesBatch() still isn't pulling funds in despite this, the issue");
    console.log("may be in how claimBribesBatch() reads back the result / balance delta,");
    console.log("not in the claimBribes() call itself.");
  } catch (err) {
    if (!err.reason) {
      console.log("Simulation could not run cleanly — this is a script/client-side error,");
      console.log("not a contract revert. Raw error for debugging:");
      console.log(`  ${err.shortMessage || err.message}`);
    } else {
      console.log("Simulation REVERTED. Real reason:");
      console.log(`  ${err.reason}`);
      console.log("\nThis is the actual on-chain reason claimBribesBatch() pulls in nothing —");
      console.log("its try/catch around this exact call swallows this revert silently.");
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
