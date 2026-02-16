import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'tokamon_network';
const DEFAULT_NETWORK = 'local';

// 사용 가능한 네트워크
const networks = {
  local: {
    chainId: 1337,
    name: 'Local (Anvil)',
    rpcUrl: 'http://127.0.0.1:8999',
    nativeCurrency: { name: 'TON', symbol: 'TON', decimals: 18 },
  },
  'thanos-sepolia': {
    chainId: 111551119090,
    name: 'Thanos Sepolia',
    rpcUrl: 'https://rpc.thanos-sepolia.tokamak.network',
    nativeCurrency: { name: 'TON', symbol: 'TON', decimals: 18 },
  },
};

let currentNetwork = DEFAULT_NETWORK;
const listeners = new Set();

export async function initNetwork() {
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY);
    if (saved && networks[saved]) {
      currentNetwork = saved;
    }
  } catch (_) {}
  return currentNetwork;
}

export function getSelectedNetwork() {
  return currentNetwork;
}

export async function setSelectedNetwork(networkId) {
  if (!networks[networkId]) {
    throw new Error(`Unknown network: ${networkId}`);
  }
  currentNetwork = networkId;
  await AsyncStorage.setItem(STORAGE_KEY, networkId);
  listeners.forEach((fn) => fn(networkId));
}

export function getNetworkConfig() {
  return { id: currentNetwork, ...networks[currentNetwork] };
}

export function getAllNetworks() {
  return Object.entries(networks).map(([id, net]) => ({ id, ...net }));
}

export function onNetworkChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export { networks, DEFAULT_NETWORK };
