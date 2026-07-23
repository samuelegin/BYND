const { ethers } = require("hardhat");

const WEEK = 7 * 24 * 3600;

// Mirrors MockValidatorsVoter.epochNext(): pure floor-to-week-boundary math,
// same grid as real Mezo (Unix epoch 0 is a Thursday, so this lines up with
// real Thursday 00:00 UTC boundaries without needing any anchor date).
function nextBoundary(ts) {
  return ts - (ts % WEEK) + WEEK;
}

// Move chain time to a point well inside the *next* week, comfortably
// outside the last-4h vote window — used so "reverts before window opens"
// tests are deterministic regardless of wall-clock time when the suite runs.
async function jumpOutsideVoteWindow() {
  const latest = await ethers.provider.getBlock("latest");
  const safeTs = nextBoundary(latest.timestamp) + 3600; // 1h past a boundary
  await ethers.provider.send("evm_setNextBlockTimestamp", [safeTs]);
  await ethers.provider.send("evm_mine");
}

// Move chain time to just inside the vote window (last `voteWindow` seconds
// before the next real epoch boundary) — matches ByNdVoter's new gate:
// block.timestamp >= boostVoter.epochNext(block.timestamp) - voteWindow.
async function jumpInsideVoteWindow(voter) {
  const voteWindow = Number(await voter.voteWindow());
  const latest = await ethers.provider.getBlock("latest");
  const now = latest.timestamp;
  const target = nextBoundary(now) - voteWindow + 1;
  await ethers.provider.send("evm_setNextBlockTimestamp", [target > now ? target : now + 1]);
  await ethers.provider.send("evm_mine");
}

module.exports = { WEEK, nextBoundary, jumpOutsideVoteWindow, jumpInsideVoteWindow };
