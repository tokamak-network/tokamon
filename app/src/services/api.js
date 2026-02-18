import { API_BASE } from '../utils/constants';
import { getSelectedNetwork, getListenerUrl } from '../utils/networkStore';

// 현재 선택된 네트워크를 쿼리 파라미터로 추가
function withNetwork(url) {
  const networkId = getSelectedNetwork();
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}network=${networkId}`;
}

async function parseJson(res) {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error(contentType.includes('text/html')
      ? 'API server is not running (HTML response)'
      : `API error: ${res.status}`);
  }
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error || `API error: ${res.status}`);
    err.data = data;
    throw err;
  }
  return data;
}

export async function getSpots() {
  const res = await fetch(withNetwork(`${API_BASE}/spots`), {
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-cache' },
  });
  return parseJson(res);
}

export async function getStampInfo(spotId, userAddress) {
  const res = await fetch(withNetwork(`${API_BASE}/stamps/${spotId}?user_address=${userAddress}`));
  return parseJson(res);
}

export async function getContractInfo() {
  try {
    const res = await fetch(withNetwork(`${API_BASE}/contract`), { cache: 'no-store' });
    if (res.ok) {
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        return res.json();
      }
    }
  } catch {
    // API server not available
  }
  throw new Error('Cannot fetch contract info from API');
}

export async function getTelegramBalance(telegramUsername) {
  const res = await fetch(withNetwork(`${API_BASE}/telegram/balance`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ telegram_username: telegramUsername }),
  });
  return parseJson(res);
}

export async function getTelegramUsername(hash, signature) {
  const hashHex = hash.startsWith('0x') ? hash.slice(2) : hash;
  const res = await fetch(withNetwork(`${API_BASE}/telegram/username`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hash: hashHex, signature }),
  });
  return parseJson(res);
}

// ─── Device API (listener-server direct) ───

// 푸시 필요: device_id (식별) + fcm_token (푸시 전송)
export async function requestDeviceCode(deviceId, fcmToken, spotId, lat, lng) {
  const res = await fetch(`${getListenerUrl()}/api/device/request-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_id: deviceId, fcm_token: fcmToken, spot_id: spotId, lat, lng }),
  });
  return parseJson(res);
}

// 식별만: device_id
export async function verifyAndClaimDevice(deviceId, spotId, code) {
  const res = await fetch(`${getListenerUrl()}/api/device/verify-and-claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_id: deviceId, spot_id: spotId, code }),
  });
  return parseJson(res);
}

export async function getDeviceStampInfo(deviceId, spotId) {
  const res = await fetch(`${getListenerUrl()}/api/device/stamp-info`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_id: deviceId, spot_id: spotId }),
  });
  return parseJson(res);
}

export async function getDeviceBalance(deviceId) {
  const res = await fetch(`${getListenerUrl()}/api/device/balance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_id: deviceId }),
  });
  return parseJson(res);
}

export async function getDeviceBalanceByListenerUrl(deviceId, listenerUrl) {
  const res = await fetch(`${listenerUrl}/api/device/balance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_id: deviceId }),
  });
  return parseJson(res);
}

// 푸시 필요: device_id + fcm_token
export async function requestWalletLinkCode(deviceId, fcmToken, walletAddress) {
  const res = await fetch(`${getListenerUrl()}/api/device/request-link-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_id: deviceId, fcm_token: fcmToken, wallet_address: walletAddress }),
  });
  return parseJson(res);
}

export async function verifyAndLinkWallet(deviceId, walletAddress, code) {
  const res = await fetch(`${getListenerUrl()}/api/device/verify-and-link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_id: deviceId, wallet_address: walletAddress, code }),
  });
  return parseJson(res);
}

