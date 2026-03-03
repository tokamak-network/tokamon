import { ethers } from 'ethers';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getNetworkConfig } from '../utils/networkStore';

let ethersProvider = null;
let ethersSigner = null;
let connectedAddress = null;
let connectionType = null; // 'privatekey'

// Event listeners
const listeners = new Set();

export function onWalletChange(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function notifyListeners() {
  listeners.forEach((cb) => cb(connectedAddress));
}

/**
 * Initialize wallet - restore previous session
 */
export async function initWallet() {
  try {
    const saved = await AsyncStorage.getItem('wallet_address');
    const type = await AsyncStorage.getItem('wallet_type');
    if (saved) {
      connectedAddress = saved;
      connectionType = type || null;
      notifyListeners();
    }
  } catch {
    // ignore
  }
}

/**
 * Set wallet from private key (dev/advanced)
 */
export async function setConnectedWallet(address, provider, signer) {
  connectedAddress = address;
  ethersProvider = provider;
  ethersSigner = signer;
  connectionType = 'privatekey';

  await AsyncStorage.setItem('wallet_address', address);
  await AsyncStorage.setItem('wallet_type', 'privatekey');
  notifyListeners();
}

/**
 * Disconnect wallet
 */
export async function disconnectWallet() {
  connectedAddress = null;
  ethersProvider = null;
  ethersSigner = null;
  connectionType = null;
  await AsyncStorage.removeItem('wallet_address');
  await AsyncStorage.removeItem('wallet_type');
  notifyListeners();
}

/**
 * Get the current connected address
 */
export function getAddress() {
  return connectedAddress;
}

/**
 * Get ethers provider
 */
export function getProvider() {
  return ethersProvider;
}

/**
 * Get ethers signer
 */
export function getSigner() {
  return ethersSigner;
}

/**
 * Check if wallet is connected
 */
export function isConnected() {
  return !!connectedAddress;
}

/**
 * Get connection type
 */
export function getConnectionType() {
  return connectionType;
}
