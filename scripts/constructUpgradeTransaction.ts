import { ethers } from "hardhat";


export default async function(contractAddress:string, newImplementationContractAddress:string, eta:BigInt) {
    const target = contractAddress
    const value = 0;
    // OZ proxies implement custom upgrade calls (https://github.com/OpenZeppelin/openzeppelin-sdk/blob/master/packages/lib/contracts/upgradeability/BaseAdminUpgradeabilityProxy.sol) and EIP-123(https://eips.ethereum.org/EIPS/eip-173) but these functions are only callable by the owner (see "transparent proxies")
    const signature = 'upgradeTo(address)'
    const data = ethers.utils.defaultAbiCoder.encode(['address'], [newImplementationContractAddress]);
    return [target, value, signature, data, eta] as [string, number, string, string, bigint]
}
