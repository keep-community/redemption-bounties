import { expect } from "chai";
import deployWithTimelockedProxy from '../scripts/deployWithTimelockedProxy'
import { ethers } from "hardhat";
import type { Contract } from 'ethers'

const TOTAL_TOKENS = 1000;

async function setup() {
    const [owner, addr1] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("FakeKEEPToken");
    const token:Contract = await Token.deploy();
    await token.deployed();
    await token.mint(owner.address, TOTAL_TOKENS);

    const { contract } = await deployWithTimelockedProxy(addr1.address, "Collateral", [token.address]);
    await token.approve(contract.address, TOTAL_TOKENS);
    return {
        token: token,
        collateral: contract
    }
}

describe('Collateral', () => {
    it("snapshot of token addresses", async()=>{
        const [owner] = await ethers.getSigners();
        const { contract } = await deployWithTimelockedProxy(owner.address);
        expect(await contract.keepToken()).to.equal('0x85Eee30c52B0b379b046Fb0F85F4f3Dc3009aFEC')
        expect(await contract.tbtcToken()).to.equal('0x8dAEBADE922dF735c38C80C7eBD708Af50815fAa')
        expect(await contract.vendingMachine()).to.equal('0x526c08E5532A9308b3fb33b7968eF78a5005d2AC')
        expect(await contract.tbtcDepositToken()).to.equal('0x10B66Bd1e3b5a936B7f8Dbc5976004311037Cdf0')
    })
    it("is possible to access keepRewardPerRedemptionLotSize", async () => {
        const {collateral} = await setup()
        const operatorAddress = collateral.address // Any random address would work
        await collateral.addRewarder(operatorAddress, 500, [1, 10], 135);
        expect(await collateral.getKeepRewardPerRedemptionLotSize(0, 1)).to.equal(BigInt(10))
        const UNSET_LOT_SIZE = 2;
        expect(await collateral.getKeepRewardPerRedemptionLotSize(0, UNSET_LOT_SIZE)).to.equal(BigInt(0))
    })
    it("rewarder parameters can be changed", async()=>{

    })
    it("ATTACK: if rewarderIndexes are repeated in redeem() it's impossible to withdraw the same reward multiple times", async()=>{

    })
    it("rewardBalance gets reduced after a redemption", async () => {
        //TODO, requires more mocks
    })
    it("is possible to claim rewards from multiple rewarders for a single redemption", async () => {
        //TODO
    })
})