import hre from "hardhat";
import deployWithTimelockedProxy from './deployWithTimelockedProxy'

// Change
const adminAddress = "0xB27EFd9A7687E8653590B41be65b274488EC0581"

async function main() {
  await hre.run('compile');

  const {contract, timelock, timelockConstructorParameters} = await deployWithTimelockedProxy(adminAddress)
  console.log(`Collateral deployed to ${contract.address}`);
  console.log(`Verify it on etherscan by running 'multisol contracts/Collateral.sol' and then uploading the contracts on etherscan through multi-part verification`)
  console.log(`Then verify the proxy by going to https://etherscan.io/address/${contract.address}#code and following this guide https://medium.com/etherscan-blog/and-finally-proxy-contract-support-on-etherscan-693e3da0714b`)
  console.log(`Timelock was deployed at address ${timelock.address} with the following constructor parameters: ${timelockConstructorParameters}`)
  console.log(`Verify it on etherscan with 'npx hardhat verify --network NETWORK ${timelock.address} ${timelockConstructorParameters.join(' ')}'`)
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
