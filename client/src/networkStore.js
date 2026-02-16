import { networks, DEFAULT_NETWORK } from '../../shared/networks';

const STORAGE_KEY = 'tokamon_network';

let currentNetwork = localStorage.getItem(STORAGE_KEY) || DEFAULT_NETWORK;
// 유효한 네트워크인지 확인
if (!networks[currentNetwork]) {
  currentNetwork = DEFAULT_NETWORK;
}

const listeners = new Set();

export function getSelectedNetwork() {
  return currentNetwork;
}

export function setSelectedNetwork(networkId) {
  if (!networks[networkId]) {
    throw new Error(`Unknown network: ${networkId}`);
  }
  currentNetwork = networkId;
  localStorage.setItem(STORAGE_KEY, networkId);
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
