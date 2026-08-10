const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployAll, mintAndDeposit } = require("./fixtures");
const { jumpInsideExtendWindow, nextBoundary, WEEK } = require("./epochTime");

// BYND-14 -- ByNdVault called veMEZO.increaseUnlockTime with an ABSOLUTE end
// timestamp, but the real contract takes a DURATION in seconds. Every call
// reverted with LockDurationTooLong(), because `block.timestamp + MAXTIME`
// reads as ~57 years when interpreted as a duration.
//
// Verified against the live contract on Matsnet
// (0xaCE816CA2bcc9b12C59799dcC5A959Fb9b98111b) by static-calling it as the
// vault: passing 1, 2 and 3 years as a DURATION succeeds, while passing any
// absolute timestamp fails. Two real keeper calls, on 27 Jul and 3 Aug 2026,
// each extended 0 of 5 locks while still emitting LocksExtended and marking
// the epoch complete.
//
// The suite passed green throughout, because MockVeMEZO implemented the same
// absolute-timestamp semantics the vault assumed -- the mock agreed with the
// bug, so no test could see it. These run against the mock corrected to the
// real contract's behaviour.
describe("ByNdVault -- veMEZO lock extension ABI (BYND-14)", () => {
  let ctx;
  beforeEach(async () => {
    ctx = await deployAll();
  });

  // A freshly minted mock lock already sits ~4 years out, so a max-length
  // extension is not strictly in the future and is legitimately skipped. To
  // exercise the extension path the lock has to be shorter than the target.
  async function depositShortLock(user, endOffsetDays) {
    const { veMEZO, vault } = ctx;
    const latest = await ethers.provider.getBlock("latest");
    const tokenId = 7000n + BigInt(endOffsetDays);
    await veMEZO.mintCustom(
      user.address,
      tokenId,
      ethers.parseEther("1000"),
      latest.timestamp + endOffsetDays * 24 * 60 * 60
    );
    await veMEZO.connect(user).approve(await vault.getAddress(), tokenId);
    await vault.connect(user).deposit(tokenId);
    return tokenId;
  }

  it("actually extends a lock instead of reverting on every token", async () => {
    const { vault, veMEZO, alice, keeper } = ctx;
    const tokenId = await depositShortLock(alice, 400);
    const before = (await veMEZO.locked(tokenId)).end;

    await jumpInsideExtendWindow(ctx.voter);
    await vault.connect(keeper).extendLocks();

    // Pre-fix this was unchanged: the call reverted inside the try/catch and
    // was swallowed as a LockExtendSkipped.
    expect((await veMEZO.locked(tokenId)).end).to.be.gt(before);
  });

  it("passes MAXTIME as a duration, landing inside veMEZO's accepted range", async () => {
    const { vault, veMEZO, alice, keeper } = ctx;
    const tokenId = await depositShortLock(alice, 400);

    await jumpInsideExtendWindow(ctx.voter);
    await vault.connect(keeper).extendLocks();

    const end = (await veMEZO.locked(tokenId)).end;
    const now = BigInt((await ethers.provider.getBlock("latest")).timestamp);
    const maxtime = await vault.MAXTIME();
    const week = await vault.WEEK();

    // Week-aligned and within MAXTIME of *now* -- the signature of a duration
    // argument. The old code passed `now + MAXTIME` as the argument itself,
    // which the real contract rejects outright.
    expect(end % week).to.equal(0n);
    expect(end).to.be.lte(now + maxtime);
    expect(end).to.be.gt(now);
  });

  it("keeps MAXTIME inside what veMEZO accepts", async () => {
    // 208 weeks is accepted on Matsnet; 4 * 365 days is 345600s longer and
    // reverts with LockDurationTooLong(). The old constant was the latter.
    const { vault } = ctx;
    expect(await vault.MAXTIME()).to.equal(208n * 604800n);
    expect(await vault.MAXTIME()).to.be.lt(BigInt(4 * 365 * 24 * 60 * 60));
  });

  it("reports the count it actually extended, not the count it attempted", async () => {
    const { vault, veMEZO, alice, keeper } = ctx;
    // The canonical lock extends cleanly.
    await depositShortLock(alice, 400);

    // A voted token cannot merge, so it stays a straggler in allTokenIds, and
    // it cannot be extended either -- the same AlreadyVoted() gate. The pass
    // therefore attempts two tokens and succeeds on one.
    const latest = await ethers.provider.getBlock("latest");
    const stuckId = 7900n;
    await veMEZO.mintCustom(
      alice.address,
      stuckId,
      ethers.parseEther("1000"),
      latest.timestamp + 400 * 24 * 60 * 60
    );
    await veMEZO.setVotedForTest(stuckId, true);
    await veMEZO.connect(alice).approve(await vault.getAddress(), stuckId);
    await vault.connect(alice).deposit(stuckId);

    await jumpInsideExtendWindow(ctx.voter);
    // Pre-fix the count was whatever the loop walked over; it now counts only
    // the calls that actually landed.
    await expect(vault.connect(keeper).extendLocks())
      .to.emit(vault, "LocksExtended")
      .withArgs(keeper.address, 1, (v) => v > 0n);
  });

  it("refuses to report a completed pass when every extension failed", async () => {
    const { vault, veMEZO, alice, keeper } = ctx;
    const tokenId = await depositShortLock(alice, 400);

    // The real veMEZO rejects increaseUnlockTime on a token holding an active
    // gauge vote -- token 829 on Matsnet reverts AlreadyVoted() for exactly
    // this reason. With the only token failing, the pass did no work.
    await veMEZO.setVotedForTest(tokenId, true);

    await jumpInsideExtendWindow(ctx.voter);
    // Pre-fix this emitted LocksExtended(keeper, 0, ...) and marked the epoch
    // done, which is how two epochs of total failure looked like success.
    await expect(vault.connect(keeper).extendLocks()).to.be.revertedWith(
      "ByNdVault: every extension failed"
    );
  });

  it("still succeeds when locks are skipped as already long enough", async () => {
    // The guard must separate "nothing needed doing" from "everything broke".
    // A freshly minted lock is already at max, so it is skipped, not failed --
    // a legitimate zero-work pass that must still close the epoch.
    const { vault, voter, alice, keeper } = ctx;
    await mintAndDeposit(ctx, alice);

    await jumpInsideExtendWindow(ctx.voter);
    await expect(vault.connect(keeper).extendLocks()).to.not.be.reverted;
    expect(await voter.epochLocksExtended(await voter.currentEpoch())).to.equal(true);
  });
});
