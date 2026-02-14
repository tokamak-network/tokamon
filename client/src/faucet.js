import { ethers } from 'ethers';
import { FAUCET_ABI } from './abi/faucet.js';
import { getWalletProvider } from './walletProvider.js';

let faucetContract = null;

/** contract-address.json 또는 /api/contract 에서 faucet 주소 로드 후 초기화 */
async function ensureFaucetInited(provider) {
  if (faucetContract) return;
  let faucetAddress = null;
  try {
    const res = await fetch('/contract-address.json', { cache: 'no-store' });
    const config = await res.json();
    faucetAddress = config.faucet || null;
  } catch {
    try {
      const apiRes = await fetch('/api/contract');
      const apiConfig = await apiRes.json();
      faucetAddress = apiConfig.faucet || null;
    } catch {
      // ignore
    }
  }
  if (faucetAddress && provider) initFaucet(faucetAddress, provider);
}

/** tokamon App.jsx 호환: 캐시 초기화 (no-op) */
export function resetFaucetCache() {}

/** tokamon App.jsx 호환: ETH(네이티브 TON) 받기 */
export async function getETH() {
  const prov = getWalletProvider();
  if (!prov) throw new Error('지갑이 연결되어 있지 않습니다');
  const provider = new ethers.BrowserProvider(prov);
  await ensureFaucetInited(provider);
  if (!faucetContract) throw new Error('Faucet 주소가 설정되지 않았습니다. contract-address.json을 확인하세요.');
  const signer = await provider.getSigner();
  await requestEth(signer);
}

/**
 * @param {string} faucetAddress
 * @param {ethers.BrowserProvider} provider
 */
export function initFaucet(faucetAddress, provider) {
  if (!faucetAddress || !provider) return null;
  faucetContract = new ethers.Contract(faucetAddress, FAUCET_ABI, provider);
  return faucetContract;
}

export function getFaucetContract() {
  return faucetContract;
}

/**
 * @param {ethers.Signer} signer
 */
export async function requestEth(signer) {
  if (!faucetContract) throw new Error('Faucet이 초기화되지 않았습니다.');
  const contractWithSigner = faucetContract.connect(signer);
  const tx = await contractWithSigner.getEth();
  await tx.wait();
}
