import React, { useState } from 'react';
import { redepositSelf, updateCooldown, updateAllowDuplicateClaims, getSpotClaimHistory } from '../contract';
import { t } from '../translations';

export default function OwnerDashboard({ spots, wallet, balance, onConnectWallet, onRedeposited, language = 'ko' }) {
  const [selectedSpotId, setSelectedSpotId] = useState(null);
  const [redepositSpotId, setRedepositSpotId] = useState(null);
  const [redepositAmount, setRedepositAmount] = useState('');
  const [redepositing, setRedepositing] = useState(false);
  const [cooldownSpotId, setCooldownSpotId] = useState(null);
  const [cooldownSeconds, setCooldownSeconds] = useState('');
  const [updatingCooldown, setUpdatingCooldown] = useState(false);
  const [duplicateClaimsSpotId, setDuplicateClaimsSpotId] = useState(null);
  const [updatingDuplicateClaims, setUpdatingDuplicateClaims] = useState(false);
  const [claimHistorySpotId, setClaimHistorySpotId] = useState(null);
  const [claimHistory, setClaimHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  if (!wallet) {
    return (
      <div className="owner-dashboard">
        <div className="wallet-connect-prompt">
          <p>{t(language, 'connectWalletToManageSpots')}</p>
          <button className="primary" onClick={onConnectWallet}>
            {t(language, 'connectWallet')}
          </button>
        </div>
      </div>
    );
  }

  // creator_address 또는 creator 비교 (서버/컨트랙트 포맷 차이 대응)
  const normalizeAddr = (addr) => (addr || '').toString().toLowerCase();
  const mySpots = spots.filter(
    (s) => normalizeAddr(s.creator_address || s.creator) === normalizeAddr(wallet)
  );

  const handleRedeposit = async (spotId) => {
    const amount = Number(redepositAmount);
    if (!amount || amount <= 0) {
      alert(t(language, 'enterValidAmount'));
      return;
    }

    setRedepositing(true);
    try {
      await redepositSelf(spotId, amount);
      setRedepositSpotId(null);
      setRedepositAmount('');
      onRedeposited();
      alert(`${amount} TON ${t(language, 'redepositComplete')}`);
    } catch (err) {
      alert(err.reason || err.message || t(language, 'redepositFailed'));
    } finally {
      setRedepositing(false);
    }
  };

  const handleUpdateCooldownSubmit = async (spotId) => {
    const seconds = Number(cooldownSeconds);
    if (isNaN(seconds) || seconds < 0) {
      alert(t(language, 'enterValidNumber'));
      return;
    }

    setUpdatingCooldown(true);
    try {
      await updateCooldown(spotId, seconds);
      setCooldownSpotId(null);
      setCooldownSeconds('');
      onRedeposited();
      alert(t(language, 'cooldownChanged'));
    } catch (err) {
      alert(err.reason || err.message || t(language, 'cooldownChangeFailed'));
    } finally {
      setUpdatingCooldown(false);
    }
  };

  const handleUpdateDuplicateClaims = async (spotId, allow) => {
    setUpdatingDuplicateClaims(true);
    try {
      await updateAllowDuplicateClaims(spotId, allow);
      setDuplicateClaimsSpotId(null);
      onRedeposited();
      // 블록체인 상태 반영 대기 후 한 번 더 갱신
      await new Promise((r) => setTimeout(r, 500));
      onRedeposited();
      alert(allow ? t(language, 'duplicateEnabled') : t(language, 'duplicateDisabled'));
    } catch (err) {
      alert(err.reason || err.message || t(language, 'duplicateChangeFailed'));
    } finally {
      setUpdatingDuplicateClaims(false);
    }
  };

  const handleShowClaimHistory = async (spotId) => {
    if (claimHistorySpotId === spotId) {
      setClaimHistorySpotId(null);
      setClaimHistory([]);
      return;
    }
    setClaimHistorySpotId(spotId);
    setLoadingHistory(true);
    try {
      const history = await getSpotClaimHistory(spotId);
      setClaimHistory(history);
    } catch (err) {
      alert(t(language, 'claimListFetchFailed'));
      setClaimHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  const shortenAddress = (addr) => {
    if (!addr) return '';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const formatCooldown = (seconds) => {
    if (seconds >= 3600) return `${(seconds / 3600).toFixed(1)}${t(language, 'hoursUnit')}`;
    if (seconds >= 60) return `${Math.floor(seconds / 60)}${t(language, 'minutesUnit')}`;
    return `${seconds}${t(language, 'secondsUnit')}`;
  };

  const renderSpotDetail = (spot) => {
    const claimsLeft = spot.reward > 0 ? Math.floor(spot.remaining / spot.reward) : 0;
    const isExhausted = spot.remaining < spot.reward;
    const cooldownDisplay = formatCooldown(spot.cooldown || 0);

    return (
      <div key={spot.id} className="owner-spot-card">
              <div className="spot-list-item-header">
                <span className="spot-list-item-name">{spot.name}</span>
                <span
                  className={`spot-list-item-status ${isExhausted ? 'exhausted' : spot.active ? 'active' : 'inactive'}`}
                >
                  {isExhausted ? t(language, 'exhausted') : spot.active ? t(language, 'active') : t(language, 'inactive')}
                </span>
              </div>
              <div className="spot-list-item-detail">
                {t(language, 'remainingTON')}: {spot.remaining} | {t(language, 'reward')}: {spot.reward} TON | {t(language, 'remainingClaimsCount')}: {claimsLeft}{t(language, 'times')}
              </div>
              <div className="spot-list-item-detail">
                {spot.start_time || spot.end_time
                  ? `${spot.start_time ? new Date(spot.start_time * 1000).toLocaleString() : ''} ~ ${spot.end_time ? new Date(spot.end_time * 1000).toLocaleString() : ''}`
                  : t(language, 'alwaysActive') || '항상'} | {t(language, 'cooldown')} {cooldownDisplay}
              </div>
              <div className="spot-list-item-detail">
                {t(language, 'duplicateClaims')}: {spot.allow_duplicate_claims ? t(language, 'allowed') : t(language, 'notAllowed')}
              </div>
              {spot.stamp_goal > 0 && (
                <div className="spot-list-item-stamp">
                  {t(language, 'stampAchievement')} {spot.stamp_goal}{t(language, 'achievementAt')} +{spot.stamp_bonus} TON
                </div>
              )}

              {redepositSpotId === spot.id ? (
                <div style={{ marginTop: 8, padding: 12, background: '#1a1a1a', borderRadius: 8 }}>
                  <label style={{ display: 'block', marginBottom: 8, fontSize: 14, color: '#aaa' }}>
                    {t(language, 'additionalDeposit')}
                  </label>
                  <input
                    key={`redeposit-${spot.id}`}
                    defaultValue=""
                    placeholder="e.g. 10"
                    onChange={(e) => setRedepositAmount(e.target.value)}
                    type="text"
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid #4FC3F7',
                      background: '#2a2a2a',
                      color: '#fff',
                      fontSize: '16px',
                      borderRadius: '8px',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button className="primary" onClick={() => handleRedeposit(spot.id)} disabled={redepositing} style={{ flex: 1 }}>
                      {redepositing ? t(language, 'waitingForMetaMask') : t(language, 'redeposit')}
                    </button>
                    <button
                      className="secondary"
                      onClick={() => { setRedepositSpotId(null); setRedepositAmount(''); }}
                      disabled={redepositing}
                      style={{ flex: 1, marginTop: 0 }}
                    >
                      {t(language, 'cancel')}
                    </button>
                  </div>
                </div>
              ) : cooldownSpotId === spot.id ? (
                <div style={{ marginTop: 8, padding: 12, background: '#1a1a1a', borderRadius: 8 }}>
                  <label style={{ display: 'block', marginBottom: 8, fontSize: 14, color: '#aaa' }}>
                    {t(language, 'cooldownSeconds')}
                  </label>
                  <input
                    key={`cooldown-${spot.id}`}
                    defaultValue={spot.cooldown}
                    onChange={(e) => setCooldownSeconds(e.target.value)}
                    onInput={(e) => setCooldownSeconds(e.target.value)}
                    type="text"
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '1px solid #4FC3F7',
                      background: '#2a2a2a',
                      color: '#fff',
                      fontSize: '16px',
                      borderRadius: '8px',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                  <div style={{ fontSize: '12px', color: '#888', marginTop: 4 }}>
                    {t(language, 'cooldownHint')}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button className="primary" onClick={() => handleUpdateCooldownSubmit(spot.id)} disabled={updatingCooldown} style={{ flex: 1 }}>
                      {updatingCooldown ? t(language, 'waitingForMetaMask') : t(language, 'changeCooldown')}
                    </button>
                    <button
                      className="secondary"
                      onClick={() => { setCooldownSpotId(null); setCooldownSeconds(''); }}
                      disabled={updatingCooldown}
                      style={{ flex: 1, marginTop: 0 }}
                    >
                      {t(language, 'cancel')}
                    </button>
                  </div>
                </div>
              ) : duplicateClaimsSpotId === spot.id ? (
                <div className="redeposit-form" style={{ marginTop: 8 }}>
                  <div style={{ fontSize: '14px', color: '#ddd', marginBottom: 8 }}>
                    {spot.allow_duplicate_claims ? t(language, 'confirmDisableDuplicate') : t(language, 'confirmEnableDuplicate')}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      className="primary"
                      onClick={() => handleUpdateDuplicateClaims(spot.id, !spot.allow_duplicate_claims)}
                      disabled={updatingDuplicateClaims}
                      style={{ flex: 1 }}
                    >
                      {updatingDuplicateClaims ? t(language, 'waitingForMetaMask') : spot.allow_duplicate_claims ? t(language, 'disable') : t(language, 'enable')}
                    </button>
                    <button
                      className="secondary"
                      onClick={() => setDuplicateClaimsSpotId(null)}
                      disabled={updatingDuplicateClaims}
                      style={{ flex: 1, marginTop: 0 }}
                    >
                      {t(language, 'cancel')}
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  <button
                    className="secondary"
                    style={{ flex: 1, marginTop: 0, minWidth: '45%' }}
                    onClick={() => setRedepositSpotId(spot.id)}
                  >
                    {t(language, 'tonRedeposit')}
                  </button>
                  <button
                    className="secondary"
                    style={{ flex: 1, marginTop: 0, minWidth: '45%' }}
                    onClick={() => {
                      setCooldownSpotId(spot.id);
                      setCooldownSeconds(spot.cooldown.toString());
                    }}
                  >
                    {t(language, 'changeCooldown')}
                  </button>
                  <button
                    className="secondary"
                    style={{ flex: 1, marginTop: 0, minWidth: '45%' }}
                    onClick={() => setDuplicateClaimsSpotId(spot.id)}
                  >
                    {t(language, 'duplicateClaimSettings')}
                  </button>
                  <button
                    className="secondary"
                    style={{ flex: 1, marginTop: 0, minWidth: '45%' }}
                    onClick={() => handleShowClaimHistory(spot.id)}
                  >
                    {claimHistorySpotId === spot.id ? t(language, 'closeClaimList') : t(language, 'claimList')}
                  </button>
                </div>
              )}

              {claimHistorySpotId === spot.id && (
                <div style={{ marginTop: 8, padding: 12, background: '#1a1a1a', borderRadius: 8 }}>
                  <div style={{ fontSize: 14, color: '#4FC3F7', marginBottom: 8, fontWeight: 'bold' }}>
                    {t(language, 'claimDetails')}
                  </div>
                  {loadingHistory ? (
                    <div style={{ color: '#888', fontSize: 13 }}>{t(language, 'loadingClaims')}</div>
                  ) : claimHistory.length === 0 ? (
                    <div style={{ color: '#888', fontSize: 13 }}>{t(language, 'noClaimDetailsYet')}</div>
                  ) : (
                    <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                      {claimHistory.map((item, idx) => (
                        <div key={idx} style={{
                          padding: '8px 0',
                          borderBottom: idx < claimHistory.length - 1 ? '1px solid #333' : 'none',
                          fontSize: 13,
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ color: '#ddd', fontFamily: 'monospace' }}>
                              {shortenAddress(item.user_address)}
                            </span>
                            <span style={{ color: '#4FC3F7' }}>
                              {item.reward} TON{item.bonus > 0 ? ` (+${item.bonus})` : ''}
                            </span>
                          </div>
                          <div style={{ color: '#888', fontSize: 11, marginTop: 2 }}>
                            {new Date(item.created_at).toLocaleString()}
                            {item.stamp > 0 ? ` | ${t(language, 'stampAchievement')} ${item.stamp} ${t(language, 'times')}` : ''}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
    );
  };

  const selectedSpot = selectedSpotId != null ? mySpots.find((s) => s.id === selectedSpotId) : null;

  return (
    <div className="owner-dashboard">
      <div className="owner-dashboard-header">
        {t(language, 'mySpotsCount')} ({mySpots.length})
      </div>
      {mySpots.length === 0 ? (
        <div className="spot-list-empty">
          {t(language, 'noSpotsYet')}
        </div>
      ) : (
        <>
          <div className="owner-spot-list">
            {mySpots.map((spot) => {
              const claimsLeft = spot.reward > 0 ? Math.floor(spot.remaining / spot.reward) : 0;
              const isExhausted = spot.remaining < spot.reward;
              const isSelected = selectedSpotId === spot.id;
              return (
                <button
                  key={spot.id}
                  type="button"
                  className={`owner-spot-list-item ${isSelected ? 'selected' : ''}`}
                  onClick={() => {
                    if (isSelected) {
                      setSelectedSpotId(null);
                      setRedepositSpotId(null);
                      setCooldownSpotId(null);
                      setDuplicateClaimsSpotId(null);
                      setClaimHistorySpotId(null);
                    } else {
                      setSelectedSpotId(spot.id);
                    }
                  }}
                >
                  <span className="spot-list-item-name">{spot.name}</span>
                  <span className={`spot-list-item-status ${isExhausted ? 'exhausted' : spot.active ? 'active' : 'inactive'}`}>
                    {isExhausted ? t(language, 'exhausted') : spot.active ? t(language, 'active') : t(language, 'inactive')}
                  </span>
                  <span className="spot-list-item-claims">{claimsLeft}{t(language, 'times')}</span>
                </button>
              );
            })}
          </div>
          {selectedSpot && (
            <div
              className="owner-spot-modal-overlay"
              onClick={() => {
                setSelectedSpotId(null);
                setRedepositSpotId(null);
                setCooldownSpotId(null);
                setDuplicateClaimsSpotId(null);
                setClaimHistorySpotId(null);
              }}
            >
              <div className="owner-spot-modal" onClick={(e) => e.stopPropagation()}>
                <div className="owner-spot-modal-header">
                  <h2>{selectedSpot.name}</h2>
                  <button
                    type="button"
                    className="close-btn"
                    onClick={() => {
                      setSelectedSpotId(null);
                      setRedepositSpotId(null);
                      setCooldownSpotId(null);
                      setDuplicateClaimsSpotId(null);
                      setClaimHistorySpotId(null);
                    }}
                  >
                    ✕
                  </button>
                </div>
                <div className="owner-spot-modal-content">
                  {renderSpotDetail(selectedSpot)}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
