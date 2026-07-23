const { ethers, network } = require("hardhat");

const VALIDATORS_VOTER_ABI = [
  "function length() view returns (uint256)",
  "function gauges(uint256) view returns (address)",
  "function gaugeToBribe(address) view returns (address)",
  "function isAlive(address) view returns (bool)",
  "function claimable(address) view returns (uint256)",
];

const DEFAULT_VALIDATORS_VOTER = "0x21d7bDF5a5929AD179F8cA0c9014A0B62ae6Bfd1";

async function main() {
  const chainId = (await ethers.provider.getNetwork()).chainId;
  if (chainId !== 31611n) {
    throw new Error(
      `This is a read-only scanner for Mezo Matsnet (chainId 31611). Got ${chainId}. ` +
      `Run it with --network mezotestnet.`
    );
  }

  const validatorsVoterAddr = process.env.BOOST_VOTER_ADDRESS || DEFAULT_VALIDATORS_VOTER;
  console.log(`Scanning ValidatorsVoter at ${validatorsVoterAddr} on ${network.name}...\n`);

  const validatorsVoter = await ethers.getContractAt(VALIDATORS_VOTER_ABI, validatorsVoterAddr);
  const total = await validatorsVoter.length();
  console.log(`Total gauges registered: ${total}\n`);

  let aliveCount = 0;
  let fundedCount = 0;
  const funded = [];

  for (let i = 0n; i < total; i++) {
    const gauge = await validatorsVoter.gauges(i);
    const alive = await validatorsVoter.isAlive(gauge);
    if (!alive) continue;
    aliveCount++;

    let claimableAmt = 0n;
    try {
      claimableAmt = await validatorsVoter.claimable(gauge);
    } catch {
    }

    const bribe = await validatorsVoter.gaugeToBribe(gauge);
    const status = claimableAmt > 0n ? "FUNDED" : "empty";
    console.log(`[${i}] gauge=${gauge}  bribe=${bribe}  alive=yes  claimable=${claimableAmt.toString()}  (${status})`);

    if (claimableAmt > 0n) {
      fundedCount++;
      funded.push({ index: i.toString(), gauge, bribe, claimable: claimableAmt.toString() });
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Alive gauges   : ${aliveCount} / ${total}`);
  console.log(`Funded gauges  : ${fundedCount}`);

  if (fundedCount > 0) {
    console.log(`\nAt least one gauge already has a real claimable balance — you can`);
    console.log(`test against it directly instead of funding your own:`);
    console.log(JSON.stringify(funded, null, 2));
  } else {
    console.log(`\nNo gauge currently has a non-zero claimable balance. This is expected`);
    console.log(`on a testnet — nobody's actively bribing for testnet boost. To get a`);
    console.log(`real end-to-end test, lock a small amount of testnet BTC on Mezo's`);
    console.log(`portal (creates your own gauge automatically), then post an incentive`);
    console.log(`on it — try matchbox.markets for the UI path, or check Mezo's docs`);
    console.log(`for the bribe contract's deposit function if you'd rather script it.`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});