import { ethers } from 'ethers';
import { FAUCET_ABI } from './abi/faucet.js';
import { getWalletProvider } from './walletProvider.js';
import { getSelectedNetwork } from './networkStore.js';

let faucetAddress = null;

/** contract-address.json 또는 /api/contract 에서 faucet 주소 로드 */
async function ensureFaucetAddress() {
  if (faucetAddress) return;
  try {
    const res = await fetch('/contract-address.json', { cache: 'no-store' });
    const config = await res.json();
    faucetAddress = config.faucet || null;
  } catch {
    try {
      const apiRes = await fetch(`/api/contract?network=${getSelectedNetwork()}`);
      const apiConfig = await apiRes.json();
      faucetAddress = apiConfig.faucet || null;
    } catch {
      // ignore
    }
  }
}

/** 현재 provider로 Faucet 컨트랙트 인스턴스 생성 */
function getFaucetContract(provider) {
  if (!faucetAddress || !provider) return null;
  return new ethers.Contract(faucetAddress, FAUCET_ABI, provider);
}

/** tokamon App.jsx 호환: 캐시 초기화 */
export function resetFaucetCache() {
  faucetAddress = null;
}

/** Faucet 잔액 사전 체크 — 부족하면 throw */
export async function checkFaucetBalance() {
  const prov = getWalletProvider();
  if (!prov) throw new Error('지갑이 연결되어 있지 않습니다');
  const provider = new ethers.BrowserProvider(prov);
  await ensureFaucetAddress();
  const contract = getFaucetContract(provider);
  if (!contract) throw new Error('Faucet 주소가 설정되지 않았습니다.');
  const balance = await contract.getBalance();
  const amount = await contract.AMOUNT();
  if (balance < amount) {
    throw new Error('Faucet에 잔액이 부족합니다. 관리자에게 문의하세요.');
  }
}

/** tokamon App.jsx 호환: ETH(네이티브 TON) 받기 */
export async function getETH() {
  const prov = getWalletProvider();
  if (!prov) throw new Error('지갑이 연결되어 있지 않습니다');
  const provider = new ethers.BrowserProvider(prov);
  await ensureFaucetAddress();
  const contract = getFaucetContract(provider);
  if (!contract) throw new Error('Faucet 주소가 설정되지 않았습니다.');
  const signer = await provider.getSigner();
  const contractWithSigner = contract.connect(signer);
  const tx = await contractWithSigner.getEth();
  await tx.wait();
}

/** 하위호환: initFaucet */
export function initFaucet(addr) {
  faucetAddress = addr;
}

/** 하위호환: app.js에서 사용 */
export async function requestEth(signer) {
  await ensureFaucetAddress();
  const contract = new ethers.Contract(faucetAddress, FAUCET_ABI, signer);
  const tx = await contract.getEth();
  await tx.wait();
}
