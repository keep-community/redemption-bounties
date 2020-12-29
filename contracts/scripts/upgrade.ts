import hre, { ethers, upgrades } from "hardhat";
import constructUpgradeTransaction from './constructUpgradeTransaction'
import {timeLockDelay} from './constants'

// Change these
const COLLATERAL_ADDRESS = "0x..";
const CURRENT_TIMESTAMP = BigInt('10000000')

// And maybe these
const EXTRA_ETA_SECONDS = BigInt(6*3600) // 6 hours

async function main() {
  await hre.run('compile');
  
  const Collateral = await ethers.getContractFactory("Collateral");
  const newImplAddress = await upgrades.prepareUpgrade(COLLATERAL_ADDRESS, Collateral);
  const totalDelay = BigInt(timeLockDelay)+EXTRA_ETA_SECONDS
  const params = constructUpgradeTransaction(COLLATERAL_ADDRESS, newImplAddress, CURRENT_TIMESTAMP+totalDelay)
  console.log(`Contract upgraded, please point the proxy to address ${newImplAddress}`);
  console.log(`To do so, send a transaction to the timelock address calling function 'queueTransaction' with parameters ${params}`)
  console.log(`After ${Number(totalDelay)/3600} hours call 'executeTransaction' with the same parameters to execute the upgrade`)
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
