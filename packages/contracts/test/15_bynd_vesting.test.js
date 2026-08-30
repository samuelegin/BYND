const { expect } = require("chai");
const { ethers, network } = require("hardhat");

async function increaseTime(seconds) {
  await network.provider.send("evm_increaseTime", [Number(seconds)]);
  await network.provider.send("evm_mine");
}

async function nowTs() {
  return (await ethers.provider.getBlock("latest")).timestamp;
}

const DAY = 24 * 60 * 60;

describe("BYNDTeamVesting + BYNDInvestorVesting", function () {
  let admin, timelock, alice, bob;
  let bynd, teamVesting, investorVesting;
  const CAP = ethers.parseEther("100000000");

  beforeEach(async function () {
    [admin, timelock, alice, bob] = await ethers.getSigners();

    const BYND = await ethers.getContractFactory("BYND");
    bynd = await BYND.deploy(admin.address, CAP);
    await bynd.waitForDeployment();

    const tge = await nowTs();

    const TeamVesting = await ethers.getContractFactory("BYNDTeamVesting");
    teamVesting = await TeamVesting.deploy(admin.address, await bynd.getAddress(), tge);
    await teamVesting.waitForDeployment();

    const InvestorVesting = await ethers.getContractFactory("BYNDInvestorVesting");
    investorVesting = await InvestorVesting.deploy(admin.address, await bynd.getAddress());
    await investorVesting.waitForDeployment();

    await bynd.grantRole(await bynd.MINTER_ROLE(), await teamVesting.getAddress());
    await bynd.grantRole(await bynd.MINTER_ROLE(), await investorVesting.getAddress());

    // Same TIMELOCK_ROLE-on-a-separate-signer pattern as the emissions
    // tests — keeps "only timelock can..." tests meaningful.
    await teamVesting.connect(admin).grantRole(await teamVesting.TIMELOCK_ROLE(), timelock.address);
    await investorVesting.connect(admin).grantRole(await investorVesting.TIMELOCK_ROLE(), timelock.address);
  });

  describe("BYNDTeamVesting", function () {
    it("deploys with the correct fixed schedule and 10M cap", async function () {
      expect(await teamVesting.TEAM_POOL_CAP()).to.equal(ethers.parseEther("10000000"));
      expect(await teamVesting.CLIFF_DURATION()).to.equal(365 * DAY);
      expect(await teamVesting.VESTING_DURATION()).to.equal(1095 * DAY);
      expect(await teamVesting.remainingCap()).to.equal(ethers.parseEther("10000000"));
    });

    it("(N) 0% is releasable at TGE, nothing releasable before the 12-month cliff, then linear over 36 months", async function () {
      const amount = ethers.parseEther("1000000");
      const tx = await teamVesting.connect(timelock).createTeamGrant(alice.address, amount);
      const receipt = await tx.wait();
      const event = receipt.logs
        .map((l) => teamVesting.interface.parseLog(l))
        .find((e) => e?.name === "GrantCreated");
      const walletAddr = event.args.vestingWallet;

      const wallet = await ethers.getContractAt("VestingWallet", walletAddr);
      const byndAddr = await bynd.getAddress();

      // The grant mints the full amount into the wallet immediately — but
      // NONE of it is releasable yet, which is the actual test of "0%
      // unlocked at TGE": funded in full, liquid in none.
      expect(await bynd.balanceOf(walletAddr)).to.equal(amount);
      expect(await wallet["releasable(address)"](byndAddr)).to.equal(0);

      // Just before the 12-month cliff — still 0.
      await increaseTime(365 * DAY - DAY);
      expect(await wallet["releasable(address)"](byndAddr)).to.equal(0);

      // Just after the cliff — a small amount should now be releasable
      // (linear vesting has begun), but nowhere near the full amount yet.
      await increaseTime(2 * DAY);
      const justAfterCliff = await wallet["releasable(address)"](byndAddr);
      expect(justAfterCliff).to.be.gt(0);
      expect(justAfterCliff).to.be.lt(amount / 100n); // well under 1%

      // Halfway through the 36-month linear window — roughly half vested.
      await increaseTime(Math.floor(1095 * DAY / 2));
      const halfway = await wallet["releasable(address)"](byndAddr);
      expect(halfway).to.be.closeTo(amount / 2n, amount / 50n); // within 2%

      // Fully past cliff + duration — the entire grant is releasable.
      await increaseTime(1095 * DAY);
      expect(await wallet["releasable(address)"](byndAddr)).to.equal(amount);

      // And release() actually pays alice, from her own dedicated wallet.
      await wallet["release(address)"](byndAddr);
      expect(await bynd.balanceOf(alice.address)).to.equal(amount);
    });

    it("cannot exceed the 10M team pool cap, even across multiple grants", async function () {
      await teamVesting.connect(timelock).createTeamGrant(alice.address, ethers.parseEther("6000000"));
      await teamVesting.connect(timelock).createTeamGrant(bob.address, ethers.parseEther("4000000"));
      expect(await teamVesting.remainingCap()).to.equal(0);

      // Index 4, not 3 — getSigners()[3] is `bob`, already used earlier in
      // this same test (his 4M grant), so destructuring to index 3 here
      // was accidentally reusing bob's address and hit "already has a
      // grant" instead of the cap check this test is actually for.
      const [, , , , carol] = await ethers.getSigners();
      await expect(
        teamVesting.connect(timelock).createTeamGrant(carol.address, 1),
      ).to.be.revertedWith("exceeds pool cap");
    });

    it("one grant per beneficiary — a second grant for the same address reverts", async function () {
      await teamVesting.connect(timelock).createTeamGrant(alice.address, ethers.parseEther("1000000"));
      await expect(
        teamVesting.connect(timelock).createTeamGrant(alice.address, ethers.parseEther("1")),
      ).to.be.revertedWith("already has a grant");
    });

    it("only TIMELOCK_ROLE can create a team grant", async function () {
      await expect(
        teamVesting.connect(alice).createTeamGrant(alice.address, ethers.parseEther("1")),
      ).to.be.reverted;
      // ADMIN (DEFAULT_ADMIN_ROLE) alone is not sufficient either.
      await expect(
        teamVesting.connect(admin).createTeamGrant(alice.address, ethers.parseEther("1")),
      ).to.be.reverted;
    });
  });

  describe("BYNDInvestorVesting", function () {
    it("deploys with the correct 10M cap and no fixed schedule", async function () {
      expect(await investorVesting.INVESTOR_POOL_CAP()).to.equal(ethers.parseEther("10000000"));
      expect(await investorVesting.remainingCap()).to.equal(ethers.parseEther("10000000"));
    });

    it("(O) a locked investor allocation cannot be prematurely claimed", async function () {
      const amount = ethers.parseEther("2000000");
      const start = await nowTs();
      const duration = 365 * DAY; // 1 year linear, no cliff, for this test

      const tx = await investorVesting.connect(timelock).createInvestorGrant(
        alice.address, amount, start, duration,
      );
      const receipt = await tx.wait();
      const event = receipt.logs
        .map((l) => investorVesting.interface.parseLog(l))
        .find((e) => e?.name === "GrantCreated");
      const wallet = await ethers.getContractAt("VestingWallet", event.args.vestingWallet);
      const byndAddr = await bynd.getAddress();

      // Immediately after creation — funded in full, but nothing is
      // actually claimable yet (start == now, so effectively 0 elapsed).
      expect(await bynd.balanceOf(event.args.vestingWallet)).to.equal(amount);
      expect(await wallet["releasable(address)"](byndAddr)).to.be.closeTo(0n, amount / 10000n);

      // Attempting to release before meaningful time has passed pays out
      // ~nothing — the allocation is genuinely locked, not just "labeled"
      // as vesting while actually fully claimable.
      await wallet["release(address)"](byndAddr);
      expect(await bynd.balanceOf(alice.address)).to.be.lt(amount / 1000n);
    });

    it("rejects a grant with a duration below the minimum (prevents a near-instant-unlock grant)", async function () {
      const start = await nowTs();
      await expect(
        investorVesting.connect(timelock).createInvestorGrant(
          alice.address, ethers.parseEther("1000000"), start, 1 * DAY,
        ),
      ).to.be.revertedWith("duration below minimum");

      // exact boundary — must succeed
      await expect(
        investorVesting.connect(timelock).createInvestorGrant(
          alice.address, ethers.parseEther("1000000"), start, 180 * DAY,
        ),
      ).to.not.be.reverted;
    });

    it("supports a cliff for investors too, via the same start-in-the-future mechanism as team vesting", async function () {
      const now = await nowTs();
      const cliffStart = now + 180 * DAY; // 6-month cliff
      const duration = 365 * DAY;

      const tx = await investorVesting.connect(timelock).createInvestorGrant(
        bob.address, ethers.parseEther("500000"), cliffStart, duration,
      );
      const receipt = await tx.wait();
      const event = receipt.logs
        .map((l) => investorVesting.interface.parseLog(l))
        .find((e) => e?.name === "GrantCreated");
      const wallet = await ethers.getContractAt("VestingWallet", event.args.vestingWallet);
      const byndAddr = await bynd.getAddress();

      await increaseTime(179 * DAY);
      expect(await wallet["releasable(address)"](byndAddr)).to.equal(0);
    });

    it("cannot exceed the 10M investor pool cap", async function () {
      const start = await nowTs();
      await investorVesting.connect(timelock).createInvestorGrant(
        alice.address, ethers.parseEther("10000000"), start, 365 * DAY,
      );
      expect(await investorVesting.remainingCap()).to.equal(0);
      await expect(
        investorVesting.connect(timelock).createInvestorGrant(bob.address, 1, start, 365 * DAY),
      ).to.be.revertedWith("exceeds pool cap");
    });
  });

  it("team and investor pools draw against completely independent caps", async function () {
    await teamVesting.connect(timelock).createTeamGrant(alice.address, ethers.parseEther("10000000"));
    expect(await teamVesting.remainingCap()).to.equal(0);
    // Investor pool is untouched by the team pool being fully allocated.
    expect(await investorVesting.remainingCap()).to.equal(ethers.parseEther("10000000"));
  });
});
