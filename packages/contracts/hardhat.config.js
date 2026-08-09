require("@nomicfoundation/hardhat-toolbox");
require("@openzeppelin/hardhat-upgrades");
require("dotenv").config();

const MATSNET_RPC_URL = process.env.MATSNET_RPC_URL || "https://rpc.test.mezo.org";
const MEZO_MAINNET_RPC_URL =
  process.env.MEZO_MAINNET_RPC_URL || "https://mezo-mainnet.boar.network";
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
// Mainnet deploys sign with their own key, never the testnet deployer. If it is
// unset the network still resolves (so read-only tasks and `hardhat verify`
// work) but has no signer, so any deploy fails loudly instead of silently
// falling back to the testnet wallet.
const MAINNET_DEPLOYER_PRIVATE_KEY = process.env.MAINNET_DEPLOYER_PRIVATE_KEY;

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      // Lowered from 200 -> 20. ByNdVoter.sol is currently 260 bytes over
      // the EIP-170 24576-byte deployment size limit (confirmed by the
      // compiler warning, and NOT caught by `npx hardhat test` since the
      // local hardhat network has allowUnlimitedContractSize: true below —
      // mezotestnet and any real mainnet config have no such override, so
      // this would genuinely fail to deploy there as-is).
      //
      // `runs` trades deployment size against per-call runtime gas: a LOW
      // value (like 20) optimizes for a small deployed contract at the cost
      // of slightly higher gas per transaction; a HIGH value (like the
      // previous 200) does the opposite. Since we're over the hard
      // deployment-size limit, size has to win here — a contract that costs
      // a bit more gas per call is fine; a contract that can't deploy at
      // all is not.
      optimizer: { enabled: true, runs: 20 },
      evmVersion: "london",
    },
  },
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true,
    },
    mezotestnet: {
      url: MATSNET_RPC_URL,
      chainId: 31611,
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
    },
    // Mezo mainnet. Note there is no allowUnlimitedContractSize here — the
    // EIP-170 24576-byte limit is real on this network, which is the whole
    // reason for `runs: 20` and the GaugeScan external library above.
    mezomainnet: {
      url: MEZO_MAINNET_RPC_URL,
      chainId: 31612,
      accounts: MAINNET_DEPLOYER_PRIVATE_KEY ? [MAINNET_DEPLOYER_PRIVATE_KEY] : [],
    },
  },
  etherscan: {
    apiKey: {
      mezotestnet: "not-needed-for-blockscout",
      mezomainnet: "not-needed-for-blockscout",
    },
    customChains: [
      {
        network: "mezotestnet",
        chainId: 31611,
        urls: {
          apiURL: "https://api.explorer.test.mezo.org/api",
          browserURL: "https://explorer.test.mezo.org",
        },
      },
      {
        network: "mezomainnet",
        chainId: 31612,
        urls: {
          apiURL: "https://api.explorer.mezo.org/api",
          browserURL: "https://explorer.mezo.org",
        },
      },
    ],
  },
};