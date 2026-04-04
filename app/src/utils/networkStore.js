import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'tokamon_network';
const DEFAULT_NETWORK = 'thanos-sepolia';

// 사용 가능한 네트워크
const networks = {
  'thanos-sepolia': {
    chainId: 111551119090,
    name: 'Thanos Sepolia',
    rpcUrl: 'https://rpc.thanos-sepolia.tokamak.network',
    listenerUrl: process.env.EXPO_PUBLIC_LISTENER_URL_THANOS_SEPOLIA || 'https://listener.tokamon.io',
    nativeCurrency: { name: 'TON', symbol: 'TON', decimals: 18 },
  },
};

let currentNetwork = DEFAULT_NETWORK;
// 서버에서 받은 동적 listenerUrl (Firestore/api/contract에서 조회)
let dynamicListenerUrl = null;
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

export function getListenerUrl() {
  return dynamicListenerUrl || networks[currentNetwork]?.listenerUrl || networks[DEFAULT_NETWORK].listenerUrl;
}

const TRUSTED_LISTENER_HOSTS = ['listener.tokamon.io', 'localhost'];

export function setListenerUrl(url) {
  if (!url) return;
  try {
    const parsed = new URL(url);
    if (!TRUSTED_LISTENER_HOSTS.includes(parsed.hostname)) return;
    if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost') return;
    dynamicListenerUrl = url;
  } catch {
    // invalid URL, ignore
  }
}

export { networks, DEFAULT_NETWORK };
