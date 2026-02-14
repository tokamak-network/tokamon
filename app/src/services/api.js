import { API_BASE } from '../utils/constants';

async function parseJson(res) {
  const contentType = res.headers.get('content-type') || '';
  if (!res.ok || !contentType.includes('application/json')) {
    const msg = contentType.includes('text/html')
      ? 'API server is not running (HTML response)'
      : `API error: ${res.status}`;
    throw new Error(msg);
  }
  return res.json();
}

export async function getSpots() {
  const res = await fetch(`${API_BASE}/spots`, {
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-cache' },
  });
  return parseJson(res);
}

export async function getClaimHistory(userAddress) {
  const res = await fetch(`${API_BASE}/claim/history?user_address=${userAddress}`);
  return parseJson(res);
}

export async function getStampInfo(spotId, userAddress) {
  const res = await fetch(`${API_BASE}/stamps/${spotId}?user_address=${userAddress}`);
  return parseJson(res);
}

export async function getContractInfo() {
  try {
    const res = await fetch(`${API_BASE}/contract`, { cache: 'no-store' });
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
  const res = await fetch(`${API_BASE}/telegram/balance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ telegram_username: telegramUsername }),
  });
  return parseJson(res);
}

export async function getTelegramLinked(account) {
  const res = await fetch(`${API_BASE}/telegram/linked/${account}`);
  return parseJson(res);
}
