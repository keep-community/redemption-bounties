import { ethers, upgrades } from "hardhat";
import type { Contract } from 'ethers'
import { timeLockDelay } from '../scripts/constants'

export default async function deployWithTimelockedProxy(
    adminAddress: string,
    contractName: string = "Collateral",
    initializationArguments: any[] = ['0x85Eee30c52B0b379b046Fb0F85F4f3Dc3009aFEC'],
    timelockSeconds: number = timeLockDelay
) {
    const Contract = await ethers.getContractFactory(contractName);
    const contract: Contract = await upgrades.deployProxy(Contract, initializationArguments, {
        unsafeAllowCustomTypes: true // Needed to use Deposit.States
    });

    await contract.deployed();

    const Timelock = await ethers.getContractFactory("Timelock");
    const timelock: Contract = await Timelock.deploy(adminAddress, timelockSeconds);
    await timelock.deployed();

    await upgrades.admin.changeProxyAdmin(contract.address, timelock.address);
    return { contract, timelock }
}