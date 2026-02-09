import { createAppKit } from '@reown/appkit/react';
import { EthersAdapter } from '@reown/appkit-adapter-ethers';
import { defineChain } from '@reown/appkit/networks';

const rpcHost = window.location.hostname === 'localhost' ? '127.0.0.1' : window.location.hostname;

const anvilLocal = defineChain({
  id: 1337,
  caipNetworkId: 'eip155:1337',
  chainNamespace: 'eip155',
  name: 'Anvil Local',
  nativeCurrency: { decimals: 18, name: 'Ether', symbol: 'ETH' },
  rpcUrls: {
    default: { http: [`http://${rpcHost}:8999`] },
  },
});

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;

if (projectId) {
  createAppKit({
    adapters: [new EthersAdapter()],
    networks: [anvilLocal],
    projectId,
    features: {
      smartSessions: false,
    },
    coinbasePreference: 'eoaOnly',
    metadata: {
      name: 'Tokamon',
      description: 'Location-based token rewards',
      url: window.location.origin,
      icons: [],
    },
  });
}

export { anvilLocal };
