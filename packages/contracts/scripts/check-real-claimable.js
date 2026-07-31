const { ethers, network } = require("hardhat");

const BOOST_VOTER_ABI = [
  "function claimable(address) view returns (uint256)",
  "function isAlive(address) view returns (bool)",
  "function periodFinish() view returns (uint256)",
  "function activePeriod() view returns (uint256)",
  "function epochVoteEnd() view returns (uint256)",
];
const DEFAULT_BOOST_VOTER = "0x21d7bDF5a5929AD179F8cA0c9014A0B62ae6Bfd1";

async function main() {
  const chainId = (await ethers.provider.getNetwork()).chainId;
  if (chainId !== 31611n) throw new Error(`Run with --network mezotestnet`);

  const gauge = process.env.GAUGE_ADDRESS || "0xb61D510dF1f1aeFc23016C39F5beA213E2f6e173";
  const boostVoterAddr = process.env.BOOST_VOTER_ADDRESS || DEFAULT_BOOST_VOTER;
  const boostVoter = await ethers.getContractAt(BOOST_VOTER_ABI, boostVoterAddr);

  console.log(`Gauge: ${gauge}`);
  console.log(`Alive: ${await boostVoter.isAlive(gauge)}`);
  console.log(`Real claimable() right now: ${(await boostVoter.claimable(gauge)).toString()}`);

  // Try to read Mezo's real period clock, if this contract exposes it
  try {
    const now = Math.floor(Date.now() / 1000);
    const periodFinish = await boostVoter.periodFinish().catch(() => null);
    const activePeriod = await boostVoter.activePeriod().catch(() => null);
    const epochVoteEnd = await boostVoter.epochVoteEnd().catch(() => null);
    console.log(`\nMezo's real period clock:`);
    console.log(`  now             : ${now}`);
    if (periodFinish) console.log(`  periodFinish    : ${periodFinish} (${Number(periodFinish) > now ? "in the future" : "already passed"})`);
    if (activePeriod) console.log(`  activePeriod    : ${activePeriod}`);
    if (epochVoteEnd) console.log(`  epochVoteEnd    : ${epochVoteEnd} (${Number(epochVoteEnd) > now ? "in the future" : "already passed"})`);
  } catch (e) {
    console.log(`\n(Could not read period clock: ${e.message})`);
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
