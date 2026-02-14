/**
 * Faucet 컨트랙트 ABI (getEth, getTon)
 */
export const FAUCET_ABI = [
  'function getEth() external',
  'function getTon() external',
  'function getBalance() view returns (uint256)',
  'function ETH_AMOUNT() view returns (uint256)',
  'function TON_AMOUNT() view returns (uint256)',
];
