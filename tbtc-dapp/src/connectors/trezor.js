import WebsocketSubprovider from "web3-provider-engine/subproviders/websocket"
import { AbstractConnector } from "@web3-react/abstract-connector"
import Web3ProviderEngine from "web3-provider-engine"
import CacheSubprovider from "web3-provider-engine/subproviders/cache.js"
import { TrezorSubprovider } from "./trezor_subprovider"
import TrezorConnect from "trezor-connect"

/**
 * An implementation of a TrezorConnector for web3-react, based on the original
 * `@web3-react/trezor-connector`.
 *
 * Some differences:
 *
 * 1. The original doesn't work with event subscriptions, as it assumes a HTTP RPC
 *    endpoint. Event subscriptions use `eth_subscribe`, which Ganache does not
 *    support out-of-the-box. Assuming a Websocket provider is simpler for our case.
 */
export class TrezorConnector extends AbstractConnector {
  defaultAccount = ""

  constructor({
    chainId,
    url,
    pollingInterval,
    requestTimeoutMs,
    config = {},
    manifestEmail,
    manifestAppUrl,
  }) {
    super({
      supportedChainIds: [chainId],
    })

    this.chainId = chainId
    this.url = url
    this.pollingInterval = pollingInterval
    this.requestTimeoutMs = requestTimeoutMs
    this.config = config
    this.manifestEmail = manifestEmail
    this.manifestAppUrl = manifestAppUrl
  }

  async activate() {
    if (!this.provider) {
      TrezorConnect.manifest({
        email: this.manifestEmail,
        appUrl: this.manifestAppUrl,
      })

      const engine = new Web3ProviderEngine({
        pollingInterval: this.pollingInterval,
      })
      engine.addProvider(
        new TrezorSubprovider({
          trezorConnectClientApi: TrezorConnect,
          ...this.config,
        })
      )
      engine.addProvider(new CacheSubprovider())
      engine.addProvider(new WebsocketSubprovider({ rpcUrl: this.url }))
      this.provider = engine
    }

    this.provider.start()

    return { provider: this.provider, chainId: this.chainId }
  }

  async getProvider() {
    return this.provider
  }

  async getChainId() {
    return this.chainId
  }

  async getAccount() {
    return this.defaultAccount
  }

  async getAccounts(numberOfAccounts = 15) {
    return await this.provider._providers[0].getAccountsAsync(numberOfAccounts)
  }

  setDefaultAccount(account) {
    this.defaultAccount = account
  }

  deactivate() {
    this.provider.stop()
  }
}
