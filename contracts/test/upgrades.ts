import { expect } from "chai";
import deployWithTimelockedProxy from '../scripts/deployWithTimelockedProxy'
import { ethers } from "hardhat";
import { time, BN } from '@openzeppelin/test-helpers'
import type {Contract} from 'ethers'
import {timeLockDelay} from '../scripts/constants'
import constructUpgradeTransaction from '../scripts/constructUpgradeTransaction'

async function setup() {
    const [_owner, addr1, addr2] = await ethers.getSigners();
    const { contract, timelock } = await deployWithTimelockedProxy(addr1.address);
    return {
        timelock,
        collateral: contract,
        owner: addr1,
        newOwner: addr2
    }
}

async function getParams(collateral:Contract, timelock:Contract) {
    const eta = BigInt(await time.latest()) + BigInt(timeLockDelay + 1);
    return constructUpgradeTransaction(collateral.address, timelock.address, eta) // Just using timelock as a random contract address
}

// See https://github.com/compound-finance/compound-protocol/blob/master/tests/TimelockTest.js for usage examples
describe('Timelock', function () {
    it("is possible to upgrade after the timelock expires", async () => {
        const { collateral, timelock, owner } = await setup();
        const [target, value, signature, data, eta] = await getParams(collateral, timelock)
        await timelock.connect(owner).queueTransaction(target, value, signature, data, eta);
        expect(await collateral.tbtcDepositToken()).to.equal("0x10B66Bd1e3b5a936B7f8Dbc5976004311037Cdf0")
        await time.increaseTo(new BN(eta + BigInt(1)));
        await timelock.connect(owner).executeTransaction(target, value, signature, data, eta);
        await expect(collateral.tbtcDepositToken()).to.be.reverted
    })
    it("upgrades cannot be applied instantaneously", async () => {
        const { collateral, timelock, owner } = await setup();
        const [target, value, signature, data, eta] = await getParams(collateral, timelock)
        await timelock.connect(owner).queueTransaction(target, value, signature, data, eta);
        await time.increaseTo(new BN(eta - BigInt(10)));
        await expect(timelock.connect(owner).executeTransaction(target, value, signature, data, eta)).to.be.revertedWith("Timelock::executeTransaction: Transaction hasn't surpassed time lock")
        expect(await collateral.tbtcDepositToken()).to.equal("0x10B66Bd1e3b5a936B7f8Dbc5976004311037Cdf0")
    })
    it("only the owner can queue upgrades", async () => {
        const { collateral, timelock, owner } = await setup();
        const params= await getParams(collateral, timelock)
        await expect(timelock.queueTransaction(...params)).to.be.revertedWith("Timelock::queueTransaction: Call must come from admin")
    })
})