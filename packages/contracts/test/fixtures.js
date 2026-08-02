const { ethers, upgrades } = require("hardhat");

/**
 * Deploys the full BynD v2 stack (UUPS proxies) wired together the same
 * way the deploy:matsnet script does, but against mocks so it runs fully
 * offline / deterministically.
 */
async function deployAll() {
  const [deployer, alice, bob, carol, keeper, treasury, stranger] =
    await ethers.getSigners();

  // --- Mocks standing in for live Mezo infra ---
  const MockVeMEZO = await ethers.getContractFactory("MockVeMEZO");
  const veMEZO = await MockVeMEZO.deploy();

  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const rewardTokenA = await MockERC20.deploy("Bribe Token A", "BRBA", 18);
  const rewardTokenB = await MockERC20.deploy("Bribe Token B", "BRBB", 18);
  const musd = await MockERC20.deploy("Mezo USD", "MUSD", 18);

  const MockBoostVoter = await ethers.getContractFactory(
    "MockBoostVoter"
  );
  const boostVoter = await MockBoostVoter.deploy(
    await rewardTokenA.getAddress()
  );

  const MockRewardsDistributor = await ethers.getContractFactory(
    "MockRewardsDistributor"
  );
  const rewardsDistributor = await MockRewardsDistributor.deploy();

  // --- BynD core (UUPS proxies) ---
  const VeBYND = await ethers.getContractFactory("VeBYND");
  const veBYND = await upgrades.deployProxy(VeBYND, [deployer.address], {
    kind: "uups",
  });

  const ByNdVault = await ethers.getContractFactory("ByNdVault");
  const vault = await upgrades.deployProxy(
    ByNdVault,
    [await veMEZO.getAddress(), await veBYND.getAddress()],
    { kind: "uups" }
  );

  const ByNdStaking = await ethers.getContractFactory("ByNdStaking");
  // distributor is set to deployer temporarily; rewired to the voter below
  const staking = await upgrades.deployProxy(
    ByNdStaking,
    [await veBYND.getAddress(), deployer.address],
    { kind: "uups" }
  );

  const ByNdVoter = await ethers.getContractFactory("ByNdVoter");
  const voter = await upgrades.deployProxy(
    ByNdVoter,
    [
      await staking.getAddress(),
      await boostVoter.getAddress(),
      treasury.address,
      await musd.getAddress(),
    ],
    { kind: "uups" }
  );

  // --- Wiring (mirrors deploy:matsnet) ---
  await veBYND.grantRole(await veBYND.MINTER_ROLE(), await vault.getAddress());
  await veBYND.grantRole(await veBYND.BURNER_ROLE(), await vault.getAddress());
  await vault.setVoter(await voter.getAddress());
  await vault.setRewardsDistributor(await rewardsDistributor.getAddress());
  await voter.setVault(await vault.getAddress());
  await staking.setDistributor(await voter.getAddress());

  return {
    deployer,
    alice,
    bob,
    carol,
    keeper,
    treasury,
    stranger,
    veMEZO,
    rewardTokenA,
    rewardTokenB,
    musd,
    boostVoter,
    rewardsDistributor,
    veBYND,
    vault,
    staking,
    voter,
  };
}

/** Mints a veMEZO NFT to `user` and deposits it into the vault, returning the tokenId. */
async function mintAndDeposit(ctx, user, mintFn = "mint") {
  const { veMEZO, vault } = ctx;
  const tx = await veMEZO[mintFn](user.address, 0);
  const receipt = await tx.wait();
  // Transfer event: Transfer(address(0), user, tokenId)
  const iface = veMEZO.interface;
  let tokenId;
  for (const log of receipt.logs) {
    try {
      const parsed = iface.parseLog(log);
      if (parsed && parsed.name === "Transfer") {
        tokenId = parsed.args[2];
        break;
      }
    } catch (_) {}
  }
  await veMEZO.connect(user).approve(await vault.getAddress(), tokenId);
  await vault.connect(user).deposit(tokenId);
  return tokenId;
}

/** Wires a single alive gauge with a bribe contract that pays out `token`. */
async function setupSingleGauge(ctx, token) {
  const { boostVoter, voter, deployer } = ctx;
  const gauge = ethers.Wallet.createRandom().address;

  // Real gauges each have their OWN separate bribe/reward contract instance
  // (that's exactly why a single gauge can hold several different tokens'
  // bribes at once — confirmed live on Matsnet). A random EOA address here
  // used to be fine when the old auto-select logic only ever called
  // claimable(gauge) on the voter itself, but the fixed logic calls
  // gaugeToBribe(gauge) and then tokenRewardsPerEpoch() directly ON that
  // address — it needs to actually be a contract implementing IReward.
  const MockReward = await ethers.getContractFactory("MockReward");
  const bribeContract = await MockReward.deploy();
  const bribe = await bribeContract.getAddress();

  await boostVoter.addGauge(gauge, bribe);
  await voter
    .connect(deployer)
    .setGauges(
      [gauge],
      [bribe],
      ["Gauge A"],
      [10000],
      [[await token.getAddress()]]
    );
  return { gauge, bribe, bribeContract };
}

/// @dev Seeds a specific token's tokenRewardsPerEpoch() amount on a gauge's
/// mock bribe contract, for testing the auto-select ranking fix.
async function seedGaugeReward(bribeContract, token, amount) {
  await bribeContract.setTokenRewardsPerEpoch(await token.getAddress(), amount);
}

module.exports = { deployAll, mintAndDeposit, setupSingleGauge, seedGaugeReward };
