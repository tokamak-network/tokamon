let currentProvider = null;

export function setWalletProvider(provider) {
  currentProvider = provider;
}

export function getWalletProvider() {
  if (currentProvider) return currentProvider;
  if (typeof window !== 'undefined' && window.ethereum) return window.ethereum;
  return null;
}
