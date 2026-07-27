const { ethers, network } = require("hardhat");
const { whatsabi } = require("@shazow/whatsabi");

// We confirmed via getCode() that this address genuinely has bytecode -- the
// Blockscout "EOA" tag was just indexer lag. Rather than hand-decoding raw
// EVM opcodes (risky, easy to mis-map a jump target and get a wrong function
// name), this uses whatsabi to auto-detect the real ABI from the deployed
// bytecode, cross-referenced against the public 4byte selector database.
//
// Usage:
//   npm install @shazow/whatsabi
//   npx hardhat run scripts/extract-abi.js --network mezotestnet

const BRIBE_CONTRACT = process.env.BRIBE_CONTRACT || "0x79ab1b030CCBa5Dca3f2B10D6a9293A274D99a68";
const GAUGE_ADDRESS = process.env.GAUGE_ADDRESS || "0xb61D510dF1f1aeFc23016C39F5beA213E2f6e173";
const BOOST_VOTER_ADDRESS = process.env.BOOST_VOTER_ADDRESS || "0x21d7bDF5a5929AD179F8cA0c9014A0B62ae6Bfd1";
const VEMEZO_ADDRESS = process.env.VEMEZO_ADDRESS || "0xaCE816CA2bcc9b12C59799dcC5A959Fb9b98111b";

async function extractFor(label, address) {
  console.log("=".repeat(70));
  console.log(`${label}: ${address}`);
  console.log("=".repeat(70));

  const code = await ethers.provider.getCode(address);
  if (code === "0x") {
    console.log("  No bytecode -- genuinely an EOA, skipping.");
    return;
  }
  console.log(`  Bytecode length: ${code.length} chars`);

  // whatsabi's autodiscover pulls in known signatures where it can (requires
  // network access to the 4byte directory for names; falls back to selector
  // hex only if offline).
  const result = await whatsabi.autoload(address, {
    provider: ethers.provider,
    followProxies: true, // if this is a minimal proxy/clone, resolve to the real implementation
    onProgress: (phase) => console.log(`  [whatsabi] ${phase}`),
  }).catch(async (e) => {
    console.log(`  autoload failed (${e.message}), falling back to selectorsFromBytecode`);
    const selectors = whatsabi.selectorsFromBytecode(code);
    return { abi: selectors.map((s) => ({ selector: s, type: "function" })) };
  });

  console.log("\n  Detected ABI / selectors:");
  for (const entry of result.abi) {
    if (entry.type === "function") {
      const sig = entry.name
        ? `${entry.name}(${(entry.inputs || []).map((i) => i.type).join(",")})`
        : `UNKNOWN ${entry.selector}`;
      console.log(`    function ${sig}`);
    } else if (entry.type === "event") {
      const sig = entry.name
        ? `${entry.name}(${(entry.inputs || []).map((i) => i.type).join(",")})`
        : `UNKNOWN event ${entry.hash || ""}`;
      console.log(`    event    ${sig}`);
    }
  }

  console.log("\n  Full ABI JSON (save this if it looks reasonable):");
  console.log(JSON.stringify(result.abi, null, 2));
}

async function main() {
  await extractFor("VEMEZO (need real withdraw/create-lock function names)", VEMEZO_ADDRESS);
  await extractFor("BOOST VOTER (where the vote tx actually needs to go)", BOOST_VOTER_ADDRESS);
  await extractFor("BRIBE / REWARD CONTRACT", BRIBE_CONTRACT);
  await extractFor("GAUGE", GAUGE_ADDRESS);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
