const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { deployAll, setupSingleGauge } = require("./fixtures");
const { jumpInsideVoteWindow } = require("./epochTime");

const REWARDS_DURATION = 7 * 24 * 60 * 60;
const DUST = 1_000_000n;

/**
 * HarvestLib extraction — Phase 2 verification.
 *
 * The library is called via DELEGATECALL, so it executes in ByNdVoter's own
 * storage and balance context. The carriedOver mapping pointer resolves to
 * ByNdVoter's slot, transfers move ByNdVoter's token balances, and events
 * carry ByNdVoter's address. Externally the behaviour is unchanged.
 */
describe("HarvestLib integration", () => {
  let ctx;

  beforeEach(async () => {
    ctx = await deployAll();
  });

  async function runEpoch() {
    const { voter } = ctx;
    await jumpInsideVoteWindow(voter);
    await voter.optimiseAndVote();
    await voter.claimBribesBatch(200);
    await voter.harvestAndDistribute();
  }

  it("carriedOver writes through the library match direct reads on the voter", async () => {
    const { voter, staking, rewardTokenA, deployer } = ctx;
    const { bribe } = await setupSingleGauge(ctx, rewardTokenA);
    await voter.connect(deployer).setManagedTokenId(1);

    // Epoch 0: harvest before anyone has staked → defers the share
    await rewardTokenA.mint(deployer.address, ethers.parseEther("1000"));
    await rewardTokenA.connect(deployer).approve(
      await ctx.boostVoter.getAddress(),
      ethers.parseEther("1000")
    );
    await ctx.boostVoter.connect(deployer).seedBribe(bribe, ethers.parseEther("1000"));

    await runEpoch();

    // The library's carriedOverNet[token] += stakerAmount write must land in
    // ByNdVoter's actual storage, readable via the voter's public getter.
    // The deferred staker share is already taxed, so it banks into NET rather
    // than the untaxed `carriedOver` (BYND-04).
    expect(await voter.carriedOverNet(await rewardTokenA.getAddress())).to.equal(
      ethers.parseEther("990")
    );
    expect(await voter.carriedOver(await rewardTokenA.getAddress())).to.equal(0);
    expect(await staking.rewardTokenCount()).to.equal(0);
  });

  it("the library's transfers move the voter's own token balance", async () => {
    const { voter, boostVoter, staking, veBYND, deployer, alice, rewardTokenA, treasury } = ctx;
    await veBYND.grantRole(await veBYND.MINTER_ROLE(), deployer.address);
    await veBYND.mint(alice.address, ethers.parseEther("10"));
    await veBYND.connect(alice).approve(await staking.getAddress(), ethers.parseEther("10"));
    await staking.connect(alice).stake(ethers.parseEther("10"));

    const { bribe } = await setupSingleGauge(ctx, rewardTokenA);
    await rewardTokenA.mint(deployer.address, ethers.parseEther("1000"));
    await rewardTokenA.connect(deployer).approve(
      await boostVoter.getAddress(),
      ethers.parseEther("1000")
    );
    await boostVoter.connect(deployer).seedBribe(bribe, ethers.parseEther("1000"));

    await voter.connect(deployer).setManagedTokenId(1);
    await jumpInsideVoteWindow(voter);
    await voter.optimiseAndVote();
    await voter.claimBribesBatch(200);

    const voterBalBefore = await rewardTokenA.balanceOf(await voter.getAddress());
    const treasuryBalBefore = await rewardTokenA.balanceOf(treasury.address);
    const stakingBalBefore = await rewardTokenA.balanceOf(await staking.getAddress());

    await voter.harvestAndDistribute();

    // The library transferred out of the voter's balance, into treasury and
    // staking, exactly as the old inline code did.
    const voterBalAfter = await rewardTokenA.balanceOf(await voter.getAddress());
    const treasuryBalAfter = await rewardTokenA.balanceOf(treasury.address);
    const stakingBalAfter = await rewardTokenA.balanceOf(await staking.getAddress());

    expect(voterBalAfter).to.be.lt(voterBalBefore); // voter paid out
    expect(treasuryBalAfter).to.be.gt(treasuryBalBefore); // treasury received bounty
    expect(stakingBalAfter).to.be.gt(stakingBalBefore); // staking received 99%

    // The 990 staker share reached the pool immediately (streaming matures over
    // rewardsDuration, but the transfer is instant).
    expect(stakingBalAfter - stakingBalBefore).to.equal(ethers.parseEther("990"));
  });

  it("events emitted by the library carry the voter's address, not the library's", async () => {
    const { voter, boostVoter, staking, veBYND, deployer, alice, rewardTokenA } = ctx;
    await veBYND.grantRole(await veBYND.MINTER_ROLE(), deployer.address);
    await veBYND.mint(alice.address, ethers.parseEther("10"));
    await veBYND.connect(alice).approve(await staking.getAddress(), ethers.parseEther("10"));
    await staking.connect(alice).stake(ethers.parseEther("10"));

    const { bribe } = await setupSingleGauge(ctx, rewardTokenA);
    await rewardTokenA.mint(deployer.address, ethers.parseEther("1000"));
    await rewardTokenA.connect(deployer).approve(
      await boostVoter.getAddress(),
      ethers.parseEther("1000")
    );
    await boostVoter.connect(deployer).seedBribe(bribe, ethers.parseEther("1000"));

    await voter.connect(deployer).setManagedTokenId(1);
    await jumpInsideVoteWindow(voter);
    await voter.optimiseAndVote();
    await voter.claimBribesBatch(200);

    // KeeperPaid is declared in HarvestLib and emitted inside the library body.
    // DELEGATECALL preserves msg.sender and address(this), so the event carries
    // the voter's address, not the library's.
    await expect(voter.harvestAndDistribute())
      .to.emit(voter, "KeeperPaid");
  });

  it("below-threshold carryover accumulates exactly as before", async () => {
    const { voter, staking, veBYND, deployer, alice, rewardTokenA } = ctx;
    await veBYND.grantRole(await veBYND.MINTER_ROLE(), deployer.address);
    await veBYND.mint(alice.address, ethers.parseEther("10"));
    await veBYND.connect(alice).approve(await staking.getAddress(), ethers.parseEther("10"));
    await staking.connect(alice).stake(ethers.parseEther("10"));

    const { bribe } = await setupSingleGauge(ctx, rewardTokenA);
    await voter.connect(deployer).setManagedTokenId(1);
    await voter.connect(deployer).setTokenMinHarvestThreshold(
      await rewardTokenA.getAddress(),
      ethers.parseEther("150")
    );

    // Epoch 0: below threshold
    await rewardTokenA.mint(deployer.address, ethers.parseEther("100"));
    await rewardTokenA.connect(deployer).approve(
      await ctx.boostVoter.getAddress(),
      ethers.parseEther("100")
    );
    await ctx.boostVoter.connect(deployer).seedBribe(bribe, ethers.parseEther("100"));
    await runEpoch();

    expect(await voter.carriedOver(await rewardTokenA.getAddress())).to.equal(
      ethers.parseEther("100")
    );
    expect(await rewardTokenA.balanceOf(await staking.getAddress())).to.equal(0);

    // Epoch 1: another 100, total 200 clears threshold
    await rewardTokenA.mint(deployer.address, ethers.parseEther("100"));
    await rewardTokenA.connect(deployer).approve(
      await ctx.boostVoter.getAddress(),
      ethers.parseEther("100")
    );
    await ctx.boostVoter.connect(deployer).seedBribe(bribe, ethers.parseEther("100"));
    await runEpoch();

    expect(await voter.carriedOver(await rewardTokenA.getAddress())).to.equal(0);
    expect(await rewardTokenA.balanceOf(await staking.getAddress())).to.equal(
      ethers.parseEther("198") // 200 at 1% bounty
    );
  });
});
