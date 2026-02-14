/**
 * Faucet 컨트랙트 ABI (getEth — 네이티브 TON 지급)
 */
export const FAUCET_ABI = [
  'function getEth() external',
  'function getBalance() view returns (uint256)',
  'function AMOUNT() view returns (uint256)',
];
