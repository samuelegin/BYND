const { ethers, network } = require("hardhat");

// The bribe contract at gaugeToBribe(gauge) isn't verified on the explorer,
// but we know its exact interface from IReward.sol regardless (pulled
// straight from BoostVoter.sol's import). This calls rewardsListLength()
// (known-good, declared in the interface) then tries the realistic
// candidate names for the by-index token getter, since Solidly/Velodrome
// forks aren't fully consistent on whether it's `rewards`, `rewardTokens`,
// or something else.
//
// Usage:
//   npx hardhat run scripts/enumerate-bribe-tokens.js --network mezotestnet

const IREWARD_ABI = [
  "function rewardsListLength() view returns (uint256)",
  "function isReward(address token) view returns (bool)",
  "function tokenRewardsPerEpoch(address token, uint256 epochStart) view returns (uint256)",
];

// Candidate signatures for the by-index enumeration getter — tried in order.
const CANDIDATES = [
  "function rewards(uint256) view returns (address)",
  "function rewardTokens(uint256) view returns (address)",
  "function tokens(uint256) view returns (address)",
];

const KNOWN_TOKENS = {
  "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503": "MUSD",
};

async function main() {
  const chainId = (await ethers.provider.getNetwork()).chainId;
  if (chainId !== 31611n) throw new Error(`Run with --network mezotestnet`);

  const bribeAddr =
    process.env.BRIBE_CONTRACT || "0x79ab1b030CCBa5Dca3f2B10D6a9293A274D99a68";

  const bribe = await ethers.getContractAt(IREWARD_ABI, bribeAddr);

  console.log(`Bribe contract: ${bribeAddr}\n`);
  const count = await bribe.rewardsListLength();
  console.log(`rewardsListLength(): ${count}\n`);

  if (count === 0n) {
    console.log("No reward tokens registered — nothing to enumerate.");
    return;
  }

  console.log("=".repeat(60));
  console.log("Finding the real by-index getter name...");
  console.log("=".repeat(60));

  let workingSig = null;
  for (const sig of CANDIDATES) {
    try {
      const c = await ethers.getContractAt([sig], bribeAddr);
      const fnName = sig.split("function ")[1].split("(")[0];
      const result = await c[fnName](0);
      console.log(`✓ "${sig}" WORKS — index 0 returns: ${result}`);
      workingSig = { sig, fnName };
      break;
    } catch (err) {
      const fnName = sig.split("function ")[1].split("(")[0];
      console.log(`✗ "${sig}" failed (${fnName} is not the real name)`);
    }
  }

  if (!workingSig) {
    console.log("\nNone of the candidate names worked. The real getter has a");
    console.log("different name — worth checking IReward.sol's implementing");
    console.log("contract source directly, or trying `rewardTokensList`,");
    console.log("`allRewards`, or similar Solidly-fork variants.");
    return;
  }

  console.log("\n" + "=".repeat(60));
  console.log(`Enumerating all ${count} reward tokens via ${workingSig.fnName}()`);
  console.log("=".repeat(60));

  const c = await ethers.getContractAt([workingSig.sig], bribeAddr);
  for (let i = 0; i < Number(count); i++) {
    const tokenAddr = await c[workingSig.fnName](i);
    const label = KNOWN_TOKENS[tokenAddr] || "(unknown token)";
    const epochRewards = await bribe
      .tokenRewardsPerEpoch(tokenAddr, 0)
      .catch(() => "n/a (need real epochStart)");
    console.log(`  [${i}] ${tokenAddr}  ${label}`);
  }

  console.log("\nThis is the real, complete list ByNdVoter._selectOptimalGauges()");
  console.log("should be checking per gauge — not just a single claimable(gauge)");
  console.log("number that (per rewardToken() being the zero address on the real");
  console.log("BoostVoter) may not correspond to any real token at all.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
