import hre from "hardhat";
import deployWithTimelockedProxy from './deployWithTimelockedProxy'
import {timeLockDelay} from './constants'

// Change
const adminAddress = "0x..."

async function main() {
  await hre.run('compile');

  const {contract, timelock} = await deployWithTimelockedProxy(adminAddress)
  console.log(`Collateral deployed to ${contract.address} and timelock/owner to ${timelock.address}`);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
