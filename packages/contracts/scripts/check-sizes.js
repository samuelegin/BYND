// EIP-170 size gate (BYND-13).
//
// `npx hardhat test` CANNOT catch a contract that is too large to deploy: the
// in-process `hardhat` network sets allowUnlimitedContractSize: true, so the
// full suite passes green on an implementation that would revert on a real
// chain. This script is the check that actually holds the line.
//
// Usage:
//   npx hardhat run scripts/check-sizes.js
//
// Exits non-zero if any deployable contract exceeds the limit, so it can be
// wired into `pnpm test` as a gate.

const fs = require("fs");
const path = require("path");

const LIMIT = 24576;

// Contracts that actually get deployed on a real network. Mocks and test
// helpers are excluded — they only ever run against the hardhat network, where
// the limit is lifted.
const DEPLOYABLE = [
  ["ByNdVoter.sol", "ByNdVoter"],
  ["ByNdVoter.sol", "GaugeScan"],
  ["ByNdVoter.sol", "HarvestLib"],
  ["ByNdVault.sol", "ByNdVault"],
  ["ByNdStaking.sol", "ByNdStaking"],
  ["VeBYND.sol", "VeBYND"],
];

function main() {
  const root = path.join(__dirname, "..", "artifacts", "contracts");
  let worst = null;
  let failed = false;
  const missing = [];
  const oversize = [];

  console.log(`EIP-170 limit: ${LIMIT} bytes\n`);
  console.log("contract".padEnd(14) + "size".padStart(7) + "headroom".padStart(11));
  console.log("-".repeat(32));

  for (const [file, name] of DEPLOYABLE) {
    const p = path.join(root, file, `${name}.json`);
    if (!fs.existsSync(p)) {
      // A missing artifact fails the gate rather than being skipped. Skipping
      // would mean a renamed or moved contract silently stops being measured,
      // and a gate that quietly checks nothing is worse than no gate — it
      // reports OK on exactly the change that needed catching.
      console.log(`${name.padEnd(14)}${"(NO ARTIFACT)".padStart(18)}`);
      missing.push(`${file}:${name}`);
      failed = true;
      continue;
    }
    const artifact = JSON.parse(fs.readFileSync(p, "utf8"));
    // deployedBytecode is the runtime code, which is what EIP-170 measures —
    // not `bytecode`, which includes the constructor/init code.
    const size = (artifact.deployedBytecode.length - 2) / 2;
    const headroom = LIMIT - size;
    const flag = headroom < 0 ? "  OVER LIMIT" : headroom < 1024 ? "  tight" : "";
    console.log(
      name.padEnd(14) +
        String(size).padStart(7) +
        String(headroom).padStart(11) +
        flag
    );
    if (headroom < 0) {
      failed = true;
      oversize.push(`${name} by ${-headroom} bytes`);
    }
    if (!worst || headroom < worst.headroom) worst = { name, headroom };
  }

  console.log("-".repeat(32));
  if (worst) {
    console.log(`Tightest: ${worst.name} with ${worst.headroom} bytes spare.`);
  }

  if (failed) {
    if (oversize.length) {
      console.error(
        `\nFAIL: over EIP-170 and undeployable: ${oversize.join(", ")}. ` +
          "The test suite will NOT catch this — the hardhat network sets " +
          "allowUnlimitedContractSize, so the full suite passes green on a " +
          "contract that reverts on deployment to a real chain."
      );
    }
    if (missing.length) {
      console.error(
        `\nFAIL: no compiled artifact for ${missing.join(", ")}. ` +
          "Run `npx hardhat compile`; if the contract was renamed or removed, " +
          "update DEPLOYABLE in this script so the gate keeps measuring it."
      );
    }
    process.exitCode = 1;
  } else {
    console.log("\nOK: every deployable contract fits under EIP-170.");
  }
}

main();
