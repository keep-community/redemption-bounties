//SPDX-License-Identifier: MIT
pragma solidity =0.5.17;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeMath} from "@openzeppelin/contracts/math/SafeMath.sol";
import {Deposit} from "@keep-network/tbtc/contracts/deposit/Deposit.sol";
import {DepositStates} from "@keep-network/tbtc/contracts/deposit/DepositStates.sol";
import {VendingMachine} from "@keep-network/tbtc/contracts/system/VendingMachine.sol";
import {TBTCDepositToken} from "@keep-network/tbtc/contracts/system/TBTCDepositToken.sol";
import {BondedECDSAKeep} from "@keep-network/keep-ecdsa/contracts/BondedECDSAKeep.sol";
import {Initializable} from "@openzeppelin/upgrades/contracts/Initializable.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";

contract Collateral is Initializable {
    using SafeMath for uint;
    using Address for address payable;

    IERC20 public keepToken;
    IERC20 public tbtcToken;
    VendingMachine public vendingMachine;
    TBTCDepositToken public tbtcDepositToken;

    struct OperatorRewarder {
        address owner;
        address operator;
        uint keepBalance;
        mapping (uint=>uint) keepRewardPerRedemptionLotSize;
        uint minimumCollateralizationPercentage;
    }
    OperatorRewarder[] public rewarders;
    mapping (address => address) public redeemers;

    // Indexed event params heavily increase gas costs (multiplier is 375 vs 8 for unindexed)
    // In this case this results in an increase of ~15000 gas, but this event should only be used for creation of new rewarders (rare) so it's fine
    event NewRewarderCreated(uint indexed rewarderIndex, address indexed owner, address indexed operator, uint keepBalance, uint[] keepRewardPerRedemptionLotSize, uint minimumCollateralizationPercentage);

    event RedemptionRewardDispensed(uint rewarderIndex, address redeemer, uint rewardAmount);

    // Addresses are passed in to allow for mocks to be used during testing
    function initialize(address _keepTokenAddress, address _tbtcTokenAddress, address _vendingMachineAddress, address _tbtcDepositTokenAddress) public initializer {
        keepToken = IERC20(_keepTokenAddress);
        tbtcToken = IERC20(_tbtcTokenAddress);
        vendingMachine = VendingMachine(_vendingMachineAddress);
        tbtcDepositToken = TBTCDepositToken(_tbtcDepositTokenAddress);
    }

    // REWARDER functions
    // _keepRewardPerRedemptionLotSize must be formatted like [lotSize1, reward1, lotSize2, reward2]
    function setRedemptionRewards(OperatorRewarder storage rewarder, uint[] memory _keepRewardPerRedemptionLotSize) internal {
        // See `redeem` for rationale on why length is not checked to be even
        for (uint i=0; i<_keepRewardPerRedemptionLotSize.length; i+=2) {
            uint lotSize = _keepRewardPerRedemptionLotSize[i];
            uint rewards = _keepRewardPerRedemptionLotSize[i+1];
            rewarder.keepRewardPerRedemptionLotSize[lotSize] = rewards;
        }
    }

    function addRewarder(address _operator, uint _keepBalance, uint[] calldata _keepRewardPerRedemptionLotSize, uint _minimumCollateralizationPercentage) external{
        keepToken.transferFrom(msg.sender, address(this), _keepBalance);
        rewarders.push(OperatorRewarder({
            owner: msg.sender,
            operator: _operator,
            keepBalance: _keepBalance,
            minimumCollateralizationPercentage: _minimumCollateralizationPercentage
        }));
        uint rewarderIndex = rewarders.length - 1;
        OperatorRewarder storage rewarder = rewarders[rewarderIndex];
        setRedemptionRewards(rewarder, _keepRewardPerRedemptionLotSize);
        emit NewRewarderCreated(rewarderIndex, msg.sender, _operator, _keepBalance, _keepRewardPerRedemptionLotSize, _minimumCollateralizationPercentage);
    }

    function getRewarder(uint _rewarderIndex) internal view returns (OperatorRewarder storage){
        // Out of bounds checks are automatically added by the compiler
        OperatorRewarder storage rewarder = rewarders[_rewarderIndex];
        require(rewarder.owner == msg.sender, "You are not the owner of this rewarder");
        return rewarder;
    }

    function topUp(uint _rewarderIndex, uint _keepBalanceToTopUp) external {
        OperatorRewarder storage rewarder = getRewarder(_rewarderIndex);
        keepToken.transferFrom(msg.sender, address(this), _keepBalanceToTopUp);
        rewarder.keepBalance = rewarder.keepBalance.add(_keepBalanceToTopUp);
    }

    function withdraw(uint _rewarderIndex, uint _keepToWithdraw) external {
        OperatorRewarder storage rewarder = getRewarder(_rewarderIndex);
        // No need to check if there's enough balance since otherwise the next operation will underflow and revert the tx
        rewarder.keepBalance = rewarder.keepBalance.sub(_keepToWithdraw);
        keepToken.transfer(msg.sender, _keepToWithdraw);
    }

    function setMinimumCollateralizationPercentage(uint _rewarderIndex, uint _newMinimumCollateralizationPercentage) external {
        OperatorRewarder storage rewarder = getRewarder(_rewarderIndex);
        rewarder.minimumCollateralizationPercentage = _newMinimumCollateralizationPercentage;
    }

    function setKeepRewards(uint _rewarderIndex, uint[] calldata _keepRewardPerRedemptionLotSize) external {
        OperatorRewarder storage rewarder = getRewarder(_rewarderIndex);
        setRedemptionRewards(rewarder, _keepRewardPerRedemptionLotSize);
    }

    function getKeepRewardPerRedemptionLotSize(uint _rewarderIndex, uint _lotSize) view external returns (uint) {
        return rewarders[_rewarderIndex].keepRewardPerRedemptionLotSize[_lotSize]; // Returns 0 if it hasn't been set
    }

    function getRewardersLength() view external returns (uint) {
        return rewarders.length;
    }

    // REDEEMER functions
    // not external to allow bytes memory parameters
    // associatedRewarders is to be formatted like [rewarderIndex, rewarder in Keep's member array, rewarderIndex 2,...]
    // where the rewarderIndex subsequence is strictly increasing
    function redeem(address payable _depositToRedeem, bytes8 _outputValueBytes, bytes memory _redeemerOutputScript, uint[] memory associatedRewarders, uint minimumKEEPReward) public {
        // We cannot rely on VendingMachine reverts to make sure that the correct amount of tBTC has been sent because this contract may own tBTC that were sent from unrelated liquidations
        // Thus we need to request the exact amount of tBTC used in the redemption
        // The following code is just a copy of the one inside VendingMachine.tbtcToBtc
        require(tbtcDepositToken.exists(uint256(_depositToRedeem)), "tBTC Deposit Token does not exist");
        Deposit _d = Deposit(_depositToRedeem);

        uint256 tbtcOwed = _d.getOwnerRedemptionTbtcRequirement(address(this));

        if(tbtcOwed != 0){
            tbtcToken.transferFrom(msg.sender, address(this), tbtcOwed);
            tbtcToken.approve(address(vendingMachine), tbtcOwed);
        }

        // End of copied code
        vendingMachine.tbtcToBtc(_depositToRedeem, _outputValueBytes, _redeemerOutputScript);
        
        // Redemption successful, let's distribute the rewards
        // Deposits that have been redeemed don't track it's collateralizationPercentage (return 0), but this one just entered redemption so it will be returned properly
        uint256 collateralizationPercentage = _d.collateralizationPercentage();

        BondedECDSAKeep associatedKeep = BondedECDSAKeep(_d.keepAddress());
        address[] memory keepMembers = associatedKeep.getMembers();

        uint depositLotSize = _d.lotSizeTbtc();

        // There's no need to check that associatedRewarders has an even amount of items because otherwise the array bounds check inside will fail
        // This is possible because right now solidity doesn't optimize bounds checks inside range loops, but in the future it might be possible to do so
        // This optimization must not be applied here though
        // See https://github.com/ethereum/solidity/issues/9117
        uint totalKeepToSend = 0;
        uint previousRewarderIndex = 0;
        for (uint i=0; i<associatedRewarders.length; i+=2) {
            uint rewarderIndex = associatedRewarders[i];
            uint memberIndex = associatedRewarders[i + 1];
            // Prevent attack where the same reward is withdrawn twice
            require(rewarderIndex.add(1) > previousRewarderIndex, "rewarderIndexes must be strictly increasing");
            OperatorRewarder storage rewarder = rewarders[rewarderIndex];
            require(rewarder.operator == keepMembers[memberIndex], "Rewarder operator doesn't match keep member");
            uint keepReward = rewarder.keepRewardPerRedemptionLotSize[depositLotSize];
            if(keepReward <= rewarder.keepBalance && collateralizationPercentage <= rewarder.minimumCollateralizationPercentage){ // Avoid griefing by the rewarders (they could front-run the redeemer and change parameters to force a revert)
                rewarder.keepBalance = rewarder.keepBalance.sub(keepReward);
                totalKeepToSend = totalKeepToSend.add(keepReward);
                // Emit an event to make rewarder balance changes easier to track
                emit RedemptionRewardDispensed(rewarderIndex, msg.sender, keepReward);
            }
            previousRewarderIndex = rewarderIndex.add(1); // +1 to handle the case of the first array element
        }
        keepToken.transfer(msg.sender, totalKeepToSend);
        require(totalKeepToSend >= minimumKEEPReward, "KEEP reward does not reach minimum"); // Prevent front-running from the rewarders

        // Store the redeemer in case there's an issue with redemption and coins need to be recovered
        redeemers[_depositToRedeem] = msg.sender;
    }

    function withdrawETHAfterFraudLiquidation(address payable  _depositToWithdrawFrom) external {
        // By using data from previous redemption data we're making sure that the deposit is a real one, no need to check that again.
        require(redeemers[_depositToWithdrawFrom] == msg.sender, "The deposit address provided hasn't been processed with this contract before or it has been processed through a different account");
        redeemers[_depositToWithdrawFrom] = address(0);
        Deposit deposit = Deposit(_depositToWithdrawFrom);
        uint256 withdrawableAmount = deposit.withdrawableAmount();
        deposit.withdrawFunds();
        msg.sender.sendValue(withdrawableAmount); // Uses Address.sol to pass on all the gas available
    }

    function withdrawTBTCAfterLiquidation(address payable  _depositToWithdrawFrom) external {
        // See comment on withdrawETHAfterFraudLiquidation()
        require(redeemers[_depositToWithdrawFrom] == msg.sender, "The deposit address provided hasn't been processed with this contract before or it has been processed through a different account");
        // Clear info to prevent multiple withdrawals of the same tbtc
        redeemers[_depositToWithdrawFrom] = address(0);
        Deposit deposit = Deposit(_depositToWithdrawFrom);
        // Make sure redemption has actually failed
        require(deposit.currentState() == uint8(DepositStates.States.LIQUIDATED), "Deposit hasn't been liquidated");
        // Make sure there was no fraud on the liquidation (in this case we'd get ETH instead of tBTC)
        require(deposit.withdrawableAmount() == 0, "Deposit was liquidated with fraud");
        uint256 lotSizeTbtc = deposit.lotSizeTbtc();
        tbtcToken.transfer(msg.sender, lotSizeTbtc);
    }
}