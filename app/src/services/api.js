const API_URL = __DEV__ ? 'http://localhost:3001' : 'https://api.tokamon.app';

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
