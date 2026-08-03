const { ethers } = require("hardhat");

const WEEK = 7 * 24 * 3600;
function nextBoundary(ts) {
  return ts - (ts % WEEK) + WEEK;
}

async function jumpOutsideVoteWindow() {
  const latest = await ethers.provider.getBlock("latest");
  const safeTs = nextBoundary(latest.timestamp) + 3600; // 1h past a boundary
  await ethers.provider.send("evm_setNextBlockTimestamp", [safeTs]);
  await ethers.provider.send("evm_mine");
}

async function jumpInsideVoteWindow(voter) {
  const voteWindow = Number(await voter.voteWindow());
  const latest = await ethers.provider.getBlock("latest");
  const now = latest.timestamp;
  const target = nextBoundary(now) - voteWindow + 1;
  await ethers.provider.send("evm_setNextBlockTimestamp", [target > now ? target : now + 1]);
  await ethers.provider.send("evm_mine");
}

async function jumpInsideExtendWindow(voter) {
  const extendWindow = Number(await voter.extendWindow());
  const latest = await ethers.provider.getBlock("latest");
  const now = latest.timestamp;
  if (extendWindow === 0) return; // gate disabled, any time is inside
  const target = nextBoundary(now) - extendWindow + 1;
  await ethers.provider.send("evm_setNextBlockTimestamp", [target > now ? target : now + 1]);
  await ethers.provider.send("evm_mine");
}

module.exports = {
  WEEK,
  nextBoundary,
  jumpOutsideVoteWindow,
  jumpInsideVoteWindow,
  jumpInsideExtendWindow,
};