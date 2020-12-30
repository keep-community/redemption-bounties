import { expect } from "chai";
import deployWithTimelockedProxy from '../scripts/deployWithTimelockedProxy'
import { ethers } from "hardhat";
import type { Contract } from 'ethers'
import {deployMockContract} from '@ethereum-waffle/mock-contract';
import DepositContract from '../artifacts/@keep-network/tbtc/contracts/deposit/Deposit.sol/Deposit.json'
import VendingMachineContract from '../artifacts/@keep-network/tbtc/contracts/system/VendingMachine.sol/VendingMachine.json'
import DepositTokenContract from '../artifacts/@keep-network/tbtc/contracts/system/TBTCDepositToken.sol/TBTCDepositToken.json'
import BondedKeepContract from '../artifacts/@keep-network/keep-ecdsa/contracts/BondedECDSAKeep.sol/BondedECDSAKeep.json'

const TOTAL_KEEP_TOKENS = 1000;
const TOTAL_TBTC_TOKENS = 500;
const SAMPLE_LOT_SIZE = '10000000000000000' // For a 0.01 tBTC deposit
const OPERATOR_ADDRESS = '0x0f5c422328cba4421361a6aed428acaf7bab9046' // Random staker
const SECOND_OPERATOR_ADDRESS = '0xc010b84528b0809295fcd21cb37415e8c532343a' // Random staker
const TBTC_REDEMPTION_REQUIREMENT = 123
const SAMPLE_OUTPUT_SCRIPT = "0x1234123412341234"
const SAMPLE_OUTPUT_VALUE_BYTES = "0x4321"

async function deployToken(){
    const Token = await ethers.getContractFactory("FakeToken");
    const token:Contract = await Token.deploy();
    await token.deployed();
    return token
}

async function setup() {
    const [owner, governanceOwner, redeemer] = await ethers.getSigners();

    const keepToken = await deployToken();
    await keepToken.mint(owner.address, TOTAL_KEEP_TOKENS);
    const tbtcToken = await deployToken();
    await tbtcToken.mint(redeemer.address, TOTAL_TBTC_TOKENS);

    const mockBondedKeep = await deployMockContract(governanceOwner, BondedKeepContract.abi);
    mockBondedKeep.mock.getMembers.returns([keepToken.address, OPERATOR_ADDRESS, SECOND_OPERATOR_ADDRESS]) // Includes a random address

    const mockDeposit = await deployMockContract(governanceOwner, DepositContract.abi);
    mockDeposit.mock.getOwnerRedemptionTbtcRequirement.returns(TBTC_REDEMPTION_REQUIREMENT);
    mockDeposit.mock.collateralizationPercentage.returns('135');
    mockDeposit.mock.keepAddress.returns(mockBondedKeep.address);
    mockDeposit.mock.lotSizeTbtc.returns(SAMPLE_LOT_SIZE);

    const mockVendingMachine = await deployMockContract(governanceOwner, VendingMachineContract.abi);
    mockVendingMachine.mock.tbtcToBtc.returns()
    const mockDepositToken = await deployMockContract(governanceOwner, DepositTokenContract.abi);
    mockDepositToken.mock.exists.returns(true)

    const { contract } = await deployWithTimelockedProxy(governanceOwner.address, "Collateral", [keepToken.address, tbtcToken.address, mockVendingMachine.address, mockDepositToken.address]);
    await keepToken.approve(contract.address, TOTAL_KEEP_TOKENS);
    await tbtcToken.connect(redeemer).approve(contract.address, 300);
    return {
        keepToken,
        tbtcToken,
        collateral: contract,
        redeemer,
        mockDeposit,
        owner
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
        await collateral.addRewarder(OPERATOR_ADDRESS, 500, [SAMPLE_LOT_SIZE, 10], 135);
        expect(await collateral.getKeepRewardPerRedemptionLotSize(0, SAMPLE_LOT_SIZE)).to.equal(10)
        const UNSET_LOT_SIZE = 2;
        expect(await collateral.getKeepRewardPerRedemptionLotSize(0, UNSET_LOT_SIZE)).to.equal(0)
    })
    it("rewarder parameters can be changed, but only by the owner", async()=>{
        const {collateral, redeemer} = await setup()
        await expect(collateral.addRewarder(OPERATOR_ADDRESS, 500, [SAMPLE_LOT_SIZE, 10], 135)).to.emit(collateral, 'NewRewarderCreated')
        await collateral.setMinimumCollateralizationPercentage(0, 140);
        expect((await collateral.rewarders(0)).minimumCollateralizationPercentage).to.equal(140);
        await expect(collateral.connect(redeemer).setMinimumCollateralizationPercentage(0, 132)).to.be.revertedWith('You are not the owner of this rewarder')
        await collateral.addRewarder(SECOND_OPERATOR_ADDRESS, 200, [SAMPLE_LOT_SIZE, 20, 100, 50, 400, 30], 135)
        await collateral.setKeepRewards(1, [1000, 30, 400, 1])
        expect(await collateral.getKeepRewardPerRedemptionLotSize(1, 400)).to.equal(1)
    })
    it("top ups and withdrawals work fine", async()=>{
        const {collateral, redeemer, keepToken, owner} = await setup()
        await collateral.addRewarder(OPERATOR_ADDRESS, 500, [SAMPLE_LOT_SIZE, 100], 14);
        await collateral.withdraw(0, 100);
        await expect(collateral.withdraw(0, 401)).to.be.revertedWith('SafeMath: subtraction overflow')
        await collateral.topUp(0, 200)
        await expect(collateral.topUp(0, 1000)).to.be.revertedWith('ERC20: transfer amount exceeds balance')
        const finalBalanceInContract = 500-100+200
        expect((await collateral.rewarders(0)).keepBalance).to.equal(finalBalanceInContract)
        expect(await keepToken.balanceOf(collateral.address)).to.equal(finalBalanceInContract)
        expect(await keepToken.balanceOf(owner.address)).to.equal(TOTAL_KEEP_TOKENS-500+100-200);
        await expect(collateral.connect(redeemer).withdraw(0, 1)).to.be.revertedWith('You are not the owner of this rewarder')
    })
    it("ATTACK: it's not possible to withdraw the same reward multiple times by repeating rewarderIndexes in redeem() ", async()=>{
        const {collateral, redeemer, tbtcToken, mockDeposit, keepToken} = await setup()
        await collateral.addRewarder(OPERATOR_ADDRESS, 500, [SAMPLE_LOT_SIZE, 100], 140);
        await expect(collateral.connect(redeemer).redeem(mockDeposit.address, SAMPLE_OUTPUT_SCRIPT, SAMPLE_OUTPUT_VALUE_BYTES, [0, 1, 0, 1], 0)).to.be.revertedWith("rewarderIndexes must be strictly increasing")
    })
    it("rewardBalance gets reduced after a redemption", async () => {
        const REWARD = 30
        const {collateral, redeemer, tbtcToken, mockDeposit, keepToken} = await setup()
        await collateral.addRewarder(OPERATOR_ADDRESS, 500, [SAMPLE_LOT_SIZE, REWARD], 135);
        await collateral.connect(redeemer).redeem(mockDeposit.address, SAMPLE_OUTPUT_SCRIPT, SAMPLE_OUTPUT_VALUE_BYTES, [0, 1], 0);
        expect(await keepToken.balanceOf(redeemer.address)).to.equal(REWARD)
        expect(await tbtcToken.balanceOf(redeemer.address)).to.equal(TOTAL_TBTC_TOKENS-TBTC_REDEMPTION_REQUIREMENT)
        expect((await collateral.rewarders(0)).keepBalance).to.equal(500-REWARD)
    })
    it("redeem skips rewards when collateralization percentage is not lower than the one set by rewarder (protection against griefing)", async()=>{
        const {collateral, redeemer, mockDeposit, keepToken} = await setup()
        await collateral.addRewarder(OPERATOR_ADDRESS, 500, [SAMPLE_LOT_SIZE, 20], 128);
        await collateral.addRewarder(SECOND_OPERATOR_ADDRESS, 300, [SAMPLE_LOT_SIZE, 40], 140);
        await collateral.connect(redeemer).redeem(mockDeposit.address, SAMPLE_OUTPUT_SCRIPT, SAMPLE_OUTPUT_VALUE_BYTES, [0, 1, 1, 2], 30)
        expect(await keepToken.balanceOf(redeemer.address)).to.equal(40)
        await collateral.connect(redeemer).redeem(mockDeposit.address, SAMPLE_OUTPUT_SCRIPT, SAMPLE_OUTPUT_VALUE_BYTES, [0, 1], 0);
        expect(await keepToken.balanceOf(redeemer.address)).to.equal(40)
    })
    it("is possible to claim rewards from multiple rewarders for a single redemption", async () => {
        const {collateral, redeemer, mockDeposit, keepToken, owner} = await setup()
        await keepToken.mint(redeemer.address, TOTAL_KEEP_TOKENS);
        await keepToken.connect(redeemer).approve(collateral.address, 600)
        let rewarderList:number[] = []
        for(let i=0; i<5; i++){
            await collateral.addRewarder(OPERATOR_ADDRESS, 30, [SAMPLE_LOT_SIZE, 10], 135+i);
            await collateral.connect(redeemer).addRewarder(SECOND_OPERATOR_ADDRESS, 40, [SAMPLE_LOT_SIZE, 12], 140+i);
            rewarderList = rewarderList.concat([i*2, 1, i*2+1, 2])
        }
        expect(rewarderList.length).to.equal(20);
        await collateral.connect(redeemer).redeem(mockDeposit.address, SAMPLE_OUTPUT_SCRIPT, SAMPLE_OUTPUT_VALUE_BYTES, rewarderList, 0)
        expect(await keepToken.balanceOf(redeemer.address)).to.equal(TOTAL_KEEP_TOKENS-40*5+(10+12)*5)
    })
    it("if rewards get lowered by front-running but redeemer sets minimumRewards, transaction gets reverted", async()=>{
        const {collateral, redeemer, mockDeposit} = await setup()
        await collateral.addRewarder(OPERATOR_ADDRESS, 300, [SAMPLE_LOT_SIZE, 300], 137);
        await collateral.withdraw(0, 300);
        await expect(collateral.connect(redeemer).redeem(mockDeposit.address, SAMPLE_OUTPUT_SCRIPT, SAMPLE_OUTPUT_VALUE_BYTES, [0,1], 300)).to.be.revertedWith('KEEP reward does not reach minimum')
    })
    it("if rewards get lowered by front-running but redeemer doesn't set minimumRewards, only rewards by other rewarders are collected", async()=>{
        const {collateral, redeemer, mockDeposit, keepToken} = await setup()
        await collateral.addRewarder(OPERATOR_ADDRESS, 300, [SAMPLE_LOT_SIZE, 300], 137);
        await collateral.addRewarder(OPERATOR_ADDRESS, 400, [SAMPLE_LOT_SIZE, 104], 139);
        await collateral.withdraw(0, 294);
        await collateral.connect(redeemer).redeem(mockDeposit.address, SAMPLE_OUTPUT_SCRIPT, SAMPLE_OUTPUT_VALUE_BYTES, [0, 1, 1, 1], 100)
        expect(await keepToken.balanceOf(redeemer.address)).to.equal(104);
        expect((await collateral.rewarders(0)).keepBalance).to.equal(6)
        expect((await collateral.rewarders(1)).keepBalance).to.equal(400-104)
    })
    it("if operator is not a member of the keep revert tx", async()=>{
        const {collateral, redeemer, mockDeposit} = await setup()
        await collateral.addRewarder(redeemer.address, 300, [SAMPLE_LOT_SIZE, 300], 137);
        await expect(collateral.connect(redeemer).redeem(mockDeposit.address, SAMPLE_OUTPUT_SCRIPT, SAMPLE_OUTPUT_VALUE_BYTES, [0, 1], 0)).to.be.revertedWith("Rewarder operator doesn't match keep member")
    })
    it("multiple redeems work fine (there are no issues with approve calls)", async()=>{
        const {collateral, owner, mockDeposit, tbtcToken} = await setup()
        await tbtcToken.mint(owner.address, 2000)
        await tbtcToken.approve(collateral.address, 2000)
        await collateral.addRewarder(SECOND_OPERATOR_ADDRESS, 300, [SAMPLE_LOT_SIZE, 20], 137);
        for(let i=0; i<10; i++){
            await collateral.redeem(mockDeposit.address, SAMPLE_OUTPUT_SCRIPT, SAMPLE_OUTPUT_VALUE_BYTES, [0, 2], 0)
        }
    })
})