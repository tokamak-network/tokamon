import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'tokamon_network';
const DEFAULT_NETWORK = 'local';

const LOCAL_HOST = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';

// 사용 가능한 네트워크
// listenerUrl: 해당 네트워크 전용 리스너 서버 주소
// 환경변수로 오버라이드: EXPO_PUBLIC_LISTENER_URL_LOCAL, EXPO_PUBLIC_LISTENER_URL_THANOS_SEPOLIA
const networks = {
  local: {
    chainId: 1337,
    name: 'Local (Anvil)',
    rpcUrl: `http://${LOCAL_HOST}:8999`,
    listenerUrl: process.env.EXPO_PUBLIC_LISTENER_URL_LOCAL || `http://${LOCAL_HOST}:3001`,
    nativeCurrency: { name: 'TON', symbol: 'TON', decimals: 18 },
  },
  'thanos-sepolia': {
    chainId: 111551119090,
    name: 'Thanos Sepolia',
    rpcUrl: 'https://rpc.thanos-sepolia.tokamak.network',
    listenerUrl: process.env.EXPO_PUBLIC_LISTENER_URL_THANOS_SEPOLIA || `http://${LOCAL_HOST}:3002`,
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

export function getListenerUrl() {
  return networks[currentNetwork]?.listenerUrl || networks[DEFAULT_NETWORK].listenerUrl;
}

export { networks, DEFAULT_NETWORK };
