import { ethers } from 'ethers';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WALLETCONNECT_PROJECT_ID } from '../utils/constants';

let wcProvider = null;
let ethersProvider = null;
let ethersSigner = null;
let connectedAddress = null;

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
 * Initialize WalletConnect and attempt to restore previous session
 */
export async function initWallet() {
  try {
    const saved = await AsyncStorage.getItem('wallet_address');
    if (saved) {
      connectedAddress = saved;
      notifyListeners();
    }
  } catch {
    // ignore
  }
}

/**
 * Connect wallet via WalletConnect
 * In production, the WalletConnectModal component in the UI handles the flow.
 * This function is a placeholder — call setConnectedWallet() after modal connection.
 */
export async function connectWallet() {
  throw new Error('Use WalletConnect modal component for connection');
}

/**
 * Set the connected wallet address (called from WalletConnect modal callback)
 */
export async function setConnectedWallet(address, provider, signer) {
  connectedAddress = address;
  ethersProvider = provider;
  ethersSigner = signer;
  await AsyncStorage.setItem('wallet_address', address);
  notifyListeners();
}

/**
 * Disconnect wallet
 */
export async function disconnectWallet() {
  connectedAddress = null;
  ethersProvider = null;
  ethersSigner = null;
  wcProvider = null;
  await AsyncStorage.removeItem('wallet_address');
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
