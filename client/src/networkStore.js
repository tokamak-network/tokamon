import { networks, DEFAULT_NETWORK } from '../../shared/networks';

const STORAGE_KEY = 'tokamon_network';

// localhost가 아니면 dev 네트워크 차단
const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
function isAvailable(id) {
  return networks[id] && (isLocal || !networks[id].dev);
}

let currentNetwork = localStorage.getItem(STORAGE_KEY) || DEFAULT_NETWORK;
// 유효한 네트워크인지 확인 (프로덕션에서 dev 네트워크 폴백)
if (!isAvailable(currentNetwork)) {
  currentNetwork = DEFAULT_NETWORK;
}

const listeners = new Set();

export function getSelectedNetwork() {
  return currentNetwork;
}

export function setSelectedNetwork(networkId) {
  if (!isAvailable(networkId)) {
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
  return Object.entries(networks)
    .filter(([id]) => isAvailable(id))
    .map(([id, net]) => ({ id, ...net }));
}

export function getNetworkByChainId(chainId) {
  for (const [id, net] of Object.entries(networks)) {
    if (net.chainId === chainId && isAvailable(id)) return { id, ...net };
  }
  return null;
}

export function onNetworkChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
