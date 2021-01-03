import { ethers, upgrades } from "hardhat";
import type { Contract } from 'ethers'
import { timeLockDelay } from '../scripts/constants'

export default async function deployWithTimelockedProxy(
    adminAddress: string,
    contractName: string = "Collateral",
    initializationArguments: any[] = ['0x85Eee30c52B0b379b046Fb0F85F4f3Dc3009aFEC', '0x8dAEBADE922dF735c38C80C7eBD708Af50815fAa', '0x526c08E5532A9308b3fb33b7968eF78a5005d2AC', '0x10B66Bd1e3b5a936B7f8Dbc5976004311037Cdf0'],
    timelockSeconds: number = timeLockDelay
) {
    const Contract = await ethers.getContractFactory(contractName);
    const contract: Contract = await upgrades.deployProxy(Contract, initializationArguments, {
        unsafeAllowCustomTypes: true // Needed to use Deposit.States
    });

    await contract.deployed();

    const Timelock = await ethers.getContractFactory("Timelock");
    const timelockConstructorParameters = [adminAddress, timelockSeconds]
    const timelock: Contract = await Timelock.deploy(...timelockConstructorParameters);
    await timelock.deployed();

    await upgrades.admin.changeProxyAdmin(contract.address, timelock.address);
    return { contract, timelock, timelockConstructorParameters }
}