import { ethers } from 'ethers';
import { getContractInfo } from './api';
import { getWalletProvider } from './walletProvider';

// Faucet ABI (getETH, getTON 함수만)
const FAUCET_ABI = [
  'function getETH() external',
  'function getTON() external',
  'function getBalance() external view returns (uint256)',
  'function getNextETHRequestTime(address user) external view returns (uint256)',
  'function getNextTONRequestTime(address user) external view returns (uint256)',
];

let cachedFaucetContract = null;
let cachedSigner = null;

async function getSignerAndFaucetContract() {
  if (cachedFaucetContract && cachedSigner) {
    return { signer: cachedSigner, contract: cachedFaucetContract };
  }

  const walletProv = getWalletProvider();
  if (!walletProv) throw new Error('지갑이 연결되어 있지 않습니다');

  const provider = new ethers.BrowserProvider(walletProv);
  const signer = await provider.getSigner();
  const { faucet } = await getContractInfo();

  if (!faucet) throw new Error('Faucet 주소를 찾을 수 없습니다');

  console.log('Faucet 컨트랙트 주소:', faucet);
  const contract = new ethers.Contract(faucet, FAUCET_ABI, signer);

  cachedSigner = signer;
  cachedFaucetContract = contract;
  return { signer, contract };
}

// 캐시 무효화 (계정 변경 시)
export function resetFaucetCache() {
  cachedFaucetContract = null;
  cachedSigner = null;
}

// ETH 받기
export async function getETH() {
  console.log('getETH() 함수 호출');
  const { contract } = await getSignerAndFaucetContract();
  console.log('Faucet 컨트랙트 연결 완료, getETH() 트랜잭션 전송 중...');
  const tx = await contract.getETH();
  console.log('트랜잭션 전송됨:', tx.hash);
  console.log('트랜잭션 대기 중...');
  const receipt = await tx.wait();
  console.log('트랜잭션 완료:', receipt);
}

// TON 받기
export async function getTON() {
  console.log('getTON() 함수 호출');
  const { contract } = await getSignerAndFaucetContract();
  console.log('Faucet 컨트랙트 연결 완료, getTON() 트랜잭션 전송 중...');
  const tx = await contract.getTON();
  console.log('트랜잭션 전송됨:', tx.hash);
  console.log('트랜잭션 대기 중...');
  const receipt = await tx.wait();
  console.log('트랜잭션 완료:', receipt);
}

// Faucet 잔액 조회
export async function getFaucetBalance() {
  const { contract } = await getSignerAndFaucetContract();
  const balance = await contract.getBalance();
  return Number(ethers.formatEther(balance));
}

// 다음 ETH 요청 가능 시간
export async function getNextETHRequestTime(userAddress) {
  const { contract } = await getSignerAndFaucetContract();
  const timestamp = await contract.getNextETHRequestTime(userAddress);
  return Number(timestamp);
}

// 다음 TON 요청 가능 시간
export async function getNextTONRequestTime(userAddress) {
  const { contract } = await getSignerAndFaucetContract();
  const timestamp = await contract.getNextTONRequestTime(userAddress);
  return Number(timestamp);
}
