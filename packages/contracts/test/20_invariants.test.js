const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployAll, mintAndDeposit, setupSingleGauge } = require("./fixtures");
const { jumpInsideVoteWindow } = require("./epochTime");

/**
 * Phase 6 — the protocol-level invariants, stated in the form that is actually
 * true.
 *
 * Two of the invariants in the remediation plan were written down wrong, and
 * this file is where they get corrected, because it is the artefact an auditor
 * reads to learn what the protocol claims about itself. A false claim here
 * costs more than no claim: it sends the audit hunting for a defect that is
 * really intended behaviour.
 *
 *  - "totalSupply(veBYND) == SUM(lock.amount)" is FALSE, and stops being true
 *    the first time a rebase lands. veBYND is minted once, at deposit, against
 *    the lock size AT THAT MOMENT. Rebases then compound into the veMEZO locks
 *    without minting anything. The equality that holds is against the
 *    deposit-time amounts; against current amounts it is an inequality.
 *
 *  - "vault.getAllTokenIds() SUBSET-OF voter.getManagedTokenIds()" is FALSE in
 *    general. Registration is deliberately swallowed on the deposit path — a
 *    deposit must not fail because the voter's bookkeeping did — so the vault
 *    can custody a token the voter has never heard of. The invariant holds
 *    only while no VoterCallFailed has been emitted, and that event is the
 *    entire detection mechanism (BYND-09).
 *
 * The other two here are the ones worth stating unconditionally: solvency, and
 * four-way conservation of harvested value.
 *
 * Regressions for plan invariants 5, 6 and 7 are not repeated here — they live
 * with the fixes they guard: BYND-02 in 18_vault_batching, BYND-05 in
 * 17_carry_accounting, and the BYND-03 atomic-snipe check in
 * 07_economic_invariants.
 */
describe("Protocol invariants", () => {
  let ctx;
  beforeEach(async () => {
    ctx = await deployAll();
  });

  const eth = (n) => ethers.parseEther(String(n));

  async function seedBribe(bribe, token, amount) {
    const { boostVoter, deployer } = ctx;
    await token.mint(deployer.address, amount);
    await token.connect(deployer).approve(await boostVoter.getAddress(), amount);
    await boostVoter.connect(deployer).seedBribe(bribe, amount);
  }

  async function stake(user, amount) {
    const { staking, veBYND, deployer } = ctx;
    const role = await veBYND.MINTER_ROLE();
    if (!(await veBYND.hasRole(role, deployer.address))) {
      await veBYND.grantRole(role, deployer.address);
    }
    await veBYND.mint(user.address, amount);
    await veBYND.connect(user).approve(await staking.getAddress(), amount);
    await staking.connect(user).stake(amount);
  }

  async function runEpoch() {
    const { voter } = ctx;
    await jumpInsideVoteWindow(voter);
    await voter.optimiseAndVote();
    await voter.claimBribesBatch(200);
    await voter.harvestAndDistribute();
  }

  // -------------------------------------------------------------------------

  describe("Invariant 1 — veBYND is minted against deposit-time lock size", () => {
    it("mints exactly the lock amount, and never re-mints when the lock grows", async () => {
      const { vault, veBYND, veMEZO, alice, bob } = ctx;

      const first = await mintAndDeposit(ctx, alice);
      await mintAndDeposit(ctx, bob);

      // MockVeMEZO mints 1000e18 locks. Two deposits, two mints, no rounding.
      expect(await veBYND.totalSupply()).to.equal(eth(2000));
      expect(await veBYND.balanceOf(alice.address)).to.equal(eth(1000));
      expect(await veBYND.balanceOf(bob.address)).to.equal(eth(1000));

      // Bob's NFT merged into the canonical lock, so the vault now custodies
      // one token holding both deposits. The supply is unchanged by the merge.
      expect(await vault.totalDeposited()).to.equal(1);
      expect(await vault.totalLockedMEZO()).to.equal(eth(2000));

      // A rebase compounds into the lock. This is the exact point where the
      // naive equality breaks: locked MEZO grows, veBYND does not.
      await veMEZO.depositFor(first, eth(150));

      expect(await veBYND.totalSupply()).to.equal(eth(2000));
      expect(await vault.totalLockedMEZO()).to.equal(eth(2150));
      expect(await vault.totalLockedMEZO()).to.not.equal(await veBYND.totalSupply());
    });

    it("keeps the claim on the vault proportional to what was deposited", async () => {
      const { veBYND, veMEZO, alice, bob } = ctx;

      const first = await mintAndDeposit(ctx, alice);
      await mintAndDeposit(ctx, bob);
      await veMEZO.depositFor(first, eth(500));

      // Rebase accrues to the pool, not to whoever happened to deposit the
      // NFT that physically holds it. Both depositors still hold half.
      const supply = await veBYND.totalSupply();
      expect(await veBYND.balanceOf(alice.address)).to.equal(supply / 2n);
      expect(await veBYND.balanceOf(bob.address)).to.equal(supply / 2n);
    });
  });

  // -------------------------------------------------------------------------

  describe("Invariant 2 — solvency", () => {
    /**
     * SUM(lock.amount over managed tokens) >= totalSupply(veBYND).
     *
     * This is the invariant that decides whether BYND-07 was a Critical or a
     * non-issue. On Matsnet it holds with a 616.12 MEZO surplus: 1446.12
     * locked against 830 minted, with zero ERC-20 and zero native balance
     * loose in the vault. The surplus is accrued rebase and only grows.
     */
    async function assertSolvent() {
      const { vault, veBYND } = ctx;
      const locked = await vault.totalLockedMEZO();
      const minted = await veBYND.totalSupply();
      expect(locked).to.be.gte(minted);
      return locked - minted;
    }

    it("holds on an empty vault, and at equality immediately after deposits", async () => {
      expect(await assertSolvent()).to.equal(0);

      await mintAndDeposit(ctx, ctx.alice);
      expect(await assertSolvent()).to.equal(0);

      await mintAndDeposit(ctx, ctx.bob);
      expect(await assertSolvent()).to.equal(0);
    });

    it("holds with a surplus once rebases accrue, and the surplus only grows", async () => {
      const { veMEZO, alice } = ctx;
      const canonical = await mintAndDeposit(ctx, alice);

      await veMEZO.depositFor(canonical, eth(100));
      expect(await assertSolvent()).to.equal(eth(100));

      await veMEZO.depositFor(canonical, eth(37));
      expect(await assertSolvent()).to.equal(eth(137));

      // A further deposit mints against its own lock, so it adds to both sides
      // equally and leaves the surplus where it was.
      await mintAndDeposit(ctx, ctx.bob);
      expect(await assertSolvent()).to.equal(eth(137));
    });

    it("survives a straggler being consolidated by retryMerge", async () => {
      const { vault, veMEZO, alice, bob } = ctx;
      await mintAndDeposit(ctx, alice);

      // Force bob's deposit to stay a separate NFT.
      const tx = await veMEZO.mint(bob.address, 0);
      const receipt = await tx.wait();
      let straggler;
      for (const log of receipt.logs) {
        try {
          const parsed = veMEZO.interface.parseLog(log);
          if (parsed && parsed.name === "Transfer") {
            straggler = parsed.args[2];
            break;
          }
        } catch (_) {}
      }
      await veMEZO.setVotedForTest(straggler, true);
      await veMEZO.connect(bob).approve(await vault.getAddress(), straggler);
      await vault.connect(bob).deposit(straggler);

      expect(await vault.totalDeposited()).to.equal(2);
      expect(await assertSolvent()).to.equal(0);

      // Consolidation moves value between locks the vault already owns. It
      // must not change either side of the inequality.
      await veMEZO.setVotedForTest(straggler, false);
      await vault.retryMerge(straggler);

      expect(await vault.totalDeposited()).to.equal(1);
      expect(await assertSolvent()).to.equal(0);
      expect(await vault.totalLockedMEZO()).to.equal(eth(2000));
    });
  });

  // -------------------------------------------------------------------------

  describe("Invariant 3 — four-way conservation of harvested value", () => {
    /**
     * Every unit claimed from a bribe contract lands in exactly one of
     * {treasury, keepers, staking, carried}. Nothing sticks to the voter
     * beyond what its own books say is carried, and nothing is left behind in
     * the bribe contract.
     *
     * The voter has no sweep function, so any unit that ends up in it without
     * a matching carriedOver/carriedOverNet entry is permanently unrecoverable
     * — which is precisely what BYND-05 was.
     */
    async function conservation(token) {
      const { voter, staking, treasury, deployer, boostVoter } = ctx;
      const addr = await token.getAddress();
      const retained = await token.balanceOf(await voter.getAddress());
      return {
        treasury: await token.balanceOf(treasury.address),
        // deployer runs optimiseAndVote and harvestAndDistribute, so it holds
        // keeper slots 2 and 3; slots 0, 1 and 4 fall back to the treasury.
        keepers: await token.balanceOf(deployer.address),
        staking: await token.balanceOf(await staking.getAddress()),
        retained,
        booked:
          (await voter.carriedOver(addr)) + (await voter.carriedOverNet(addr)),
        upstream: await token.balanceOf(await boostVoter.getAddress()),
      };
    }

    it("splits a cleared harvest across the four legs with nothing left over", async () => {
      const { voter, rewardTokenA, deployer, alice } = ctx;
      const { bribe } = await setupSingleGauge(ctx, rewardTokenA);
      await voter.connect(deployer).setManagedTokenId(1);
      await voter.connect(deployer).setProtocolFeeBps(500); // exercise the treasury leg

      await stake(alice, eth(10));
      await seedBribe(bribe, rewardTokenA, eth(1000));
      await runEpoch();

      const c = await conservation(rewardTokenA);

      // 1000 gross -> 5% fee = 50; 950 after fee -> 1% bounty = 9.5 split five
      // ways (1.9 each: treasury takes slots 0, 1, 4 = 5.7, deployer takes
      // slots 2, 3 = 3.8); stakers get the remaining 940.5.
      expect(c.treasury).to.equal(eth(55.7));
      expect(c.keepers).to.equal(eth(3.8));
      expect(c.staking).to.equal(eth(940.5));
      expect(c.retained).to.equal(0);

      expect(c.treasury + c.keepers + c.staking + c.retained).to.equal(eth(1000));
      expect(c.upstream).to.equal(0);
      expect(await rewardTokenA.totalSupply()).to.equal(eth(1000));
    });

    it("conserves value across a carry, and the voter holds exactly what its books claim", async () => {
      const { voter, rewardTokenA, deployer, alice } = ctx;
      const { bribe } = await setupSingleGauge(ctx, rewardTokenA);
      await voter.connect(deployer).setManagedTokenId(1);
      await voter.connect(deployer).setMinHarvestThreshold(eth(2000));

      await stake(alice, eth(10));
      await seedBribe(bribe, rewardTokenA, eth(1000));
      await runEpoch();

      // Below threshold: nothing paid out, everything carried untaxed.
      let c = await conservation(rewardTokenA);
      expect(c.treasury + c.keepers + c.staking).to.equal(0);
      expect(c.retained).to.equal(eth(1000));
      expect(c.booked).to.equal(c.retained);
      expect(c.retained + c.treasury + c.keepers + c.staking).to.equal(eth(1000));

      // Second epoch clears it: 2000 combined is at the threshold.
      await seedBribe(bribe, rewardTokenA, eth(1000));
      await runEpoch();

      c = await conservation(rewardTokenA);
      expect(c.retained).to.equal(0);
      expect(c.booked).to.equal(0);
      expect(c.treasury + c.keepers + c.staking).to.equal(eth(2000));
      expect(c.upstream).to.equal(0);
      expect(await rewardTokenA.totalSupply()).to.equal(eth(2000));
    });

    it("conserves value when the staker share is deferred and cleared later", async () => {
      const { voter, rewardTokenA, deployer, alice } = ctx;
      const { bribe } = await setupSingleGauge(ctx, rewardTokenA);
      await voter.connect(deployer).setManagedTokenId(1);

      // Nobody staked: the post-bounty share defers into carriedOverNet.
      await seedBribe(bribe, rewardTokenA, eth(1000));
      await runEpoch();

      let c = await conservation(rewardTokenA);
      expect(c.staking).to.equal(0);
      expect(c.retained).to.equal(eth(990));
      expect(c.booked).to.equal(c.retained);
      expect(c.treasury + c.keepers + c.staking + c.retained).to.equal(eth(1000));

      // A staker arrives; the deferred share passes through whole.
      await stake(alice, eth(10));
      await runEpoch();

      c = await conservation(rewardTokenA);
      expect(c.retained).to.equal(0);
      expect(c.booked).to.equal(0);
      expect(c.treasury + c.keepers + c.staking).to.equal(eth(1000));
    });

    it("conserves value when forceCloseEpoch banks instead of distributing", async () => {
      const { voter, rewardTokenA, deployer } = ctx;
      const { bribe } = await setupSingleGauge(ctx, rewardTokenA);
      await voter.connect(deployer).setManagedTokenId(1);

      await seedBribe(bribe, rewardTokenA, eth(1000));
      await jumpInsideVoteWindow(voter);
      await voter.optimiseAndVote();
      await voter.claimBribesBatch(200);

      // Governance closes the epoch without harvesting. The claimed value is
      // banked untaxed rather than paid out or lost.
      await voter.connect(deployer).forceCloseEpoch();

      const c = await conservation(rewardTokenA);
      expect(c.treasury + c.keepers + c.staking).to.equal(0);
      expect(c.retained).to.equal(eth(1000));
      expect(c.booked).to.equal(c.retained);
      expect(c.upstream).to.equal(0);
    });
  });

  // -------------------------------------------------------------------------

  describe("Invariant 4 — vault holdings are registered with the voter", () => {
    /**
     * Conditional, not absolute: it holds exactly while no VoterCallFailed has
     * been emitted. Registration is swallowed by design on the deposit path,
     * so the event is the only thing standing between a swallowed failure and
     * a token the vault custodies but the voter can never vote with.
     */
    async function assertRegistered() {
      const { vault, voter } = ctx;
      const held = (await vault.getAllTokenIds()).map(String);
      const managed = new Set((await voter.getManagedTokenIds()).map(String));
      const missing = held.filter((id) => !managed.has(id));
      expect(missing, `unregistered vault tokens: ${missing.join(", ")}`).to.deep.equal([]);
      return { held, managed };
    }

    it("holds through deposits, merges and stragglers", async () => {
      const { vault, veMEZO, alice, bob, carol } = ctx;

      await mintAndDeposit(ctx, alice);
      await assertRegistered();

      // A merged deposit leaves nothing new to register.
      await mintAndDeposit(ctx, bob);
      let state = await assertRegistered();
      expect(state.held.length).to.equal(1);

      // A straggler does, and must be picked up.
      const tx = await veMEZO.mint(carol.address, 0);
      const receipt = await tx.wait();
      let straggler;
      for (const log of receipt.logs) {
        try {
          const parsed = veMEZO.interface.parseLog(log);
          if (parsed && parsed.name === "Transfer") {
            straggler = parsed.args[2];
            break;
          }
        } catch (_) {}
      }
      await veMEZO.setVotedForTest(straggler, true);
      await veMEZO.connect(carol).approve(await vault.getAddress(), straggler);
      await vault.connect(carol).deposit(straggler);

      state = await assertRegistered();
      expect(state.held.length).to.equal(2);
      expect(state.managed.has(String(straggler))).to.equal(true);
    });

    it("survives retryMerge deregistering a token on both sides at once", async () => {
      const { vault, veMEZO, alice, bob } = ctx;
      await mintAndDeposit(ctx, alice);

      const tx = await veMEZO.mint(bob.address, 0);
      const receipt = await tx.wait();
      let straggler;
      for (const log of receipt.logs) {
        try {
          const parsed = veMEZO.interface.parseLog(log);
          if (parsed && parsed.name === "Transfer") {
            straggler = parsed.args[2];
            break;
          }
        } catch (_) {}
      }
      await veMEZO.setVotedForTest(straggler, true);
      await veMEZO.connect(bob).approve(await vault.getAddress(), straggler);
      await vault.connect(bob).deposit(straggler);
      await assertRegistered();

      await veMEZO.setVotedForTest(straggler, false);
      await vault.retryMerge(straggler);

      // The token is gone from the vault; it must also be gone from the voter,
      // or the voter votes with an NFT that no longer exists.
      const state = await assertRegistered();
      expect(state.held).to.not.include(String(straggler));
      expect(state.managed.has(String(straggler))).to.equal(false);
    });

    it("breaks only where a VoterCallFailed marks the divergence", async () => {
      const { vault, voter, veMEZO, deployer, alice } = ctx;
      await mintAndDeposit(ctx, alice);
      await assertRegistered();

      // Point the voter at a different vault so registration is rejected.
      await voter.connect(deployer).setVault(deployer.address);

      const tx = await veMEZO.mint(alice.address, 0);
      const receipt = await tx.wait();
      let orphan;
      for (const log of receipt.logs) {
        try {
          const parsed = veMEZO.interface.parseLog(log);
          if (parsed && parsed.name === "Transfer") {
            orphan = parsed.args[2];
            break;
          }
        } catch (_) {}
      }
      await veMEZO.setVotedForTest(orphan, true);
      await veMEZO.connect(alice).approve(await vault.getAddress(), orphan);

      // The deposit still succeeds — bookkeeping must never block one — but the
      // divergence is announced rather than silent.
      await expect(vault.connect(alice).deposit(orphan))
        .to.emit(vault, "VoterCallFailed")
        .withArgs(voter.interface.getFunction("addManagedTokenId").selector, orphan);

      // The invariant is now genuinely broken: the vault custodies a token the
      // voter cannot vote with. Stating it as unconditional would have made
      // this look like a contract defect rather than the documented tradeoff.
      const held = (await vault.getAllTokenIds()).map(String);
      const managed = new Set((await voter.getManagedTokenIds()).map(String));
      expect(held).to.include(String(orphan));
      expect(managed.has(String(orphan))).to.equal(false);
    });
  });
});
