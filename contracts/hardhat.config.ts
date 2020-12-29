import { task } from "hardhat/config";
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

export default {
  solidity: "0.5.17",
  // https://hardhat.org/plugins/nomiclabs-hardhat-etherscan.html
  etherscan: {
    // Your API key for Etherscan
    apiKey: process.env["ETHERSCAN_API_KEY"]
  }
};

