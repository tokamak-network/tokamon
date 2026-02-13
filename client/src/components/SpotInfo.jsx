import React, { useState, useEffect } from 'react';
import { getStampInfo } from '../api';
import { redepositSelf, claimSelf } from '../contract';

function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatCooldown(seconds) {
  if (seconds <= 0) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}시간 ${m}분`;
  return `${m}분`;
}

export default function SpotInfo({ spot, userPos, wallet, role, onRedeposited, onConnectWallet }) {
  const [stampInfo, setStampInfo] = useState(null);
  const [redepositAmount, setRedepositAmount] = useState('');
  const [showRedeposit, setShowRedeposit] = useState(false);

  useEffect(() => {
    if (!spot || !wallet) {
      setStampInfo(null);
      return;
    }
    getStampInfo(spot.id, wallet).then(setStampInfo).catch(() => {});
  }, [spot, wallet]);

  if (!spot) return null;

  const distance = userPos
    ? Math.round(haversineDistance(userPos.lat, userPos.lng, spot.lat, spot.lng))
    : null;

  const cooldownLeft = stampInfo?.cooldown_remaining || 0;
  const isOnCooldown = cooldownLeft > 0;
  const isExhausted = spot.remaining < spot.reward;
  const isOwner = wallet && spot.creator_address?.toLowerCase() === wallet?.toLowerCase();

  const stamps = stampInfo?.stamps || 0;
  const stampGoal = spot.stamp_goal || 1;
  const stampPercent = Math.min((stamps / stampGoal) * 100, 100);

  const [redepositing, setRedepositing] = useState(false);
  const [claiming, setClaiming] = useState(false);

  const canClaim = wallet && !isOwner && !isExhausted && !isOnCooldown && spot.active;
  const COLLECT_RADIUS = 50;

  const handleClaim = async () => {
    if (!canClaim || !wallet) return;
    if (distance !== null && distance > COLLECT_RADIUS) {
      alert(`${distance}m - 너무 멀어요. ${COLLECT_RADIUS}m 이내에서 클레임해주세요.`);
      return;
    }
    setClaiming(true);
    try {
      const result = await claimSelf(spot.id);
      const total = result.reward + result.bonus;
      alert(`${total} TON 적립 완료!`);
      onRedeposited?.();
    } catch (err) {
      alert(err.reason || err.message || '클레임 실패');
    } finally {
      setClaiming(false);
    }
  };

  const handleRedeposit = async () => {
    const amount = Number(redepositAmount);
    if (!amount || amount <= 0) return;
    setRedepositing(true);
    try {
      await redepositSelf(spot.id, amount);
      setShowRedeposit(false);
      setRedepositAmount('');
      onRedeposited();
    } catch (err) {
      alert(err.reason || err.message || '재예치 실패');
    } finally {
      setRedepositing(false);
    }
  };

  return (
    <div className="spot-info">
      <div className="name">{spot.name}</div>
      {spot.description && <div className="detail">{spot.description}</div>}
      <div className="detail">
        {spot.start_time}~{spot.end_time}
        {distance !== null && ` | ${distance}m`}
      </div>
      <div className="detail" style={{ color: '#fbbf24' }}>
        보상: {spot.reward} TON | 남은 TON: {spot.remaining}
      </div>

      {/* Stamp progress - only show when wallet connected */}
      {wallet && (
        <div className="stamp-section">
          <div className="stamp-label">
            스탬프 {stamps}/{stampGoal}
            {spot.stamp_bonus > 0 && (
              <span className="stamp-bonus-label"> (달성 시 +{spot.stamp_bonus} TON)</span>
            )}
          </div>
          <div className="stamp-bar">
            <div className="stamp-fill" style={{ width: `${stampPercent}%` }} />
          </div>
          {isOnCooldown && (
            <div className="cooldown-text">
              다음 클레임까지 {formatCooldown(cooldownLeft)}
            </div>
          )}
        </div>
      )}

      <div className={`status ${spot.active && !isExhausted ? 'active' : 'inactive'}`}>
        {isExhausted ? 'TON 소진' : spot.active ? '활성중' : '비활성'}
      </div>

      {/* 고객 클레임 버튼 - 지갑 연결, 스팟 소유자 아님, 활성, 쿨다운 아님 */}
      {canClaim && (
        <div style={{ marginTop: 12 }}>
          <button
            className="primary"
            onClick={handleClaim}
            disabled={claiming}
          >
            {claiming ? 'MetaMask 승인 대기...' : `${spot.reward} TON 받기`}
          </button>
        </div>
      )}

      {/* Owner redeposit - only show for owner role when wallet connected and is actual owner */}
      {role === 'owner' && isOwner && (
        <div style={{ marginTop: 12 }}>
          {!showRedeposit ? (
            <button className="secondary" onClick={() => setShowRedeposit(true)}>
              TON 재예치
            </button>
          ) : (
            <div className="redeposit-form">
              <input
                type="number"
                placeholder="추가 예치할 TON"
                value={redepositAmount}
                onChange={(e) => setRedepositAmount(e.target.value)}
                min="0.1"
                step="0.1"
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button className="primary" onClick={handleRedeposit} disabled={redepositing} style={{ flex: 1 }}>
                  {redepositing ? 'MetaMask 승인 대기...' : '재예치'}
                </button>
                <button className="secondary" onClick={() => setShowRedeposit(false)} disabled={redepositing} style={{ flex: 1, marginTop: 0 }}>
                  취소
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
