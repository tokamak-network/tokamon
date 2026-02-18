import { ethers } from 'ethers';
import { getContractInfo } from './api';
import { getSigner, getProvider } from './wallet';
import { COORD_SCALE, TOKAMON_ABI } from '../utils/constants';

let cachedContract = null;
let cachedReadContract = null;

async function getSignerAndContract() {
  if (cachedContract) return cachedContract;

  const signer = getSigner();
  if (!signer) throw new Error('Wallet not connected');

  const { address } = await getContractInfo();
  const contract = new ethers.Contract(address, TOKAMON_ABI, signer);

  cachedContract = contract;
  return contract;
}

async function getReadContract() {
  if (cachedReadContract) return cachedReadContract;

  const provider = getProvider();
  if (!provider) throw new Error('Provider not available');

  const { address } = await getContractInfo();
  const contract = new ethers.Contract(address, TOKAMON_ABI, provider);

  cachedReadContract = contract;
  return contract;
}

// Reset cache on wallet change
export function resetContractCache() {
  cachedContract = null;
  cachedReadContract = null;
}

// Get native TON balance
export async function getBalance(address) {
  try {
    const provider = getProvider();
    if (!provider) return 0;
    const bal = await provider.getBalance(address);
    return Number(ethers.formatEther(bal));
  } catch (error) {
    console.error('Error getting TON balance:', error);
    return 0;
  }
}

// Get telegram balance via contract
export async function getTelegramBalanceContract(telegramHash) {
  const contract = await getSignerAndContract();
  const bal = await contract.getTelegramBalance(telegramHash);
  return Number(ethers.formatEther(bal));
}

// Get linked telegram hash for wallet
export async function getWalletLinkedTelegram(address) {
  const contract = await getSignerAndContract();
  const telegramHash = await contract.getWalletLinkedTelegram(address);
  return telegramHash;
}

// Claim telegram balance to wallet
export async function claimTelegramToWallet(telegramHash) {
  const contract = await getSignerAndContract();
  const tx = await contract.claimTelegramToWallet(telegramHash);
  await tx.wait();
}

// Get stamp info for a spot and user
export async function getStampInfoContract(spotId, userAddress) {
  const contract = await getSignerAndContract();
  const info = await contract.getStampInfo(spotId, userAddress);
  return {
    stamps: Number(info.stamps || info[0]),
    goal: Number(info.goal || info[1]),
    lastClaim: Number(info.lastClaim || info[2]),
    cooldownRemaining: Number(info.cooldownRemaining || info[3]),
  };
}

// Get device balance via contract
export async function getDeviceBalanceContract(deviceHash) {
  const contract = await getSignerAndContract();
  const bal = await contract.getDeviceBalance(deviceHash);
  return Number(ethers.formatEther(bal));
}

// Get linked device hash for wallet
export async function getWalletLinkedDevice(address) {
  const contract = await getSignerAndContract();
  const deviceHash = await contract.getWalletLinkedDevice(address);
  return deviceHash;
}

// Claim device balance to wallet
export async function claimDeviceToWalletContract(deviceHash) {
  const contract = await getSignerAndContract();
  const tx = await contract.claimDeviceToWallet(deviceHash);
  await tx.wait();
}

// Get spots from chain (fallback when API unavailable)
export async function getSpotsFromChain() {
  try {
    const contract = await getReadContract();
    const nextId = await contract.nextSpotId();
    const list = [];
    for (let id = 1; id < Number(nextId); id++) {
      try {
        const s = await contract.getSpot(id);
        const reward = s.reward ?? s[5];
        if (!s || reward === 0n) continue;
        const lat = Number(s.lat ?? s[7]) / COORD_SCALE;
        const lng = Number(s.lng ?? s[8]) / COORD_SCALE;
        list.push({
          id,
          creator_address: (s.creator ?? s[0]) ? ethers.getAddress(String(s.creator ?? s[0])) : null,
          reward: Number(ethers.formatEther(reward)),
          remaining: Number(ethers.formatEther(s.remaining ?? s[6])),
          stamp_goal: Number(s.stampGoal ?? s[3]),
          stamp_bonus: Number(ethers.formatEther(s.stampBonus ?? s[4])),
          cooldown: Number(s.cooldown ?? s[2]),
          allow_duplicate_claims: s.allowDuplicateClaims ?? s[1],
          name: (s.name ?? s[14])?.trim() || `Spot ${id}`,
          description: (s.description ?? s[15]) ? String(s.description ?? s[15]) : '',
          lat: Number.isNaN(lat) ? 0 : lat,
          lng: Number.isNaN(lng) ? 0 : lng,
          start_time: Number(s.startDate ?? s[9]),
          end_time: Number(s.endDate ?? s[10]),
          daily_start_time: Number(s.dailyStartTime ?? s[11] ?? 0),
          daily_end_time: Number(s.dailyEndTime ?? s[12] ?? 0),
          utc_offset: Number(s.utcOffset ?? s[13] ?? 0),
        });
      } catch {
        // skip
      }
    }
    return list;
  } catch (error) {
    console.error('getSpotsFromChain error:', error);
    return [];
  }
}
