import { API_BASE } from '../utils/constants';
import { getSelectedNetwork, getListenerUrl, setListenerUrl } from '../utils/networkStore';
import { getAttestationHeaders, resetAttestation } from './attestation';

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

/**
 * Device API 호출 헬퍼: attestation 헤더 자동 주입 + ATTEST_REQUIRED 자동 재시도
 */
async function deviceFetch(path, deviceId, body, { retry = true } = {}) {
  const attestHeaders = await getAttestationHeaders(deviceId, body);
  const res = await fetch(`${getListenerUrl()}/api/device${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...attestHeaders },
    body: JSON.stringify(body),
  });

  // ATTEST_REQUIRED → 재attestation 후 1회 재시도
  if (res.status === 403 && retry) {
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await res.json();
      if (data.code === 'ATTEST_REQUIRED') {
        await resetAttestation();
        return deviceFetch(path, deviceId, body, { retry: false });
      }
    }
  }

  return parseJson(res);
}

export async function getSpots({ lat, lng, limit, offset, filter } = {}) {
  let url = `${API_BASE}/spots`;
  const params = new URLSearchParams();
  if (lat != null) params.set('lat', lat);
  if (lng != null) params.set('lng', lng);
  if (limit != null) params.set('limit', limit);
  if (offset != null) params.set('offset', offset);
  if (filter) params.set('filter', filter);
  const qs = params.toString();
  if (qs) url += `?${qs}`;
  const res = await fetch(withNetwork(url), {
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
        const data = await res.json();
        // 서버에서 listenerUrl을 받으면 동적으로 설정
        if (data.listenerUrl) {
          setListenerUrl(data.listenerUrl);
        }
        return data;
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

// ─── Device API (listener-server direct, with attestation) ───

// 푸시 필요: device_id (식별) + fcm_token (푸시 전송)
export async function requestDeviceCode(deviceId, fcmToken, spotId, lat, lng) {
  return deviceFetch('/request-code', deviceId, {
    device_id: deviceId, fcm_token: fcmToken, spot_id: spotId, lat, lng,
  });
}

// 식별만: device_id
export async function verifyAndClaimDevice(deviceId, spotId, code) {
  return deviceFetch('/verify-and-claim', deviceId, {
    device_id: deviceId, spot_id: spotId, code,
  });
}

export async function getDeviceStampInfo(deviceId, spotId) {
  return deviceFetch('/stamp-info', deviceId, {
    device_id: deviceId, spot_id: spotId,
  });
}

export async function getDeviceBalance(deviceId) {
  return deviceFetch('/balance', deviceId, {
    device_id: deviceId,
  });
}

export async function getDeviceBalanceByListenerUrl(deviceId, listenerUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const body = { device_id: deviceId };
    const attestHeaders = await getAttestationHeaders(deviceId, body);
    const res = await fetch(`${listenerUrl}/api/device/balance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...attestHeaders },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return parseJson(res);
  } finally {
    clearTimeout(timeout);
  }
}

// 푸시 필요: device_id + fcm_token
export async function requestWalletLinkCode(deviceId, fcmToken, walletAddress) {
  return deviceFetch('/request-link-code', deviceId, {
    device_id: deviceId, fcm_token: fcmToken, wallet_address: walletAddress,
  });
}

export async function verifyAndLinkWallet(deviceId, walletAddress, code) {
  return deviceFetch('/verify-and-link', deviceId, {
    device_id: deviceId, wallet_address: walletAddress, code,
  });
}

