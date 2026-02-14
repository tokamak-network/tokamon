export function hasMetaMask() {
  return typeof window !== 'undefined' && !!window.ethereum;
}

export async function connectWallet() {
  if (!hasMetaMask()) {
    throw new Error('MetaMask가 설치되어 있지 않습니다.');
  }

  const accounts = await window.ethereum.request({
    method: 'eth_requestAccounts',
  });

  if (!accounts?.length) {
    throw new Error('계정 연결이 취소되었습니다.');
  }

  return accounts[0];
}

export async function getConnectedAddress() {
  if (!hasMetaMask()) return null;

  const accounts = await window.ethereum.request({
    method: 'eth_accounts',
  });

  return accounts?.[0] ?? null;
}

export function onAccountChange(callback) {
  if (!hasMetaMask()) return () => {};

  const handler = (accounts) => {
    callback(accounts?.[0] ?? null);
  };

  window.ethereum.on('accountsChanged', handler);

  return () => {
    window.ethereum.removeListener('accountsChanged', handler);
  };
}
