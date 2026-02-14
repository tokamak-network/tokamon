import { ethers } from 'ethers';
import { TOKAMON_ABI } from './abi/tokamon.js';

let tokamonContract = null;

/**
 * @param {string} address
 * @param {ethers.BrowserProvider} provider
 */
export function initTokamon(address, provider) {
  if (!address || !provider) return null;
  tokamonContract = new ethers.Contract(address, TOKAMON_ABI, provider);
  return tokamonContract;
}

export function getTokamonContract() {
  return tokamonContract;
}

/**
 * @param {string} userAddress
 */
export async function getBalance(userAddress) {
  if (!tokamonContract) return 0n;
  return tokamonContract.getBalance(userAddress);
}

/**
 * @param {bigint|number} spotId
 */
export async function getSpot(spotId) {
  if (!tokamonContract) return null;
  try {
    return await tokamonContract.getSpot(spotId);
  } catch {
    return null;
  }
}

/**
 * @param {bigint|number} spotId
 * @param {string} userAddress
 */
export async function getStampInfo(spotId, userAddress) {
  if (!tokamonContract) return { stamps: 0n, goal: 0n, lastClaim: 0n, cooldownRemaining: 0n };
  try {
    return await tokamonContract.getStampInfo(spotId, userAddress);
  } catch {
    return { stamps: 0n, goal: 0n, lastClaim: 0n, cooldownRemaining: 0n };
  }
}

export async function getNextSpotId() {
  if (!tokamonContract) return 0n;
  return tokamonContract.nextSpotId();
}

/**
 * @param {ethers.Signer} signer
 * @param {bigint|number} spotId
 */
export async function claimSelf(signer, spotId) {
  if (!tokamonContract) throw new Error('Tokamon이 초기화되지 않았습니다.');
  const contractWithSigner = tokamonContract.connect(signer);
  const tx = await contractWithSigner.claimSelf(spotId);
  await tx.wait();
}

/**
 * @param {ethers.Signer} signer
 * @param {bigint|string} amountWei
 */
export async function depositSelf(signer, amountWei) {
  if (!tokamonContract) throw new Error('Tokamon이 초기화되지 않았습니다.');
  const contractWithSigner = tokamonContract.connect(signer);
  const tx = await contractWithSigner.depositSelf({ value: amountWei });
  await tx.wait();
}

/**
 * @param {ethers.Signer} signer
 * @param {object} params
 */
export async function createSpotSelf(signer, params) {
  if (!tokamonContract) throw new Error('Tokamon이 초기화되지 않았습니다.');
  const spotIdBefore = await getNextSpotId();
  const meta = {
    name: params.name || 'My Spot',
    description: params.description || '',
    lat: params.lat ?? 0,
    lng: params.lng ?? 0,
    startTime: params.startTime || 0,
    endTime: params.endTime || 0,
  };
  const contractWithSigner = tokamonContract.connect(signer);
  const tx = await contractWithSigner.createSpotSelf(
    params.reward,
    params.stampGoal,
    params.stampBonus,
    params.cooldown ?? 60,
    params.allowDuplicateClaims ?? false,
    meta,
    { value: params.depositAmt },
  );
  await tx.wait();
  return spotIdBefore;
}
