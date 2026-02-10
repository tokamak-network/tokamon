import '@walletconnect/react-native-compat';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAppKit } from '@reown/appkit-react-native';
import { EthersAdapter } from '@reown/appkit-ethers-react-native';

const projectId = '823c0d685eaada102aef91a1aa3e34bf';

const anvilLocal = {
  id: 1337,
  caipNetworkId: 'eip155:1337',
  chainNamespace: 'eip155',
  name: 'Anvil Local',
  nativeCurrency: { decimals: 18, name: 'Ether', symbol: 'ETH' },
  rpcUrls: {
    default: { http: ['http://127.0.0.1:8999'] },
  },
  blockExplorers: {
    default: { name: 'Local', url: 'http://127.0.0.1:8999' },
  },
  testnet: true,
};

const ethersAdapter = new EthersAdapter();

export const appKit = createAppKit({
  projectId,
  networks: [anvilLocal],
  defaultNetwork: anvilLocal,
  adapters: [ethersAdapter],
  storage: AsyncStorage,
  features: {
    smartSessions: false,
  },
  coinbasePreference: 'eoaOnly',
  metadata: {
    name: 'Tokamon',
    description: 'Location-based token rewards',
    url: 'https://tokamon.app',
    icons: [],
    redirect: {
      native: 'tokamon://',
    },
  },
});
