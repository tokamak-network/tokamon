import React, { useState } from 'react';
import { redepositSelf, updateCooldown, updateAllowDuplicateClaims } from '../contract';
import { t } from '../translations';

export default function OwnerDashboard({ spots, wallet, balance, onConnectWallet, onRedeposited, language = 'ko' }) {
  const [redepositSpotId, setRedepositSpotId] = useState(null);
  const [redepositAmount, setRedepositAmount] = useState('');
  const [redepositing, setRedepositing] = useState(false);
  const [cooldownSpotId, setCooldownSpotId] = useState(null);
  const [cooldownSeconds, setCooldownSeconds] = useState('');
  const [updatingCooldown, setUpdatingCooldown] = useState(false);
  const [duplicateClaimsSpotId, setDuplicateClaimsSpotId] = useState(null);
  const [updatingDuplicateClaims, setUpdatingDuplicateClaims] = useState(false);

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

  const mySpots = spots.filter(
    (s) => s.creator_address?.toLowerCase() === wallet?.toLowerCase()
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
      alert(allow ? t(language, 'duplicateEnabled') : t(language, 'duplicateDisabled'));
    } catch (err) {
      alert(err.reason || err.message || t(language, 'duplicateChangeFailed'));
    } finally {
      setUpdatingDuplicateClaims(false);
    }
  };

  const formatCooldown = (seconds) => {
    if (seconds >= 3600) return `${(seconds / 3600).toFixed(1)}${t(language, 'hoursUnit')}`;
    if (seconds >= 60) return `${Math.floor(seconds / 60)}${t(language, 'minutesUnit')}`;
    return `${seconds}${t(language, 'secondsUnit')}`;
  };

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
        mySpots.map((spot) => {
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
                {spot.start_time} ~ {spot.end_time} | {t(language, 'cooldown')} {cooldownDisplay}
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
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button
                    className="secondary"
                    style={{ flex: 1, marginTop: 0 }}
                    onClick={() => setRedepositSpotId(spot.id)}
                  >
                    {t(language, 'tonRedeposit')}
                  </button>
                  <button
                    className="secondary"
                    style={{ flex: 1, marginTop: 0 }}
                    onClick={() => {
                      setCooldownSpotId(spot.id);
                      setCooldownSeconds(spot.cooldown.toString());
                    }}
                  >
                    {t(language, 'changeCooldown')}
                  </button>
                  <button
                    className="secondary"
                    style={{ flex: 1, marginTop: 0 }}
                    onClick={() => setDuplicateClaimsSpotId(spot.id)}
                  >
                    {t(language, 'duplicateClaimSettings')}
                  </button>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
