const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

// Bynd's own contracts never hold or move bribe funds themselves — bribes
// live on Mezo's real BoostVoter/Bribe contracts. This script talks directly
// to BoostVoter to fund a gauge, so run-test-epoch.js / the Keeper page's
// optimiseAndVote() + harvestAndDistribute() have something real to vote for
// and harvest, instead of pointing at an empty (0-claimable) test gauge.
//
// Recipe (confirmed against BoostVoter's real interface):
//   1. approve(boostVoterAddr, amount) on the bribe token
//   2. addBribes(gauge, [tokenAddress], [amount]) on BoostVoter
//
// Usage examples:
//   # Fund the gauge for a specific veBTC lock tokenId with 5 MEZO
//   TOKEN_ID=1422 AMOUNT=5 npx hardhat run scripts/fund-bribe.js --network mezotestnet
//
//   # Fund a gauge you already know the address of
//   GAUGE_ADDRESS=0x... AMOUNT=5 BRIBE_TOKEN=0x... npx hardhat run scripts/fund-bribe.js --network mezotestnet
//
//   # Skip straight to wiring it up as ByNdVoter's active gauge afterward
//   TOKEN_ID=1422 AMOUNT=5 SET_AS_ACTIVE_GAUGE=true npx hardhat run scripts/fund-bribe.js --network mezotestnet

const BOOST_VOTER_ABI = [
  "function boostableTokenIdToGauge(uint256) view returns (address)",
  "function gaugeToBribe(address) view returns (address)",
  "function isAlive(address) view returns (bool)",
  "function isWhitelistedToken(address) view returns (bool)",
  "function claimable(address) view returns (uint256)",
  "function addBribes(address gauge, address[] tokens, uint256[] amounts) external",
];

const ERC20_ABI = [
  "function approve(address,uint256) external returns (bool)",
  "function allowance(address,address) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

const DEFAULT_BOOST_VOTER = "0x21d7bDF5a5929AD179F8cA0c9014A0B62ae6Bfd1";

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
  console.log(`Using deployment record: ${latest}`);
  return JSON.parse(fs.readFileSync(path.join(dir, latest), "utf8"));
}

async function main() {
  const chainId = (await ethers.provider.getNetwork()).chainId;
  if (chainId !== 31611n) {
    throw new Error(
      `This script targets Mezo Matsnet (chainId 31611). Got ${chainId}. ` +
      `Run it with --network mezotestnet.`
    );
  }

  const [signer] = await ethers.getSigners();
  const boostVoterAddr = process.env.BOOST_VOTER_ADDRESS || DEFAULT_BOOST_VOTER;
  const boostVoter = await ethers.getContractAt(BOOST_VOTER_ABI, boostVoterAddr);

  console.log(`Signer      : ${signer.address}`);
  console.log(`BoostVoter  : ${boostVoterAddr} (${network.name})\n`);

  // ── Resolve the gauge to fund ─────────────────────────────────────────
  let gauge = process.env.GAUGE_ADDRESS;
  if (!gauge) {
    const tokenIdArg = process.env.TOKEN_ID;
    if (!tokenIdArg) {
      throw new Error(
        "Set either GAUGE_ADDRESS (an existing gauge) or TOKEN_ID (a veBTC lock " +
        "tokenId whose gauge you want to fund), e.g.\n" +
        "  TOKEN_ID=1422 AMOUNT=5 npx hardhat run scripts/fund-bribe.js --network mezotestnet"
      );
    }
    gauge = await boostVoter.boostableTokenIdToGauge(BigInt(tokenIdArg));
    if (gauge === ethers.ZeroAddress) {
      throw new Error(
        `No gauge exists yet for veBTC tokenId ${tokenIdArg}. A gauge must be ` +
        `created first via createBoostGauge() — lock some testnet BTC on Mezo's ` +
        `portal first, or pass GAUGE_ADDRESS for a gauge that already exists ` +
        `(see scripts/scan-matsnet-gauges.js for a list).`
      );
    }
    console.log(`Resolved gauge for tokenId ${tokenIdArg}: ${gauge}`);
  }

  const alive = await boostVoter.isAlive(gauge);
  if (!alive) {
    throw new Error(`Gauge ${gauge} is not alive — bribes on a dead gauge won't be votable.`);
  }
  const bribe = await boostVoter.gaugeToBribe(gauge);
  console.log(`Gauge       : ${gauge}`);
  console.log(`Bribe       : ${bribe}`);

  // ── Resolve the bribe token + amount ──────────────────────────────────
  const bribeToken = process.env.BRIBE_TOKEN || KNOWN_TOKENS.MEZO;
  const token = await ethers.getContractAt(ERC20_ABI, bribeToken);

  const whitelisted = await boostVoter.isWhitelistedToken(bribeToken).catch(() => null);
  if (whitelisted === false) {
    throw new Error(
      `${bribeToken} is not whitelisted as a bribe token on this BoostVoter. ` +
      `addBribes() will revert. Try MEZO (${KNOWN_TOKENS.MEZO}) or MUSD ` +
      `(${KNOWN_TOKENS.MUSD}), or pass EXTRA_TOKENS to scripts/check-gauge-status.js ` +
      `first to confirm whitelist status of a different token.`
    );
  }

  const decimals = await token.decimals();
  const symbol = await token.symbol().catch(() => "TOKEN");
  const amountArg = process.env.AMOUNT || "1";
  const amount = ethers.parseUnits(amountArg, decimals);

  const balance = await token.balanceOf(signer.address);
  if (balance < amount) {
    throw new Error(
      `Signer only holds ${ethers.formatUnits(balance, decimals)} ${symbol}, ` +
      `need ${amountArg} ${symbol}. Get testnet ${symbol} from Mezo's faucet/portal first.`
    );
  }

  console.log(`\nFunding ${amountArg} ${symbol} as a bribe on gauge ${gauge}...`);

  const allowance = await token.allowance(signer.address, boostVoterAddr);
  if (allowance < amount) {
    console.log(`  Approving BoostVoter to spend ${symbol}...`);
    await (await token.approve(boostVoterAddr, amount)).wait();
  }

  const tx = await boostVoter.addBribes(gauge, [bribeToken], [amount]);
  const receipt = await tx.wait();
  console.log(`  Bribe added. Tx: ${receipt.hash}`);

  const claimableAfter = await boostVoter.claimable(gauge);
  console.log(`\nGauge claimable balance is now: ${claimableAfter.toString()}`);

  // ── Optionally wire this gauge into ByNdVoter right away ──────────────
  if (process.env.SET_AS_ACTIVE_GAUGE === "true") {
    const deployment = loadLatestDeployment();
    if (!deployment) {
      console.log(
        "\nSET_AS_ACTIVE_GAUGE was set but no deployment record was found in " +
        "deployments/ — skipping setGauges() call. Run this without that flag " +
        "and configure it manually via ByNdVoter.setGauges() instead."
      );
      return;
    }
    const voter = await ethers.getContractAt("ByNdVoter", deployment.contracts.ByNdVoter);
    console.log(`\nWiring ${gauge} into ByNdVoter (${deployment.contracts.ByNdVoter}) as the active gauge...`);
    await (
      await voter.setGauges(
        [gauge],
        [bribe],
        ["funded-test-gauge"],
        [10000],
        [[bribeToken]]
      )
    ).wait();
    console.log("  Done — optimiseAndVote() will now vote for this gauge, and it has a real bribe to harvest.");
  } else {
    console.log(
      "\nTo point ByNdVoter at this gauge, either call setGauges() yourself, or " +
      "re-run with SET_AS_ACTIVE_GAUGE=true."
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
