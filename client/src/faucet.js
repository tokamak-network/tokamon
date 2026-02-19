import { getSelectedNetwork } from './networkStore.js';
import { getWalletProvider } from './walletProvider.js';
import { ethers } from 'ethers';

const API = '';

function withNetwork(url) {
  const networkId = getSelectedNetwork();
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}network=${networkId}`;
}

/** 캐시 초기화 (호환용) */
export function resetFaucetCache() {}

/** Faucet 잔액 사전 체크 (서버 API) */
export async function checkFaucetBalance() {
  // 서버 EOA 방식이므로 별도 체크 불필요
}

/** 서버 API를 통해 ETH 받기 */
export async function getETH() {
  const prov = getWalletProvider();
  if (!prov) throw new Error('지갑이 연결되어 있지 않습니다');
  const provider = new ethers.BrowserProvider(prov);
  const signer = await provider.getSigner();
  const address = await signer.getAddress();

  const res = await fetch(withNetwork(`${API}/api/faucet/eth`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address }),
  });

  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'ETH faucet failed');
  }
}

/** 하위호환 */
export function initFaucet() {}

/** 하위호환 */
export async function requestEth() {
  await getETH();
}
