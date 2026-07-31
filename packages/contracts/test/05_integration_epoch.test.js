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

    // Bob's deposit above got merged into Alice's canonical veMEZO NFT
    // (MockVeMEZO implements merge() the same way Mezo's real Escrow.sol
    // does), so the vault only ever manages ONE tokenId from here on —
    // extendLocks()/claimRebases() no longer take a tokenId array at all;
    // they just process whatever's currently in allTokenIds (length 1).
    expect((await vault.getAllTokenIds()).length).to.equal(1);
    expect(await vault.canonicalTokenId()).to.equal(tokenIdAlice);

    // Step 00: claimRebases (permissionless, now O(1) regardless of how many
    // people deposited, since everything's consolidated into one NFT)
    await expect(vault.connect(keeper).claimRebases())
      .to.emit(vault, "RebasesClaimed")
      .withArgs(keeper.address, 1);

    // Step 01: extendLocks (permissionless, no cooldown — safe to call as
    // often as needed since it's a no-op once a lock is maxed)
    const lockBefore = await veMEZO.locked(tokenIdAlice);
    await vault.connect(keeper).extendLocks();
    const lockAfter = await veMEZO.locked(tokenIdAlice);
    expect(lockAfter.end).to.be.gt(lockBefore.end);
    await expect(vault.connect(keeper).extendLocks()).to.not.be.reverted;

    // Step 02: castVotes / optimiseAndVote — fast-forward into the vote window
    await jumpInsideVoteWindow(voter);
    await expect(voter.connect(keeper).optimiseAndVote()).to.emit(voter, "VotesCast");

    // Step 03: claimBribesBatch — page through managed tokenIds claiming
    // bribes, simulating the gauge paying out MUSD bribes into the voter
    const { boostVoter } = ctx;
    await musd.mint(await boostVoter.getAddress(), ethers.parseEther("2000"));
    await voter.connect(keeper).claimBribesBatch(200);

    // Step 04: harvestAndDistribute — finalizes the epoch and pays out
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
