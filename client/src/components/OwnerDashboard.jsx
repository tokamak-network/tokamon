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
      alert('올바른 금액을 입력해주세요');
      return;
    }
    
    setRedepositing(true);
    try {
      await redepositSelf(spotId, amount);
      setRedepositSpotId(null);
      setRedepositAmount('');
      onRedeposited();
      alert(`${amount} TON 재예치 완료!`);
    } catch (err) {
      alert(err.reason || err.message || '재예치 실패');
    } finally {
      setRedepositing(false);
    }
  };

  const handleUpdateCooldownSubmit = async (spotId) => {
    const seconds = Number(cooldownSeconds);
    if (isNaN(seconds) || seconds < 0) {
      alert('올바른 숫자를 입력해주세요');
      return;
    }
    
    setUpdatingCooldown(true);
    try {
      await updateCooldown(spotId, seconds);
      setCooldownSpotId(null);
      setCooldownSeconds('');
      onRedeposited(); // 스팟 목록 새로고침
      alert('쿨다운이 성공적으로 변경되었습니다');
    } catch (err) {
      alert(err.reason || err.message || '쿨다운 수정 실패');
    } finally {
      setUpdatingCooldown(false);
    }
  };

  const handleUpdateDuplicateClaims = async (spotId, allow) => {
    setUpdatingDuplicateClaims(true);
    try {
      await updateAllowDuplicateClaims(spotId, allow);
      setDuplicateClaimsSpotId(null);
      onRedeposited(); // 스팟 목록 새로고침
      alert(`중복 발행 허용이 ${allow ? '활성화' : '비활성화'}되었습니다`);
    } catch (err) {
      alert(err.reason || err.message || '중복 발행 설정 실패');
    } finally {
      setUpdatingDuplicateClaims(false);
    }
  };

  return (
    <div className="owner-dashboard">
      <div className="owner-dashboard-header">
        내 스팟 ({mySpots.length}개)
      </div>
      {mySpots.length === 0 ? (
        <div className="spot-list-empty">
          아직 만든 스팟이 없습니다
        </div>
      ) : (
        mySpots.map((spot) => {
          const claimsLeft = spot.reward > 0 ? Math.floor(spot.remaining / spot.reward) : 0;
          const isExhausted = spot.remaining < spot.reward;
          
          // 쿨다운 표시 (초 단위로)
          const cooldownSeconds = spot.cooldown || 0;
          let cooldownDisplay = '';
          if (cooldownSeconds >= 3600) {
            cooldownDisplay = `${(cooldownSeconds / 3600).toFixed(1)}시간`;
          } else if (cooldownSeconds >= 60) {
            cooldownDisplay = `${Math.floor(cooldownSeconds / 60)}분`;
          } else {
            cooldownDisplay = `${cooldownSeconds}초`;
          }

          return (
            <div key={spot.id} className="owner-spot-card">
              <div className="spot-list-item-header">
                <span className="spot-list-item-name">{spot.name}</span>
                <span
                  className={`spot-list-item-status ${isExhausted ? 'exhausted' : spot.active ? 'active' : 'inactive'}`}
                >
                  {isExhausted ? '소진' : spot.active ? '활성' : '비활성'}
                </span>
              </div>
              <div className="spot-list-item-detail">
                남은 TON: {spot.remaining} | 보상: {spot.reward} TON | 남은 횟수: {claimsLeft}회
              </div>
              <div className="spot-list-item-detail">
                {spot.start_time} ~ {spot.end_time} | 쿨다운 {cooldownDisplay}
              </div>
              <div className="spot-list-item-detail">
                중복 발행: {spot.allow_duplicate_claims ? '허용' : '불허'}
              </div>
              {spot.stamp_goal > 0 && (
                <div className="spot-list-item-stamp">
                  스탬프 {spot.stamp_goal}회 달성 시 +{spot.stamp_bonus} TON
                </div>
              )}

              {redepositSpotId === spot.id ? (
                <div style={{ marginTop: 8, padding: 12, background: '#1a1a1a', borderRadius: 8 }}>
                  <label style={{ display: 'block', marginBottom: 8, fontSize: 14, color: '#aaa' }}>
                    추가 예치할 TON
                  </label>
                  <input
                    key={`redeposit-${spot.id}`}
                    defaultValue=""
                    placeholder="예: 10"
                    onChange={(e) => {
                      console.log('재예치 입력:', e.target.value);
                      setRedepositAmount(e.target.value);
                    }}
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
                      {redepositing ? 'MetaMask 승인 대기...' : '재예치'}
                    </button>
                    <button
                      className="secondary"
                      onClick={() => { setRedepositSpotId(null); setRedepositAmount(''); }}
                      disabled={redepositing}
                      style={{ flex: 1, marginTop: 0 }}
                    >
                      취소
                    </button>
                  </div>
                </div>
              ) : cooldownSpotId === spot.id ? (
                <div style={{ marginTop: 8, padding: 12, background: '#1a1a1a', borderRadius: 8 }}>
                  <label style={{ display: 'block', marginBottom: 8, fontSize: 14, color: '#aaa' }}>
                    쿨다운 시간 (초)
                  </label>
                  <input
                    key={`cooldown-${spot.id}`}
                    defaultValue={spot.cooldown}
                    onChange={(e) => {
                      console.log('입력값:', e.target.value);
                      setCooldownSeconds(e.target.value);
                    }}
                    onInput={(e) => {
                      console.log('onInput:', e.target.value);
                      setCooldownSeconds(e.target.value);
                    }}
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
                    예: 1초=1, 1시간=3600, 1일=86400
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button className="primary" onClick={() => handleUpdateCooldownSubmit(spot.id)} disabled={updatingCooldown} style={{ flex: 1 }}>
                      {updatingCooldown ? 'MetaMask 승인 대기...' : '쿨다운 변경'}
                    </button>
                    <button
                      className="secondary"
                      onClick={() => { setCooldownSpotId(null); setCooldownSeconds(''); }}
                      disabled={updatingCooldown}
                      style={{ flex: 1, marginTop: 0 }}
                    >
                      취소
                    </button>
                  </div>
                </div>
              ) : duplicateClaimsSpotId === spot.id ? (
                <div className="redeposit-form" style={{ marginTop: 8 }}>
                  <div style={{ fontSize: '14px', color: '#ddd', marginBottom: 8 }}>
                    중복 발행을 {spot.allow_duplicate_claims ? '비활성화' : '활성화'}하시겠습니까?
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button 
                      className="primary" 
                      onClick={() => handleUpdateDuplicateClaims(spot.id, !spot.allow_duplicate_claims)} 
                      disabled={updatingDuplicateClaims} 
                      style={{ flex: 1 }}
                    >
                      {updatingDuplicateClaims ? 'MetaMask 승인 대기...' : spot.allow_duplicate_claims ? '비활성화' : '활성화'}
                    </button>
                    <button
                      className="secondary"
                      onClick={() => setDuplicateClaimsSpotId(null)}
                      disabled={updatingDuplicateClaims}
                      style={{ flex: 1, marginTop: 0 }}
                    >
                      취소
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
                    TON 재예치
                  </button>
                  <button
                    className="secondary"
                    style={{ flex: 1, marginTop: 0 }}
                    onClick={() => {
                      setCooldownSpotId(spot.id);
                      setCooldownSeconds(spot.cooldown.toString());
                    }}
                  >
                    쿨다운 변경
                  </button>
                  <button
                    className="secondary"
                    style={{ flex: 1, marginTop: 0 }}
                    onClick={() => setDuplicateClaimsSpotId(spot.id)}
                  >
                    중복 발행 설정
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
