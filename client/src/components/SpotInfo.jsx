import React, { useState, useEffect } from 'react';
import { getStampInfo } from '../api';
import { redepositSelf, claimSelf } from '../contract';
import { Spinner } from './Spinner';
import { t } from '../translations';

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

function formatCooldown(seconds, language) {
  if (seconds <= 0) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}${t(language, 'hoursUnit')} ${m}${t(language, 'minutesUnit')}`;
  return `${m}${t(language, 'minutesUnit')}`;
}

export default function SpotInfo({ spot, userPos, wallet, role, language = 'ko', onRedeposited, onConnectWallet, showToast }) {
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
      showToast?.('warning', `${distance}m - ${t(language, 'tooFarToClaim').replace('{radius}', COLLECT_RADIUS)}`);
      return;
    }
    setClaiming(true);
    try {
      const result = await claimSelf(spot.id);
      const total = result.reward + result.bonus;
      showToast?.('success', `${total} ${t(language, 'claimSuccess')}`);
      onRedeposited?.();
    } catch (err) {
      showToast?.('error', err.reason || err.message || t(language, 'claimFailed'));
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
      showToast?.('success', `${amount} ${t(language, 'redepositDone')}`);
      setShowRedeposit(false);
      setRedepositAmount('');
      onRedeposited();
    } catch (err) {
      showToast?.('error', err.reason || err.message || t(language, 'redepositFail'));
    } finally {
      setRedepositing(false);
    }
  };

  return (
    <div className="spot-info">
      <div className="name">{spot.name}</div>
      {spot.description && <div className="detail">{spot.description}</div>}
      <div className="detail">
        {spot.start_time || spot.end_time
          ? `${spot.start_time ? new Date(spot.start_time * 1000).toLocaleString() : ''} ~ ${spot.end_time ? new Date(spot.end_time * 1000).toLocaleString() : ''}`
          : t(language, 'alwaysActive')}
        {distance !== null && ` | ${distance}m`}
      </div>
      <div className="detail" style={{ color: '#fbbf24' }}>
        {t(language, 'rewardLabel')}: {spot.reward} TON | {t(language, 'remainingTONLabel')}: {spot.remaining}
      </div>

      {/* Stamp progress - only show when wallet connected */}
      {wallet && (
        <div className="stamp-section">
          <div className="stamp-label">
            {t(language, 'stampProgress')} {stamps}/{stampGoal}
            {spot.stamp_bonus > 0 && (
              <span className="stamp-bonus-label"> ({t(language, 'stampBonusOnGoal')} +{spot.stamp_bonus} TON)</span>
            )}
          </div>
          <div className="stamp-bar">
            <div className="stamp-fill" style={{ width: `${stampPercent}%` }} />
          </div>
          {isOnCooldown && (
            <div className="cooldown-text">
              {t(language, 'nextClaimIn')} {formatCooldown(cooldownLeft, language)}
            </div>
          )}
        </div>
      )}

      <div className={`status ${spot.active && !isExhausted ? 'active' : 'inactive'}`}>
        {isExhausted ? t(language, 'tonExhausted') : spot.active ? t(language, 'activeStatus') : t(language, 'inactive')}
      </div>

      {/* 고객 클레임 버튼 - 지갑 연결, 스팟 소유자 아님, 활성, 쿨다운 아님 */}
      {canClaim && (
        <div style={{ marginTop: 12 }}>
          <button
            className="primary btn-with-spinner"
            onClick={handleClaim}
            disabled={claiming}
          >
            {claiming && <Spinner size={16} />}
            {claiming ? t(language, 'waitingForMetaMask') : `${spot.reward} ${t(language, 'getTONButton')}`}
          </button>
        </div>
      )}

      {/* Owner redeposit - only show for owner role when wallet connected and is actual owner */}
      {role === 'owner' && isOwner && (
        <div style={{ marginTop: 12 }}>
          {!showRedeposit ? (
            <button className="secondary" onClick={() => setShowRedeposit(true)}>
              {t(language, 'redepositTON')}
            </button>
          ) : (
            <div className="redeposit-form">
              <input
                type="number"
                placeholder={t(language, 'additionalTON')}
                value={redepositAmount}
                onChange={(e) => setRedepositAmount(e.target.value)}
                min="0.1"
                step="0.1"
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button className="primary btn-with-spinner" onClick={handleRedeposit} disabled={redepositing} style={{ flex: 1 }}>
                  {redepositing && <Spinner size={16} />}
                  {redepositing ? t(language, 'waitingForMetaMask') : t(language, 'redeposit')}
                </button>
                <button className="secondary" onClick={() => setShowRedeposit(false)} disabled={redepositing} style={{ flex: 1, marginTop: 0 }}>
                  {t(language, 'cancel')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
