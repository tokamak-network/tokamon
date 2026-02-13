const API = '/api';

export async function getSpots() {
  const res = await fetch(`${API}/spots`, { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } });
  return res.json();
}

export async function createSpot(data) {
  const res = await fetch(`${API}/spots`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function redepositSpot(spotId, creatorAddress, amount) {
  const res = await fetch(`${API}/spots/${spotId}/redeposit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creator_address: creatorAddress, amount }),
  });
  return res.json();
}

export async function getClaimHistory(userAddress) {
  const res = await fetch(`${API}/claim/history?user_address=${userAddress}`);
  return res.json();
}

export async function getStampInfo(spotId, userAddress) {
  const res = await fetch(`${API}/stamps/${spotId}?user_address=${userAddress}`);
  return res.json();
}

export async function getContractInfo() {
  const res = await fetch(`${API}/contract`);
  return res.json();
}

export async function getTelegramBalance(telegramUsername) {
  const res = await fetch(`${API}/telegram/balance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ telegram_username: telegramUsername }),
  });
  return res.json();
}
