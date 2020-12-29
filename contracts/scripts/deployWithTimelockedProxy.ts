import { ethers, upgrades } from "hardhat";

export default async function deployWithTimelockedProxy(contractName: string, adminAddress: string, timelockSeconds: number, initializationArguments:any[]) {
    const Contract = await ethers.getContractFactory(contractName);
    const contract = await upgrades.deployProxy(Contract, initializationArguments, {
        unsafeAllowCustomTypes: true // Needed to use Deposit.States
    });

    await contract.deployed();

    const Timelock = await ethers.getContractFactory("Timelock");
    const timelock = await Timelock.deploy(adminAddress, timelockSeconds);
    await timelock.deployed();

    await upgrades.admin.changeProxyAdmin(contract.address, timelock.address);
    return {contract, timelock}
}