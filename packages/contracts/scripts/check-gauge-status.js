const { ethers, network } = require("hardhat");

const BOOST_VOTER_ABI = [
  "function boostableTokenIdToGauge(uint256) view returns (address)",
  "function gaugeToBribe(address) view returns (address)",
  "function isAlive(address) view returns (bool)",
  "function isWhitelistedToken(address) view returns (bool)",
  "function claimable(address) view returns (uint256)",
];

const DEFAULT_BOOST_VOTER = "0x21d7bDF5a5929AD179F8cA0c9014A0B62ae6Bfd1";

const KNOWN_TOKENS = {
  MEZO: "0x7B7c000000000000000000000000000000000001",
  MUSD: "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503",
};

async function main() {
  const chainId = (await ethers.provider.getNetwork()).chainId;
  if (chainId !== 31611n) {
    throw new Error(
      `This is a read-only checker for Mezo Matsnet (chainId 31611). Got ${chainId}. ` +
      `Run it with --network mezotestnet.`
    );
  }

  const tokenIdArg = process.env.TOKEN_ID;
  if (!tokenIdArg) {
    throw new Error(
      "Set TOKEN_ID to the veBTC lock tokenId to check, e.g.\n" +
      "  TOKEN_ID=1422 npx hardhat run scripts/check-gauge-status.js --network mezotestnet"
    );
  }
  const tokenId = BigInt(tokenIdArg);

  const boostVoterAddr = process.env.BOOST_VOTER_ADDRESS || DEFAULT_BOOST_VOTER;
  const boostVoter = await ethers.getContractAt(BOOST_VOTER_ABI, boostVoterAddr);

  console.log(`BoostVoter: ${boostVoterAddr} (${network.name})`);
  console.log(`veBTC lock tokenId: ${tokenId}\n`);

  const gauge = await boostVoter.boostableTokenIdToGauge(tokenId);
  if (gauge === ethers.ZeroAddress) {
    console.log("No gauge exists yet for this tokenId.");
    console.log("Create one with createBoostGauge(gaugeFactory, tokenId, [], []) on BoostVoter.");
    return;
  }
  console.log(`Gauge          : ${gauge}`);

  const alive = await boostVoter.isAlive(gauge);
  console.log(`Alive          : ${alive}`);

  const bribe = await boostVoter.gaugeToBribe(gauge);
  console.log(`Bribe contract : ${bribe}`);

  let claimableAmt = 0n;
  try {
    claimableAmt = await boostVoter.claimable(gauge);
  } catch {
  }
  console.log(`Claimable : ${claimableAmt.toString()}${claimableAmt > 0n ? "  <- FUNDED" : ""}`);

  console.log("\nBribe token whitelist status:");
  const extra = (process.env.EXTRA_TOKENS || "")
    .split(",")
    .map((t) => t.trim())
    .filter((t) => ethers.isAddress(t));

  const tokensToCheck = { ...KNOWN_TOKENS };
  extra.forEach((addr, i) => (tokensToCheck[`extra${i}`] = addr));

  for (const [name, addr] of Object.entries(tokensToCheck)) {
    try {
      const whitelisted = await boostVoter.isWhitelistedToken(addr);
      console.log(`${name.padEnd(8)} ${addr}  whitelisted=${whitelisted}`);
    } catch {
      console.log(`${name.padEnd(8)} ${addr}  <error checking>`);
    }
  }

  console.log("\nTo add a bribe once you have a gauge:");
  console.log(`1. approve(${boostVoterAddr}, amount) on the bribe token`);
  console.log(`2. addBribes(${gauge}, [tokenAddress], [amount]) on BoostVoter`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});