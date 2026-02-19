import React, { useState, useEffect } from 'react';
import { redepositSelf, getStampInfoFromContract } from '../contract';
import { Spinner } from './Spinner';
import { t } from '../translations';
import { isWithinActiveTime, isSpotClosed } from '../spotUtils';

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

export default function SpotInfo({ spot, userPos, wallet, role, language = 'ko', onRedeposited, onConnectWallet, onClose, showToast }) {
  const [stampInfo, setStampInfo] = useState(null);
  const [redepositAmount, setRedepositAmount] = useState('');
  const [showRedeposit, setShowRedeposit] = useState(false);

  useEffect(() => {
    if (!spot || !wallet) {
      setStampInfo(null);
      return;
    }
    getStampInfoFromContract(spot.id, wallet).then(setStampInfo).catch((err) => {
      console.error('[SpotInfo] getStampInfo 실패:', err);
    });
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

  const COLLECT_RADIUS = 15;

  const handleRedeposit = async () => {
    const amount = Number(redepositAmount);
    if (!amount || amount <= 0) {
      showToast?.('warning', t(language, 'enterValidAmount'));
      return;
    }
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
    <div className="spot-info" style={{ position: 'relative' }}>
      {onClose && (
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: 0, right: 0,
            background: 'none', border: 'none', color: '#888', fontSize: '20px',
            cursor: 'pointer', padding: '0 4px', lineHeight: 1,
          }}
        >
          ✕
        </button>
      )}
      <div className="name">{spot.name}</div>
      {spot.description && <div className="detail">{spot.description}</div>}
      <div className="detail">
        {(() => {
          const utc = spot.utc_offset || 0;
          const utcLabel = ` (UTC${utc >= 0 ? '+' : ''}${utc})`;
          // UTC 정규화 날짜이므로 UTC 기준으로 표시
          const fmtDate = (ts) => {
            const d = new Date(ts * 1000);
            return `${d.getUTCFullYear()}.${d.getUTCMonth() + 1}.${d.getUTCDate()}`;
          };
          const datePart = spot.start_time || spot.end_time
            ? `${spot.start_time ? fmtDate(spot.start_time) : ''} ~ ${spot.end_time ? fmtDate(spot.end_time) : ''}${utcLabel}`
            : t(language, 'alwaysActive');
          const dailyPart = (spot.daily_start_time > 0 || spot.daily_end_time > 0)
            ? ` | ${String(Math.floor(spot.daily_start_time / 60)).padStart(2, '0')}:${String(spot.daily_start_time % 60).padStart(2, '0')}~${String(Math.floor(spot.daily_end_time / 60)).padStart(2, '0')}:${String(spot.daily_end_time % 60).padStart(2, '0')}`
            : '';
          return datePart + dailyPart;
        })()}
      </div>
      <div className="detail" style={{ color: '#fbbf24' }}>
        {t(language, 'rewardLabel')}: {spot.reward} TON | {t(language, 'remainingTONLabel')}: {spot.remaining}
        {distance !== null && <span style={{ color: '#94a3b8', marginLeft: 8 }}>📍 {distance}m</span>}
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
        </div>
      )}

      <div className={`status ${isExhausted || isSpotClosed(spot) ? 'inactive' : isWithinActiveTime(spot) ? 'active' : 'inactive'}`}>
        {isExhausted ? t(language, 'tonExhausted') : isSpotClosed(spot) ? t(language, 'closedStatus') : isWithinActiveTime(spot) ? t(language, 'activeStatus') : t(language, 'outsideActiveTime')}
      </div>

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
