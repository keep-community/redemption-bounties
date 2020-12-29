import React from 'react';
import { Box, Heading } from "rimble-ui";
import Tabbed from './Tabbed'
import Footer from './Footer'
import Manage from './Manage'
import Bounties from './Bounties'
import WalletStatus from './WalletStatus'

function App() {
  return (
    <div className="App">
      <WalletStatus />
     <Box>
        <Heading>KEEP Redemption Bounties</Heading>
        <Tabbed tabs={[{
          tabLabel: "Redeem",
          content: <Bounties />
        },
        {
          tabLabel: "Manage",
          content: <Manage />
        }]}/>
      </Box>
      <Footer />
    </div>
  );
}

export default App;
