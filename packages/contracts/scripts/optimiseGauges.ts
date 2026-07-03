/**
 * optimiseGauges.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Reads live bribe data from Matsnet's ValidatorsVoter, ranks gauges by
 * bribe-per-vote ROI, and calls voter.setGauges() with concentrated weights.
 *
 * Run BEFORE castVotes() each epoch (ideally 1–2 hours before vote window opens):
 *   npm run optimise:matsnet
 *
 * Add to package.json scripts:
 *   "optimise:matsnet": "hardhat run scripts/optimiseGauges.ts --network matsnet"
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// ── Config ────────────────────────────────────────────────────────────────────

const VALIDATORS_VOTER = "0x21d7bDF5a5929AD179F8cA0c9014A0B62ae6Bfd1";
const MUSD_ADDRESS     = "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503";

// How many top gauges to concentrate votes into.
// 1–3 is most aggressive (max ROI). 5 is safer diversification.
const TOP_N = 5;

// Minimum MUSD claimable for a gauge to be considered (filters dust/zero gauges).
// Set to 0 to include all alive gauges with any bribes.
const MIN_CLAIMABLE = ethers.parseEther("0.01");

// ── ABIs ──────────────────────────────────────────────────────────────────────

const VALIDATORS_VOTER_ABI = [
  "function length() view returns (uint256)",
  "function gauges(uint256 index) view returns (address)",
  "function gaugeToBribe(address gauge) view returns (address)",
  "function isAlive(address gauge) view returns (bool)",
  "function claimable(address gauge) view returns (uint256)",
  "function totalWeight() view returns (uint256)",
  "function weights(address gauge) view returns (uint256)",
];

const BYND_VOTER_ABI = [
  "function setGauges(address[] calldata _gauges, address[] calldata _bribes, string[] calldata _names, uint256[] calldata _weightsBps, address[][] calldata _tokens) external",
  "function gauges(uint256) view returns (address gauge, address bribe, string name, uint256 weightBps)",
  "function getGaugeCount() view returns (uint256)",
  "function governance() view returns (address)",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function bpsToPercent(bps: number) {
  return (bps / 100).toFixed(2) + "%";
}

async function loadDeployedAddresses(): Promise<{ ByNdVoter: string }> {
  const filePath = path.join(__dirname, "..", "deployed-addresses.json");
  if (!fs.existsSync(filePath)) {
    throw new Error(
      "deployed-addresses.json not found. Run npm run deploy:matsnet first."
    );
  }
  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (!data.contracts?.ByNdVoter) {
    throw new Error("ByNdVoter address missing from deployed-addresses.json");
  }
  return { ByNdVoter: data.contracts.ByNdVoter };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const [governance] = await ethers.getSigners();
  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  ByNd Gauge Optimiser — Matsnet");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  Governance: ${governance.address}`);
  console.log(`  Balance:    ${ethers.formatEther(await ethers.provider.getBalance(governance.address))} BTC\n`);

  // ── Load contracts ──────────────────────────────────────────────────────────
  const { ByNdVoter: byNdVoterAddr } = await loadDeployedAddresses();

  const validatorsVoter = await ethers.getContractAt(
    VALIDATORS_VOTER_ABI,
    VALIDATORS_VOTER
  );
  const byNdVoter = await ethers.getContractAt(BYND_VOTER_ABI, byNdVoterAddr);

  // Confirm caller is governance
  const governanceOnChain = await byNdVoter.governance();
  if (governanceOnChain.toLowerCase() !== governance.address.toLowerCase()) {
    throw new Error(
      `Signer ${governance.address} is not governance (${governanceOnChain}). ` +
      `Check DEPLOYER_PRIVATE_KEY in your .env`
    );
  }

  // ── Scan all gauges from ValidatorsVoter ────────────────────────────────────
  const total = Number(await validatorsVoter.length());
  console.log(`Scanning ${total} gauges from ValidatorsVoter...`);

  type GaugeInfo = {
    gauge:      string;
    bribe:      string;
    claimable:  bigint;
    weight:     bigint;
    roiScore:   number;   // claimable / weight — higher = better ROI
  };

  const candidates: GaugeInfo[] = [];
  const BATCH = 30;

  for (let start = 0; start < total; start += BATCH) {
    const end = Math.min(start + BATCH, total);
    const indices = Array.from({ length: end - start }, (_, i) => start + i);

    const results = await Promise.allSettled(
      indices.map(async (i) => {
        const gauge = await validatorsVoter.gauges(i);
        const alive = await validatorsVoter.isAlive(gauge);
        if (!alive) return null;

        const [bribe, claimable, weight] = await Promise.all([
          validatorsVoter.gaugeToBribe(gauge),
          validatorsVoter.claimable(gauge),
          validatorsVoter.weights(gauge),
        ]);

        if (claimable < MIN_CLAIMABLE) return null;

        // ROI score: claimable per unit of weight.
        // If weight is 0 (no votes yet) treat as extremely high ROI — free money.
        const roiScore = weight === 0n
          ? Number.MAX_SAFE_INTEGER
          : Number(claimable) / Number(weight);

        return { gauge, bribe, claimable, weight, roiScore } as GaugeInfo;
      })
    );

    for (const r of results) {
      if (r.status === "fulfilled" && r.value !== null) {
        candidates.push(r.value);
      }
    }

    process.stdout.write(`\r  Scanned ${end}/${total} gauges, ${candidates.length} with bribes...`);
  }

  console.log(`\n\nFound ${candidates.length} gauges with claimable bribes ≥ ${ethers.formatEther(MIN_CLAIMABLE)} MUSD\n`);

  if (candidates.length === 0) {
    console.log("⚠  No gauges with bribes found. Nothing to do.");
    console.log("   Either it's too early in the epoch (bribes accumulate mid-epoch)");
    console.log("   or MIN_CLAIMABLE is set too high. Try again closer to epoch end.\n");
    return;
  }

  // ── Rank by ROI descending ──────────────────────────────────────────────────
  candidates.sort((a, b) => b.roiScore - a.roiScore);

  const topN = Math.min(TOP_N, candidates.length);
  const selected = candidates.slice(0, topN);

  console.log(`Top ${topN} gauges by bribe/vote ROI:`);
  console.log("─".repeat(80));
  console.log(
    "  #  │ Gauge                                      │ Claimable MUSD │ ROI Score"
  );
  console.log("─".repeat(80));

  for (let i = 0; i < selected.length; i++) {
    const g = selected[i];
    const claimableStr = Number(ethers.formatEther(g.claimable)).toFixed(4).padStart(14);
    const roi = g.roiScore === Number.MAX_SAFE_INTEGER ? "∞ (no votes yet)" : g.roiScore.toExponential(3);
    console.log(`  ${String(i + 1).padStart(2)} │ ${g.gauge} │ ${claimableStr} │ ${roi}`);
  }
  console.log("─".repeat(80));

  // ── Calculate weights proportional to claimable MUSD ───────────────────────
  // Weight proportional to claimable means you chase the biggest pots.
  // Pure ROI concentration (all weight to #1) is max aggressive —
  // proportional is a good balance of aggression + diversification.
  const totalClaimable = selected.reduce((sum, g) => sum + g.claimable, 0n);

  const rawBps = selected.map((g) =>
    Math.floor((Number(g.claimable) / Number(totalClaimable)) * 10000)
  );

  // Fix rounding so weights sum exactly to 10000
  const sum = rawBps.reduce((a, b) => a + b, 0);
  rawBps[rawBps.length - 1] += 10000 - sum;

  console.log("\nProposed allocation:");
  console.log("─".repeat(50));
  for (let i = 0; i < selected.length; i++) {
    console.log(
      `  ${selected[i].gauge.slice(0, 10)}...  →  ${bpsToPercent(rawBps[i])}  (${rawBps[i]} BPS)`
    );
  }
  console.log("─".repeat(50));

  // ── Build setGauges args ────────────────────────────────────────────────────
  const gaugeAddrs  = selected.map((g) => g.gauge);
  const brideAddrs  = selected.map((g) => g.bribe);
  const names       = selected.map((_, i) => `Gauge ${i + 1}`);
  const weightsBps  = rawBps;
  const tokens      = selected.map(() => [MUSD_ADDRESS]); // claim MUSD bribes

  // ── Dry run summary ─────────────────────────────────────────────────────────
  const estimatedTotalMUSD = Number(ethers.formatEther(totalClaimable));
  console.log(`\nEstimated claimable this epoch: ${estimatedTotalMUSD.toFixed(4)} MUSD`);
  console.log(`Strategy: concentrate into top ${topN} gauges by proportional bribe weight`);
  console.log(`\nCalling voter.setGauges() on ${byNdVoterAddr}...`);

  const tx = await byNdVoter.setGauges(
    gaugeAddrs,
    brideAddrs,
    names,
    weightsBps,
    tokens
  );
  const receipt = await tx.wait();

  console.log(`\n✓ setGauges confirmed — tx: ${receipt?.hash}`);
  console.log(`  Gas used: ${receipt?.gasUsed?.toString()}`);
  console.log(`\n  Keepers can now call castVotes() once the vote window opens.`);
  console.log(`  (Vote window opens 4h before epoch end — Thursday ~20:00 UTC)\n`);

  // ── Save optimisation log ───────────────────────────────────────────────────
  const log = {
    timestamp:    new Date().toISOString(),
    epoch:        Math.floor(Date.now() / 1000 / (7 * 24 * 3600)),
    gaugesSet:    selected.map((g, i) => ({
      gauge:      g.gauge,
      bribe:      g.bribe,
      claimable:  ethers.formatEther(g.claimable),
      weightBps:  rawBps[i],
    })),
    estimatedMUSD: estimatedTotalMUSD,
    txHash:       receipt?.hash,
  };

  const logPath = path.join(__dirname, "..", `gauge-log-epoch-${log.epoch}.json`);
  fs.writeFileSync(logPath, JSON.stringify(log, null, 2));
  console.log(`  Log saved to: ${logPath}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
