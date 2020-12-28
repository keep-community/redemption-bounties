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

    event NewRewarderCreated(uint indexed rewarderIndex, address indexed owner, address indexed operator, uint keepBalance, uint[] keepRewardPerRedemptionLotSize, uint minimumCollateralizationPercentage);

    function initialize() public initializer {
        keepToken = IERC20(0x85Eee30c52B0b379b046Fb0F85F4f3Dc3009aFEC);
        tbtcToken = IERC20(0x8dAEBADE922dF735c38C80C7eBD708Af50815fAa);
        vendingMachine = VendingMachine(0x526c08E5532A9308b3fb33b7968eF78a5005d2AC);
        tbtcDepositToken = TBTCDepositToken(0x10B66Bd1e3b5a936B7f8Dbc5976004311037Cdf0);
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
        keepToken.transferFrom(address(this), msg.sender, _keepToWithdraw);
    }

    function setMinimumCollateralizationPercentage(uint _rewarderIndex, uint _newMinimumCollateralizationPercentage) external {
        OperatorRewarder storage rewarder = getRewarder(_rewarderIndex);
        rewarder.minimumCollateralizationPercentage = _newMinimumCollateralizationPercentage;
    }

    function setKeepRewards(uint _rewarderIndex, uint[] calldata _keepRewardPerRedemptionLotSize) external {
        OperatorRewarder storage rewarder = getRewarder(_rewarderIndex);
        setRedemptionRewards(rewarder, _keepRewardPerRedemptionLotSize);
    }

    // REDEEMER functions
    // not external to allow bytes memory parameters
    // associatedRewarders is to be formatted like [rewarderIndex, rewarder in Keep's member array, rewarderIndex 2,...]
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
        // Deposits that have been redeemed don't track it's collateralizationPercentage (return 0), but this one just entered redemption so it will return properly
        uint256 collateralizationPercentage = _d.collateralizationPercentage();

        BondedECDSAKeep associatedKeep = BondedECDSAKeep(_d.keepAddress());
        address[] memory keepMembers = associatedKeep.getMembers();

        uint depositLotSize = _d.lotSizeTbtc();

        // There's no need to check that associatedRewarders has an even amount of items because otherwise the array bounds check inside will fail
        // This is possible because right now solidity doesn't optimize bounds checks inside range loops, but in the future it might do so
        // and, while this specific loop shouldn't get optimized, if it does it could become problematic
        // See https://github.com/ethereum/solidity/issues/9117
        uint totalKeepToSend = 0;
        for (uint i=0; i<associatedRewarders.length; i+=2) {
            uint rewarderIndex = associatedRewarders[i];
            uint memberIndex = associatedRewarders[i + 1];
            OperatorRewarder storage rewarder = rewarders[rewarderIndex];
            require(rewarder.minimumCollateralizationPercentage <= collateralizationPercentage, "Minimum collateralization percentage for rewarder not reached");
            require(rewarder.operator == keepMembers[memberIndex], "Rewarder operator doesn't match keep member");
            uint keepReward = rewarder.keepRewardPerRedemptionLotSize[depositLotSize];
            if(keepReward <= rewarder.keepBalance){ // Avoid griefing by the rewarders (they could front-run the redeemer and set a high keepReward that reverts the tx)
                rewarder.keepBalance = rewarder.keepBalance.sub(keepReward);
                totalKeepToSend = totalKeepToSend.add(keepReward);
            }
        }
        keepToken.transfer(msg.sender, totalKeepToSend);
        require(totalKeepToSend >= minimumKEEPReward, "The minimum KEEP reward is not high enough"); // Prevent front-running from the stakers

        // Store the redeemer in case there's an issue with redemption and coins need to be recovered
        redeemers[_depositToRedeem] = msg.sender;
    }

    function withdrawETHAfterFraudLiquidation(address payable  _depositToWithdrawFrom) external {
        // By using data from previous redemption data we're making sure that the deposit is a real one, no need to check that again.
        require(redeemers[_depositToWithdrawFrom] == msg.sender, "The deposit address provided hasn't been processed with this contract before or it has been processed with a different account");
        redeemers[_depositToWithdrawFrom] = address(0);
        Deposit deposit = Deposit(_depositToWithdrawFrom);
        uint256 withdrawableAmount = deposit.withdrawableAmount();
        deposit.withdrawFunds();
        msg.sender.sendValue(withdrawableAmount); // Uses Address.sol to pass on all the gas available
    }

    function withdrawTBTCAfterLiquidation(address payable  _depositToWithdrawFrom) external {
        // See comment on withdrawETHAfterFraudLiquidation()
        require(redeemers[_depositToWithdrawFrom] == msg.sender, "The deposit address provided hasn't been processed with this contract before or it has been processed with a different account");
        // Clear info to prevent multiple withdrawals of the same tbtc
        redeemers[_depositToWithdrawFrom] = address(0);
        Deposit deposit = Deposit(_depositToWithdrawFrom);
        // Make sure redemption has actually failed
        require(deposit.currentState() == uint8(DepositStates.States.LIQUIDATED), "Deposit hasn't been liquidated");
        // Make sure there was no fraud on the liquidation (in this case we'd get ETH instead of tBTC)
        require(deposit.withdrawableAmount() == 0, "Deposit was no liquidated with fraud");
        uint256 lotSizeTbtc = deposit.lotSizeTbtc();
        tbtcToken.transfer(msg.sender, lotSizeTbtc);
    }
}