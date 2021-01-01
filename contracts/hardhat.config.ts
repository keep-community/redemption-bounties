import { task } from "hardhat/config";
import type { HardhatUserConfig } from "hardhat/config";
import "@nomiclabs/hardhat-waffle";
import '@openzeppelin/hardhat-upgrades';
import "@nomiclabs/hardhat-etherscan";
import "@nomiclabs/hardhat-web3";

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async (args, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

const config: HardhatUserConfig = {
  solidity: "0.5.17",
  // https://hardhat.org/plugins/nomiclabs-hardhat-etherscan.html
  etherscan: {
    // Your API key for Etherscan
    apiKey: process.env["ETHERSCAN_API_KEY"]
  },
  networks: {
    ropsten: {
      accounts: {
        mnemonic: process.env.MNEMONIC ?? ""
      },
      url: `https://ropsten.infura.io/v3/${process.env.INFURA_API_KEY}`
    }
  }
};

export default config;

