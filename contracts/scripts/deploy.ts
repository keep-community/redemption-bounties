import hre from "hardhat";
import deployWithTimelockedProxy from './deployWithTimelockedProxy'

// Change
const adminAddress = "0xB27EFd9A7687E8653590B41be65b274488EC0581"

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
