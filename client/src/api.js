import { getSelectedNetwork } from './networkStore';

const API = '/api';

// 현재 선택된 네트워크를 쿼리 파라미터로 추가
function withNetwork(url) {
  const networkId = getSelectedNetwork();
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}network=${networkId}`;
}

async function parseJson(res) {
  const contentType = res.headers.get('content-type') || '';
  if (!res.ok || !contentType.includes('application/json')) {
    const msg = contentType.includes('text/html')
      ? 'API 서버가 실행 중이 아닙니다 (HTML 응답)'
      : `API 오류: ${res.status}`;
    throw new Error(msg);
  }
  return res.json();
}

export async function getNetworks() {
  const res = await fetch(`${API}/networks`, { cache: 'no-store' });
  return parseJson(res);
}

export async function getSpots() {
  const res = await fetch(withNetwork(`${API}/spots`), { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } });
  return parseJson(res);
}

export async function createSpot(data) {
  const res = await fetch(withNetwork(`${API}/spots`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return parseJson(res);
}

export async function redepositSpot(spotId, creatorAddress, amount) {
  const res = await fetch(withNetwork(`${API}/spots/${spotId}/redeposit`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creator_address: creatorAddress, amount }),
  });
  return parseJson(res);
}

export async function getStampInfo(spotId, userAddress) {
  const res = await fetch(withNetwork(`${API}/stamps/${spotId}?user_address=${userAddress}`));
  return parseJson(res);
}

export async function getContractInfo() {
  try {
    const res = await fetch(withNetwork(`${API}/contract`), { cache: 'no-store' });
    if (res.ok) {
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        return res.json();
      }
    }
  } catch {
    // API 서버 없음 등
  }
  // 로컬 개발: contract-address.json 사용 (API 없을 때)
  const fallback = await fetch('/contract-address.json', { cache: 'no-store' });
  if (!fallback.ok) throw new Error('contract-address.json을 불러올 수 없습니다.');
  return fallback.json();
}

export async function getTelegramBalance(telegramUsername) {
  const res = await fetch(withNetwork(`${API}/telegram/balance`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ telegram_username: telegramUsername }),
  });
  return parseJson(res);
}
