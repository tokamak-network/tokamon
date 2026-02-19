import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { t } from '../translations';
import useToast from '../hooks/useToast';
import Toast from './Toast';
import { Spinner } from './Spinner';
import { getSelectedNetwork, getNetworkConfig } from '../networkStore';
import { isWithinActiveTime, isSpotClosed } from '../spotUtils';

const API = '';

function withNetwork(url) {
  const networkId = getSelectedNetwork();
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}network=${networkId}`;
}

export default function StoreKiosk({ language = 'ko', onLanguageChange }) {
  const { toasts, showToast, removeToast } = useToast();
  const [telegramUsername, setTelegramUsername] = useState('');
  const [balance, setBalance] = useState(null);
  const [spots, setSpots] = useState([]);
  const [selectedSpot, setSelectedSpot] = useState(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [wallet, setWallet] = useState(null);
  const [contract, setContract] = useState(null);
  const [stampCount, setStampCount] = useState(null);
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const [cachedHash, setCachedHash] = useState(null);

  // 스팟 목록 로드
  useEffect(() => {
    fetchSpots();
  }, []);

  const fetchSpots = async () => {
    try {
      const res = await fetch(withNetwork(`${API}/api/spots`));
      const data = await res.json();
      setSpots(data);
    } catch (err) {
      console.error('스팟 로드 실패:', err);
    }
  };

  // 점주의 스팟만 필터링
  const ownerSpots = wallet
    ? spots.filter(spot => spot.creator_address?.toLowerCase() === wallet.toLowerCase())
    : [];


  // 컨트랙트 초기화 (MetaMask를 통해 연결)
  const initContract = async () => {
    try {
      const res = await fetch(withNetwork(`${API}/api/contract`));
      const contractData = await res.json();

      const artifactRes = await fetch('/Tokamon.json');
      const artifact = await artifactRes.json();

      if (window.ethereum) {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const tempContract = new ethers.Contract(
          contractData.tokamon,
          artifact.abi,
          provider
        );
        setContract(tempContract);
      }
    } catch (err) {
      console.error('컨트랙트 초기화 실패:', err);
    }
  };

  // MetaMask 연결
  const connectWallet = async () => {
    if (!window.ethereum) {
      setMessage(t(language, 'metaMaskNotInstalled'));
      return;
    }

    try {
      // 체인 추가/전환 (현재 선택된 네트워크 사용)
      const config = getNetworkConfig();
      const rpcUrl = config.id === 'local' ? `http://${window.location.hostname}:8999` : config.rpcUrl;
      const chainIdHex = '0x' + config.chainId.toString(16);
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: chainIdHex,
          chainName: config.name,
          rpcUrls: [rpcUrl],
          nativeCurrency: config.nativeCurrency,
        }],
      }).catch(() => {});

      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts'
      });

      setWallet(accounts[0]);

      // 지갑 연결 후 컨트랙트 초기화
      await initContract();
    } catch (err) {
      console.error('지갑 연결 실패:', err);
      showToast('error', t(language, 'walletConnectionFailed') + ': ' + err.message);
    }
  };

  // 지갑 연결 해제
  const disconnectWallet = () => {
    setWallet(null);
    setSelectedSpot(null);
    setMessage('');
    setTelegramUsername('');
    setBalance(null);
  };

  // 텔레그램 username 입력 시 자동으로 쿨다운/스탬프 조회
  useEffect(() => {
    const username = telegramUsername.replace('@', '').trim();
    if (username.length < 5 || !selectedSpot) return;

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(withNetwork(`${API}/api/telegram/stamp-info`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ telegram_username: username, spot_id: selectedSpot.id }),
        });
        if (res.ok) {
          const info = await res.json();
          setStampCount(info.stamps);
          setCooldownLeft(info.cooldown_remaining || 0);
        }
      } catch (_) {}
    }, 500);

    return () => clearTimeout(timer);
  }, [telegramUsername, selectedSpot]);

  // 텔레그램 username 입력 핸들러
  const handleUsernameChange = (e) => {
    let value = e.target.value;
    // @ 없이 입력해도 자동으로 추가
    if (value && !value.startsWith('@')) {
      value = '@' + value;
    }
    setTelegramUsername(value);
    setStampCount(null);
    setCooldownLeft(0);
    setCachedHash(null);
    setBalance(null);
  };

  // 초기화
  const handleClear = () => {
    setTelegramUsername('');
    setBalance(null);
    setSelectedSpot(null);
    setMessage('');
    setStampCount(null);
    setCooldownLeft(0);
    setCachedHash(null);
  };

  // 잔액 확인 (컨트랙트에서 직접 조회)
  const handleCheckBalance = async () => {
    const username = telegramUsername.replace('@', '').trim();
    if (username.length < 5) {
      setMessage(t(language, 'enterValidTelegram'));
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      // 서버에서 텔레그램 해시 받기 (salt 클라이언트 노출 방지)
      const hashRes = await fetch(withNetwork(`${API}/api/telegram/hash`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegram_username: username }),
      });
      if (!hashRes.ok) {
        const hashErr = await hashRes.json();
        setMessage(hashErr.error || '해시 생성 실패');
        setLoading(false);
        return;
      }
      const { telegram_hash: telegramHash } = await hashRes.json();

      // 컨트랙트에서 직접 조회
      if (!contract) {
        setMessage(t(language, 'connectWalletFirst'));
        setLoading(false);
        return;
      }

      const balanceWei = await contract.getTelegramBalance(telegramHash);
      const balanceTon = Number(ethers.formatEther(balanceWei));

      setBalance(balanceTon);
      setCachedHash(telegramHash);
      setMessage('');

      // 스탬프 + 쿨다운 정보 조회
      if (selectedSpot) {
        try {
          const info = await contract.getTelegramStampInfo(selectedSpot.id, telegramHash);
          setStampCount(Number(info[0]));
          setCooldownLeft(Number(info[3]));
        } catch (_) {}
      }
    } catch (err) {
      console.error('잔액 조회 에러:', err);
      setMessage(t(language, 'balanceCheckFailed') + ': ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // 클레임 (MetaMask로 직접 트랜잭션)
  const handleClaim = async () => {
    if (!selectedSpot) {
      setMessage(t(language, 'pleaseSelectSpot'));
      return;
    }

    if (!wallet) {
      setMessage(t(language, 'connectWalletFirst'));
      return;
    }

    const username = telegramUsername.replace('@', '').trim();
    if (username.length < 5) {
      setMessage(t(language, 'enterValidTelegram'));
      return;
    }

    setLoading(true);
    setMessage(t(language, 'approveInMetaMask'));

    try {
      // 서버에서 텔레그램 해시 받기 (salt 클라이언트 노출 방지)
      const hashRes = await fetch(withNetwork(`${API}/api/telegram/hash`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegram_username: username }),
      });
      if (!hashRes.ok) {
        const hashErr = await hashRes.json();
        setMessage(hashErr.error || '해시 생성 실패');
        setLoading(false);
        return;
      }
      const { telegram_hash: telegramHash } = await hashRes.json();

      // 서버에서 검증 먼저 수행 (키오스크는 매장 내에 있으므로 스팟 위치 사용)
      const validateRes = await fetch(withNetwork(`${API}/api/telegram/validate-claim`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telegram_username: telegramUsername,
          spot_id: selectedSpot.id,
          lat: selectedSpot.lat,
          lng: selectedSpot.lng,
        }),
      });

      const validateData = await validateRes.json();
      if (!validateRes.ok) {
        let errMsg = validateData.error;
        // 서버 에러를 번역된 메시지로 변환
        if (validateData.cooldown_remaining > 0) {
          setCooldownLeft(validateData.cooldown_remaining);
          const h = Math.floor(validateData.cooldown_remaining / 3600);
          const m = Math.floor((validateData.cooldown_remaining % 3600) / 60);
          const timeStr = h > 0
            ? `${h}${t(language, 'hoursUnit')} ${m}${t(language, 'minutesUnit')}`
            : `${m}${t(language, 'minutesUnit')}`;
          errMsg = t(language, 'cooldownInProgress').replace('{time}', timeStr);
        }
        setMessage(errMsg);
        setLoading(false);
        return;
      }

      // 컨트랙트 호출 (점주가 직접 서명)
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contractWithSigner = contract.connect(signer);

      const tx = await contractWithSigner.claimToTelegram(
        selectedSpot.id,
        telegramHash
      );

      setMessage(t(language, 'txProcessing'));
      const receipt = await tx.wait();

      // TelegramClaimed 이벤트에서 stamp 정보 파싱
      let bonusText = '';
      for (const log of receipt.logs) {
        try {
          const parsed = contract.interface.parseLog(log);
          if (parsed && parsed.name === 'TelegramClaimed') {
            const stamp = Number(parsed.args.stamp);
            const bonus = Number(ethers.formatEther(parsed.args.bonus));
            setStampCount(stamp);
            if (bonus > 0) {
              bonusText = ` 🎉 +${bonus} TON ${t(language, 'stampBonusEarned')}`;
            }
          }
        } catch (_) {}
      }

      // 성공 후 잔액 조회 (컨트랙트에서 직접)
      const balanceWei = await contract.getTelegramBalance(telegramHash);
      const balanceTon = Number(ethers.formatEther(balanceWei));
      setBalance(balanceTon);

      setMessage(`✅ ${selectedSpot.reward} TON ${t(language, 'claimCompleted')}${bonusText}`);

      // 클레임 성공 후 쿨다운 설정
      setCooldownLeft(selectedSpot.cooldown || 0);

      // 컨트랙트에서 직접 최신 remaining 조회
      try {
        const spotData = await contract.getSpot(selectedSpot.id);
        const freshRemaining = Number(ethers.formatEther(spotData.remaining ?? spotData[6]));
        console.log('[Kiosk] getSpot 성공 | remaining:', freshRemaining, '(이전:', selectedSpot.remaining, ')');
        const updatedSpot = { ...selectedSpot, remaining: freshRemaining };
        setSelectedSpot(updatedSpot);
        setSpots(prev => prev.map(s => s.id === selectedSpot.id ? { ...s, remaining: freshRemaining } : s));
      } catch (err) {
        console.error('[Kiosk] getSpot 실패:', err);
      }
    } catch (err) {
      console.error('클레임 에러:', err);
      const errorMsg = err.reason || err.message || '클레임 실패';
      setMessage('❌ ' + errorMsg);
    } finally {
      setLoading(false);
    }
  };

  // 스팟 선택 단계와 입력 단계 구분
  if (!selectedSpot) {
    // 1단계: 스팟 선택
    return (
      <div className="store-kiosk">
        <Toast toasts={toasts} onRemove={removeToast} />
        <div className="kiosk-topbar">
          <h1 className="kiosk-topbar-title">{t(language, 'storeKiosk')}</h1>
          <div className="kiosk-topbar-right">
            {wallet && (
              <>
                <span className="kiosk-topbar-wallet">
                  🔗 {wallet.slice(0, 6)}...{wallet.slice(-4)}
                </span>
                <button className="kiosk-topbar-btn disconnect" onClick={disconnectWallet}>
                  {t(language, 'disconnect')}
                </button>
              </>
            )}
            <button
              className="kiosk-topbar-btn lang"
              onClick={() => onLanguageChange && onLanguageChange(language === 'ko' ? 'en' : 'ko')}
            >
              {language === 'ko' ? 'EN' : '한국어'}
            </button>
          </div>
        </div>

        <div className="kiosk-spot-selection">
          {!wallet ? (
            <div className="no-spots">
              <p>{t(language, 'connectOwnerWallet')}</p>
              <button className="kiosk-connect-wallet" onClick={connectWallet}>
                {t(language, 'connectOwnerWalletMetaMask')}
              </button>
            </div>
          ) : ownerSpots.length === 0 ? (
            <div className="no-spots">
              <p>{t(language, 'noSpotsForWallet')}</p>
              <p style={{ fontSize: '14px', color: '#888' }}>
                {t(language, 'walletAddress')}: {wallet.slice(0, 10)}...{wallet.slice(-8)}
              </p>
            </div>
          ) : (
            <div className="spot-grid-compact">
              {[...ownerSpots].sort((a, b) => {
                const aClosed = isSpotClosed(a) ? 1 : 0;
                const bClosed = isSpotClosed(b) ? 1 : 0;
                return aClosed - bClosed;
              }).map((spot) => {
                const closed = isSpotClosed(spot);
                const active = !closed && isWithinActiveTime(spot);
                const cdSec = spot.cooldown || 0;
                const cdH = Math.floor(cdSec / 3600);
                const cdM = Math.floor((cdSec % 3600) / 60);
                const cdText = cdSec === 0
                  ? t(language, 'none')
                  : cdH > 0
                    ? `${cdH}${t(language, 'hoursUnit')} ${cdM > 0 ? `${cdM}${t(language, 'minutesUnit')}` : ''}`
                    : `${cdM}${t(language, 'minutesUnit')}`;
                return (
                <div
                  key={spot.id}
                  className={`spot-card-compact${closed ? ' spot-closed' : ''}`}
                  onClick={() => { setSelectedSpot(spot); setStampCount(null); setCooldownLeft(0); }}
                >
                  <div className="spot-compact-header">
                    <div className="spot-compact-title">
                      <h3>{spot.name}</h3>
                      <span className="spot-compact-badge">ID {spot.id}</span>
                      {closed
                        ? <span className="spot-status-badge closed">{t(language, 'closedStatus')}</span>
                        : active
                          ? <span className="spot-status-badge active">{t(language, 'activeStatus')}</span>
                          : <span className="spot-status-badge inactive">{t(language, 'outsideActiveTime')}</span>
                      }
                    </div>
                    <div className="spot-compact-reward">{spot.reward} TON</div>
                  </div>

                  <div className="spot-compact-info">
                    <div className="spot-compact-row">
                      <span className="compact-label">💰 {t(language, 'remainingBalance')}</span>
                      <span className="compact-value">{parseFloat(spot.remaining.toFixed(4))} TON ({Math.floor(spot.remaining / spot.reward)}{t(language, 'visits')})</span>
                    </div>
                    <div className="spot-compact-row">
                      <span className="compact-label">🕐 {t(language, 'businessHours')}</span>
                      <span className="compact-value">{(() => {
                        const utc = spot.utc_offset || 0;
                        const utcLabel = ` (UTC${utc >= 0 ? '+' : ''}${utc})`;
                        const datePart = spot.start_time || spot.end_time
                          ? `${spot.start_time ? new Date(spot.start_time * 1000).toLocaleDateString() : ''} ~ ${spot.end_time ? new Date(spot.end_time * 1000).toLocaleDateString() : ''}${utcLabel}`
                          : t(language, 'alwaysActive');
                        const dailyPart = (spot.daily_start_time > 0 || spot.daily_end_time > 0)
                          ? ` | ${String(Math.floor(spot.daily_start_time / 60)).padStart(2, '0')}:${String(spot.daily_start_time % 60).padStart(2, '0')}~${String(Math.floor(spot.daily_end_time / 60)).padStart(2, '0')}:${String(spot.daily_end_time % 60).padStart(2, '0')}`
                          : '';
                        return datePart + dailyPart;
                      })()}</span>
                    </div>
                    <div className="spot-compact-row">
                      <span className="compact-label">⏱️ {t(language, 'cooldown')}</span>
                      <span className="compact-value">{cdText}</span>
                    </div>
                    <div className="spot-compact-row">
                      <span className="compact-label">🔄 {t(language, 'duplicateClaims')}</span>
                      <span className="compact-value">{spot.allow_duplicate_claims ? t(language, 'allowed') : t(language, 'notAllowed')}</span>
                    </div>
                    <div className="spot-compact-row">
                      <span className="compact-label">🎯 {t(language, 'stamp')}</span>
                      <span className="compact-value">{spot.stamp_goal}{t(language, 'visits')} → +{spot.stamp_bonus} TON</span>
                    </div>
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  const spotClosed = isSpotClosed(selectedSpot);
  const spotActive = !spotClosed && isWithinActiveTime(selectedSpot);

  // 영업시간 표시 텍스트
  const formatDailyTime = (minutes) =>
    `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

  const hasDaily = (selectedSpot.daily_start_time > 0 || selectedSpot.daily_end_time > 0);
  const hasDate = (selectedSpot.start_time || selectedSpot.end_time);

  let hoursText = t(language, 'alwaysActive');
  if (hasDate || hasDaily) {
    const parts = [];
    const utc = selectedSpot.utc_offset || 0;
    const utcLabel = `(UTC${utc >= 0 ? '+' : ''}${utc})`;
    if (hasDate) {
      const s = selectedSpot.start_time ? new Date(selectedSpot.start_time * 1000).toLocaleDateString() : '';
      const e = selectedSpot.end_time ? new Date(selectedSpot.end_time * 1000).toLocaleDateString() : '';
      parts.push(`${s} ~ ${e} ${utcLabel}`);
    }
    if (hasDaily) {
      parts.push(`${formatDailyTime(selectedSpot.daily_start_time)}~${formatDailyTime(selectedSpot.daily_end_time)}`);
    }
    hoursText = parts.join(' | ');
  }

  // 2단계: 텔레그램 입력 및 클레임
  return (
    <div className="store-kiosk">
      <Toast toasts={toasts} onRemove={removeToast} />
      <div className="kiosk-header-with-back">
        <button className="back-button" onClick={() => setSelectedSpot(null)}>
          ← {t(language, 'back')}
        </button>
        <div className="kiosk-header-content">
          <h2>{selectedSpot.name}</h2>
          <div className="kiosk-active-status">
            <span className={`spot-status-badge ${spotClosed ? 'closed' : spotActive ? 'active' : 'inactive'}`}>
              {spotClosed ? t(language, 'closedStatus') : spotActive ? t(language, 'activeStatus') : t(language, 'outsideActiveTime')}
            </span>
            <span className="kiosk-hours-text">🕐 {hoursText}</span>
            <span className="kiosk-hours-text">⏱ {t(language, 'cooldown')}: {selectedSpot.cooldown >= 3600
              ? `${Math.floor(selectedSpot.cooldown / 3600)}${t(language, 'hoursUnit')}${selectedSpot.cooldown % 3600 > 0 ? ` ${Math.floor((selectedSpot.cooldown % 3600) / 60)}${t(language, 'minutesUnit')}` : ''}`
              : selectedSpot.cooldown > 0
                ? `${Math.floor(selectedSpot.cooldown / 60)}${t(language, 'minutesUnit')}`
                : t(language, 'none')}</span>
          </div>
          {spotActive && (
            <p>{t(language, 'enterTelegramToReceiveTON').replace('{amount}', selectedSpot.reward)}</p>
          )}
          <p style={{ fontSize: '12px', color: '#aaa', marginTop: '4px' }}>
            💬 {t(language, 'notificationInfo')} <strong style={{ color: '#0088CC' }}>@TokamonBot</strong> <strong style={{ color: '#0088CC' }}>/start</strong> {t(language, 'sendStartCommand')}
          </p>
        </div>
      </div>

      <div className="kiosk-main">
        <div className="telegram-input-large">
          <label>{t(language, 'telegramUsernameToReceive')}</label>
          <input
            type="text"
            placeholder="@username"
            value={telegramUsername}
            onChange={handleUsernameChange}
            disabled={loading}
            autoFocus
          />
        </div>

        {message && (
          <div className={`message-large ${message.includes('실패') || message.includes('에러') || message.includes('❌') ? 'error' : 'success'}`}>
            {message}
          </div>
        )}

        {balance !== null && (
          <div className="balance-display-large">
            <span>{t(language, 'currentBalance')}:</span>
            <span className="balance-amount">{Number(balance).toFixed(2)} TON</span>
          </div>
        )}

        {stampCount !== null && selectedSpot && (
          <div className="kiosk-stamp-progress">
            <div className="kiosk-stamp-label">
              🎯 {t(language, 'stamp')} {stampCount}/{selectedSpot.stamp_goal}
              {selectedSpot.stamp_bonus > 0 && (
                <span className="kiosk-stamp-bonus"> (+{selectedSpot.stamp_bonus} TON)</span>
              )}
            </div>
            <div className="kiosk-stamp-bar">
              <div
                className="kiosk-stamp-fill"
                style={{ width: `${Math.min((stampCount / (selectedSpot.stamp_goal || 1)) * 100, 100)}%` }}
              />
            </div>
          </div>
        )}

        {cooldownLeft > 0 && (
          <div className="message-large error">
            {(() => {
              const h = Math.floor(cooldownLeft / 3600);
              const m = Math.floor((cooldownLeft % 3600) / 60);
              const timeStr = h > 0
                ? `${h}${t(language, 'hoursUnit')} ${m}${t(language, 'minutesUnit')}`
                : `${m}${t(language, 'minutesUnit')}`;
              return t(language, 'cooldownInProgress').replace('{time}', timeStr);
            })()}
          </div>
        )}

        <div className="action-buttons">
          <button
            className="btn-secondary"
            onClick={handleCheckBalance}
            disabled={loading || telegramUsername.replace('@', '').length < 5}
          >
            {t(language, 'checkBalance')}
          </button>
          <button
            className="btn-primary btn-with-spinner"
            onClick={handleClaim}
            disabled={loading || !wallet || !spotActive || cooldownLeft > 0 || telegramUsername.replace('@', '').length < 5}
          >
            {loading && <Spinner size={18} />}
            {loading ? t(language, 'processing') : `${selectedSpot.reward} TON ${t(language, 'receive')}`}
          </button>
        </div>

        <div className="kiosk-footer">
          {wallet ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
              <p style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center', margin: 0 }}>
                {wallet.slice(0, 6)}...{wallet.slice(-4)}
                <span style={{ color: '#10b981', fontSize: '18px' }}>✓</span>
              </p>
              <button
                onClick={disconnectWallet}
                style={{
                  padding: '8px 20px',
                  fontSize: '13px',
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '8px',
                  color: '#ef4444',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  fontWeight: '500'
                }}
                onMouseEnter={(e) => {
                  e.target.style.background = 'rgba(239, 68, 68, 0.2)';
                  e.target.style.borderColor = 'rgba(239, 68, 68, 0.5)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.background = 'rgba(239, 68, 68, 0.1)';
                  e.target.style.borderColor = 'rgba(239, 68, 68, 0.3)';
                }}
              >
                {t(language, 'disconnectWallet')}
              </button>
            </div>
          ) : (
            <p style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
              {t(language, 'notConnected')}
              <span style={{ color: '#ef4444', fontSize: '18px' }}>✗</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
