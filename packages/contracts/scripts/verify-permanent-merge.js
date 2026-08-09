const { ethers } = require("hardhat");

// BYND-01 verification.
//
// The finding says permanent-lock veMEZO can never merge, so every such deposit
// becomes a permanent straggler and breaks the vault's O(1) design. But that
// rests entirely on MockVeMEZO's preconditions:
//
//   require(!_voted[_from],              "MockVeMEZO: already voted");
//   require(!_locked[_from].isPermanent, "MockVeMEZO: permanent lock");
//
// All 5 NFTs the vault holds are isPermanent=false, so the real veMEZO has
// NEVER been asked to merge a permanent lock. The mock may not be faithful.
// Guarding deposits on an unverified premise would exclude the strongest
// depositors the protocol can have, so settle it empirically first.
//
// Everything here is read-only: staticcall / eth_call only, no state written.

const VEMEZO = "0xaCE816CA2bcc9b12C59799dcC5A959Fb9b98111b";
const VAULT = "0xb7B1CD5c9D6d3deDE64F3c803826f6B6150a2B6C";

const VEMEZO_ABI = [
  "function locked(uint256) view returns (int128 amount, uint256 end, bool isPermanent)",
  "function ownerOf(uint256) view returns (address)",
  "function totalSupply() view returns (uint256)",
  "function merge(uint256 _from, uint256 _to)",
  "function voted(uint256) view returns (bool)",
];

// Candidate signatures for creating/converting to a permanent lock. Presence
// tells us whether permanent locks are reachable by users at all -- if veMEZO
// exposes no way to make one, BYND-01 is unreachable regardless of merge().
const PERMANENT_API = [
  "function lockPermanent(uint256 _tokenId)",
  "function createLockPermanent(uint256 _value)",
  "function unlockPermanent(uint256 _tokenId)",
  "function createLock(uint256 _value, uint256 _lockDuration)",
  "function MAXTIME() view returns (uint256)",
  "function MINTIME() view returns (uint256)",
  "function MIN_LOCK_AMOUNT() view returns (uint256)",
  "function minLockAmount() view returns (uint256)",
];

async function main() {
  const provider = ethers.provider;
  const ve = await ethers.getContractAt(VEMEZO_ABI, VEMEZO);

  console.log("=".repeat(70));
  console.log("BYND-01 -- can permanent locks merge on the REAL veMEZO?");
  console.log("=".repeat(70));

  // 1. Which permanent-lock API actually exists on this contract? A selector
  //    that is absent means users cannot create that state in the first place.
  console.log("\n1. Permanent-lock API surface");
  console.log("-".repeat(70));
  const code = await provider.getCode(VEMEZO);
  for (const sig of PERMANENT_API) {
    const frag = ethers.FunctionFragment.from(sig.replace("function ", ""));
    const sel = ethers.id(frag.format("sighash")).slice(0, 10);
    // Selector presence in bytecode is a heuristic, not proof -- a proxy may
    // dispatch elsewhere -- so also try calling the view ones.
    const present = code.includes(sel.slice(2));
    let extra = "";
    if (frag.stateMutability === "view" && frag.inputs.length === 0) {
      try {
        const c = new ethers.Contract(VEMEZO, [sig], provider);
        const v = await c[frag.name]();
        extra = `  => ${v}`;
      } catch {
        extra = "  => (call reverted)";
      }
    }
    console.log(`  ${present ? "PRESENT" : "absent "}  ${sel}  ${frag.name}${extra}`);
  }

  // 2. Are there ANY permanent locks in existence? If the answer is no across
  //    the whole supply, the straggler path has never been triggerable.
  console.log("\n2. Scanning existing tokenIds for isPermanent == true");
  console.log("-".repeat(70));
  let total = 0n;
  try {
    total = await ve.totalSupply();
    console.log(`  veMEZO totalSupply: ${total}`);
  } catch {
    console.log("  totalSupply() reverted -- scanning a fixed range instead");
    total = 900n;
  }

  const scanMax = total > 900n ? 900n : total;
  const permanent = [];
  const nonPermanent = [];
  let alive = 0;
  for (let id = 1n; id <= scanMax; id++) {
    try {
      const l = await ve.locked(id);
      if (l[0] === 0n) continue; // burned or empty
      alive++;
      (l[2] ? permanent : nonPermanent).push(id);
    } catch {
      /* nonexistent tokenId */
    }
  }
  console.log(`  live locks found : ${alive}`);
  console.log(`  isPermanent=true : ${permanent.length}`);
  console.log(`  isPermanent=false: ${nonPermanent.length}`);
  if (permanent.length) {
    console.log(`  permanent tokenIds: ${permanent.slice(0, 20).join(", ")}`);
  }

  // 3. The decisive test: staticcall merge() with a permanent _from. We are not
  //    the owner, so an ownership/approval revert is EXPECTED and tells us
  //    nothing. What matters is whether we can observe a permanence-specific
  //    revert reason. Run the same probe with a non-permanent _from as a
  //    control -- if both produce the identical error, the error is about
  //    ownership and the permanence question is unanswered by this method.
  console.log("\n3. staticcall merge() -- permanent vs non-permanent _from");
  console.log("-".repeat(70));

  async function probeMerge(from, to, label) {
    try {
      await ve.merge.staticCall(from, to);
      console.log(`  ${label}: NO REVERT (would succeed)`);
      return "success";
    } catch (e) {
      const reason = e.reason || e.shortMessage || e.message.split("\n")[0];
      console.log(`  ${label}: reverted -- ${reason}`);
      return reason;
    }
  }

  const canonical = 860n;
  let permResult = null;
  let ctrlResult = null;

  if (permanent.length) {
    permResult = await probeMerge(permanent[0], canonical, `permanent  _from=${permanent[0]}`);
  } else {
    console.log("  (no permanent locks exist to probe)");
  }
  if (nonPermanent.length) {
    const ctrl = nonPermanent.find((i) => i !== canonical) ?? nonPermanent[0];
    ctrlResult = await probeMerge(ctrl, canonical, `control    _from=${ctrl}`);
  }

  // 4. Verdict
  console.log("\n" + "=".repeat(70));
  console.log("VERDICT");
  console.log("=".repeat(70));

  if (!permanent.length) {
    console.log("No permanent locks exist on this network, so the merge path has");
    console.log("never been exercised and cannot be settled by observation alone.");
    console.log("");
    console.log("Decide on API surface instead: if lockPermanent/createLockPermanent");
    console.log("are absent above, users cannot create permanent locks and BYND-01 is");
    console.log("UNREACHABLE -> ship retryMerge only.");
    console.log("If they are PRESENT, treat BYND-01 as confirmed (the plan's");
    console.log("'inconclusive' branch) -> add the deposit guard, which is cheap and");
    console.log("reversible, plus retryMerge.");
  } else if (permResult === ctrlResult) {
    console.log("Permanent and non-permanent _from produce the SAME revert, so the");
    console.log("error is about ownership/approval, not permanence. Inconclusive ->");
    console.log("treat BYND-01 as confirmed per the plan.");
  } else {
    console.log("Permanent and non-permanent _from revert DIFFERENTLY:");
    console.log(`  permanent : ${permResult}`);
    console.log(`  control   : ${ctrlResult}`);
    console.log("That asymmetry is evidence the permanence check is real ->");
    console.log("BYND-01 CONFIRMED. Add the deposit guard + retryMerge.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
