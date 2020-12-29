import React from 'react'
import NetworkIndicator from "@rimble/network-indicator"
import { MetaMaskButton } from 'rimble-ui';
import "./index.css"

export default function WalletStatus() {
    const [chainId, setChainId] = React.useState(Number(window.ethereum?.chainId));
    window.ethereum?.on('chainChanged', (newChainId: string) => setChainId(Number(newChainId)));
    return (<div className="accountStatus">
        <MetaMaskButton.Outline size="small">
            Connect with MetaMask
        </MetaMaskButton.Outline>
        {chainId!==undefined?
        <NetworkIndicator currentNetwork={chainId} requiredNetwork={1}>
            {{
            onWrongNetworkMessage: "Wrong network, connect to Mainnet"
        }}</NetworkIndicator>
        :<></>}
    </div>)
}