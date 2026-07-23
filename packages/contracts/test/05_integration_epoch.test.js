const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployAll, mintAndDeposit, setupSingleGauge } = require("./fixtures");
const { jumpInsideVoteWindow } = require("./epochTime");

describe("Integration: one full BynD epoch", function () {
  it("deposit -> extendLocks -> claimRebases -> optimiseAndVote -> harvestAndDistribute -> stake -> claimAll", async () => {
    const ctx = await deployAll();
    const { vault, voter, staking, veBYND, veMEZO, musd, keeper, alice, bob, treasury } = ctx;

    // Step -1: two users deposit veMEZO and receive veBYND 1:1
    const tokenIdAlice = await mintAndDeposit(ctx, alice);
    const tokenIdBob = await mintAndDeposit(ctx, bob);
    expect(await veBYND.balanceOf(alice.address)).to.equal(ethers.parseEther("1000"));
    expect(await veBYND.balanceOf(bob.address)).to.equal(ethers.parseEther("1000"));
    expect(await veMEZO.ownerOf(tokenIdAlice)).to.equal(await vault.getAddress());

    // both stake their veBYND right away so they're eligible for this epoch's yield
    await veBYND.connect(alice).approve(await staking.getAddress(), ethers.parseEther("1000"));
    await veBYND.connect(bob).approve(await staking.getAddress(), ethers.parseEther("1000"));
    await staking.connect(alice).stake(ethers.parseEther("1000"));
    await staking.connect(bob).stake(ethers.parseEther("500")); // bob keeps half liquid

    // gauge configuration
    await setupSingleGauge(ctx, musd);

    // Step 00: claimRebases (permissionless, no epoch gate)
    await expect(vault.connect(keeper).claimRebases())
      .to.emit(vault, "RebasesClaimed")
      .withArgs(keeper.address, 2);

    // Step 01: extendLocks (once per 7-day epoch)
    const lockBefore = await veMEZO.locked(tokenIdAlice);
    await vault.connect(keeper).extendLocks();
    const lockAfter = await veMEZO.locked(tokenIdAlice);
    expect(lockAfter.end).to.be.gt(lockBefore.end);
    await expect(vault.connect(keeper).extendLocks()).to.be.revertedWith(
      "ByNdVault: cooldown active"
    );

    // Step 02: castVotes / optimiseAndVote — fast-forward into the vote window
    await jumpInsideVoteWindow(voter);
    await expect(voter.connect(keeper).optimiseAndVote()).to.emit(voter, "VotesCast");

    // Step 03: harvestAndDistribute — simulate the gauge paying out MUSD bribes
    const { boostVoter } = ctx;
    await musd.mint(await boostVoter.getAddress(), ethers.parseEther("2000"));
    await expect(voter.connect(keeper).harvestAndDistribute())
      .to.emit(voter, "Harvested")
      .withArgs(0, keeper.address, ethers.parseEther("20")); // 1% of 2000

    // keeper claimed rebases + extended locks + cast votes + called harvest itself
    // => 4 of the 5 keeper shares go to `keeper`, 1 to treasury
    const keeperBounty = await musd.balanceOf(keeper.address);
    const treasuryBounty = await musd.balanceOf(treasury.address);
    expect(keeperBounty).to.equal(ethers.parseEther("16")); // 4 * 4 MUSD
    expect(treasuryBounty).to.equal(ethers.parseEther("4")); // 1 * 4 MUSD

    // 99% (1980 MUSD) split 2:1 between alice (1000 staked) and bob (500 staked)
    const aliceClaimable = await staking.claimable(await musd.getAddress(), alice.address);
    const bobClaimable = await staking.claimable(await musd.getAddress(), bob.address);
    expect(aliceClaimable).to.equal(ethers.parseEther("1320"));
    expect(bobClaimable).to.equal(ethers.parseEther("660"));
    expect(aliceClaimable + bobClaimable).to.equal(ethers.parseEther("1980"));

    // Exit: alice claims yield and can freely unstake / trade veBYND (no unbonding)
    await staking.connect(alice).claimAll();
    expect(await musd.balanceOf(alice.address)).to.equal(ethers.parseEther("1320"));

    await staking.connect(bob).unstake(ethers.parseEther("500"));
    // bob kept 500 liquid from the start + gets his 500 staked veBYND back
    expect(await veBYND.balanceOf(bob.address)).to.equal(ethers.parseEther("1000"));
  });
});
