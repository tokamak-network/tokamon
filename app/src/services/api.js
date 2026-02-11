import { Platform } from 'react-native';

const DEV_HOST = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
const API_URL = __DEV__ ? `http://${DEV_HOST}:3001` : 'https://api.tokamon.app';

export async function getSpots() {
  const res = await fetch(`${API_URL}/api/spots`);
  return res.json();
}

export async function createSpot(data) {
  const res = await fetch(`${API_URL}/api/spots`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function requestClaim(userAddress, spotId, lat, lng) {
  const res = await fetch(`${API_URL}/api/claim/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_address: userAddress, spot_id: spotId, lat, lng }),
  });
  return res.json();
}

export async function getClaimHistory(userAddress) {
  const res = await fetch(`${API_URL}/api/claim/history?user_address=${userAddress}`);
  return res.json();
}

export async function requestDeviceClaim(deviceId, spotId, lat, lng) {
  const res = await fetch(`${API_URL}/api/device/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_id: deviceId, spot_id: spotId, lat, lng }),
  });
  return res.json();
}

export async function getDeviceBalance(deviceId) {
  const res = await fetch(`${API_URL}/api/device/balance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_id: deviceId }),
  });
  return res.json();
}

export async function getDeviceClaimHistory(deviceId) {
  const res = await fetch(`${API_URL}/api/device/claim-history`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_id: deviceId }),
  });
  return res.json();
}

export async function getSpotClaimHistory(spotId) {
  const res = await fetch(`${API_URL}/api/claim/history?spot_id=${spotId}`);
  return res.json();
}

export async function redepositSpot(spotId, amount, wallet) {
  const res = await fetch(`${API_URL}/api/spots/${spotId}/redeposit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount, wallet }),
  });
  return res.json();
}

export async function updateSpotCooldown(spotId, cooldownSeconds, wallet) {
  const res = await fetch(`${API_URL}/api/spots/${spotId}/cooldown`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cooldown: cooldownSeconds, wallet }),
  });
  return res.json();
}

export async function kioskCheckBalance(telegramUsername) {
  const res = await fetch(`${API_URL}/api/kiosk/balance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ telegram_username: telegramUsername }),
  });
  return res.json();
}

export async function kioskClaim(telegramUsername, spotId, lat, lng) {
  const res = await fetch(`${API_URL}/api/kiosk/telegram-claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      telegram_username: telegramUsername,
      spot_id: spotId,
      lat,
      lng,
    }),
  });
  return res.json();
}
