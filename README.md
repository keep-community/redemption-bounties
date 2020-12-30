<h1 align="center">
  Redemption Bounties
  <br>
</h1>

<h4 align="center">
    Incentivized tBTC redemptions for undercollateralized deposits<br>
    Check it out on <a href="https://redeem.finance/" target="_blank">redeem.finance</a>!<br>
    <img src="https://github.com/keep-community/redemption-bounties/raw/master/frontend/src/images/bounty-farmer.png" width="256">
</h4>

## Concept
This service allows stakers to set rewards for redeeming deposits that have a collateralization ratio lower than one chosen by the staker, thus simplifying operations and removing the need to actively manage deposits.

For example, a staker could provide a reward of 5k KEEP for redeeming 10 tBTC deposits that have a c-ration lower than 135%, making it possible to other parties to claim this by redeeming the deposit through our contract.

## Protocol actors
### Stakers
- Can top up or withdraw their reward balances any time
- Set a minimum collateralization rate
- Set different reward rates for each deposit lot size (1, 5, 10... tBTC)

### Redeemers
- Redemption works the same way but it's done through the contract to allow for verification
- The contract tracks redeemers and if a redemption goes wrong it allows the redeemer to withdraw the compensation tBTC/ETH
- Rewards are immediately disbursed after redemption
- Multiple rewards from different stakers can be claimed for the same redemption

## Ugradeability
Right now the contract is fully upgradeable through a 3 day (72 hour) timelock. Generally this shouldn't pose a problem since all the rewards are withdrawable instantly and any processes started due to a falty redemption will finish within a timeframe lower than 3 days. Thus, if a bad upgrade was pushed through all the parties that have money inside the contract would be able to exit their positions befor eth upgrade went into force, but this requires relatively quick reactions from everyone.

We don't have any plans to upgrade the contract to newer versions, the only reason why the upgrade path is there is because in some cases, when redemptions encounter fraud or timeouts, tokens that are awarded to the redeemer as compensation will be sent to the smart contract. We've built mechanisms that enable redeemers to retrieve them, but it's really hard to test these (faulty redemptions on mainnet are extremely rare, on testnet it's impossible to get them because of the mock contracts used for price oracles and reproducing the network locally is quite hard) so, personally, I (@corollari) am not sure if everything will work as expected and we won't have missed any way through which tokens can end up in the contract.

So, in order to prevent situations where redeemers can't be made whole because of stuck tokens, we've set up this upgrade mechanism, meant to be used as an emergency mechanism to recover stuck balances.

Eventually our plan is to set to the governance address to 0 and thus disable upgrades. We will do this once we feel confident enough in our job or in the case that users express a preference for this over the safety net provided by upgradeability.

## Forks
- `Timelock.sol` and `SafeMath.sol` have been forked from Compound without any changes.
- The redemption dApp on [dapp.redeem.finance](https://dapp.redeem.finance) is [a fork of keep-network/tbtc-dapp](https://github.com/keep-community/tbtc-dapp) with some changes (see commits for a list of them).

## Risks
- The contract could have a vulnerability and get hacked
- Our multisig could turn malicious or get hacked and force an upgrade that sends all funds to a 3rd party after 3 days.

## Attacks
Stakers can front-run redeemers and cheat them out of their rewards by identifying transactions that redeem deposits associated with them and front-running these with transactions that withdraw all their rewards. If the staker's transaction gets included in a block first, the redeemer's transaction will encounter a situation where there are no rewards left and the redemption has been done for free.

This attack is defended against by allowing redeemers to request a minimum amount of rewards, which prevents manipulation of them (otherwise the redemption transaction would fail) at the cost of increasing the chances of a failed transaction due to non-malicious reasons (eg: if a signer runs out of rewards before the transaction is mined, it will cause it to fail although the redeemer may be happy to only take the rewards from the other two signers).

Another possible solution would be to make withdrawals go through a timelocked 2-step process, but this would worsen the staker UX so for now it's not implemented.

## Alternative architectures
During initial discussions these two other proposals came up:

#### Use a new contract for every redemption
When redeeming a deposit it would be possible to have the main contract create a new one that would initially be used to perform the redemption and, afterwards, be handed over to the redeemer, who would be given full control over it.

This approach allows us to verify that the redeemer successfully started a redemption while at the same time it masks the identity of the redeemer through that new contract, so from the point of view of the tBTC contracts the redeemer is this new contract. This is interesting because, if something were to go wrong with the redemption, the redeemer would be able to execute arbitrary transactions using that new contract as a proxy, allowing it to get out of any situation.

The problem with this approach is that the gas cost associated with creating new contracts is really high, so using this would heavily increase the cost of redeeming deposits through our system.

#### Use a commit & prove scheme to verify redemptions
Another possible architecture is based on the idea of having the redeemer commit to redeeming a deposit, redeem it and then have the smart contract verify that a redemption on that deposit has started.

This would provide a set of features similar to the ones from the first architecture, but it would cause other problems.

For example, it's easy to imagine that, in the future, a big chunk of the deposits will be redeemed by users that have no interest in the rewards and just want to obtain BTC. If the redeem dApp chooses deposits with a preference for low c-ration ones, as it has been discussed before, it's likely that a lot of these redemptions will end up hitting deposits that are eligible for rewards. In this scenario a party could front-run these redemption transactions to commit to these deposits right before they get redeemed, thus making the stakers pay for a redemption that didn't need to be incentivized, essentially losing them money.

On this same line there are multiple attacks based on front-running that one can think about, such as continuously committting to a deposit to prevent others from redeeming it until a courtesy call expires, or front-running other redeemers hoping that they will still go ahead with the redemption because they might be in a hurry and have motives for redeeming other than the incentives (for example, being one of the operators of the keep behind the deposit).

#### Current architecture
The current version of the contracts does away with all these ideas and interacts directly with the tBTC contracts, thus acting as the redeemer. Failed redemptions are handled by tracking the original redeemers and replicating the logic of tBTC contracts to calculate the compensation that should be awarded to them.

This architecture solves all the problems mentioned before and keeps gas consumption low, but it requires the contracts to be completely bug-free and handle with perfection all the possible ways that redemptions can go wrong, as the same contract acts as a redeemer for all the deposits, meaning that compensations will end up getting mixed. Thus, this approach trades complexity for the other problems mentioned beforehand.

## Usage
```bash
# Contracts
cd contracts
npm run compile # Compile contracts
npm run deploy # Deploy
npm test # Run tests

# Frontend (typical CRA commands)
cd frontend
npm start # Start local dev server
npm test # Run tests
npm run build # Build production bundle
```

