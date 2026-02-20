import React, { useState, useEffect, useRef } from 'react';
import { t } from '../translations';
import { getTelegramBalance, getWalletLinkedTelegram, claimTelegramToWallet, unlinkTelegram, getWalletLinkedDevice, getDeviceBalance, claimDeviceToWallet, unlinkDevice, getSignerAndContract } from '../contract';
import { Spinner } from './Spinner';
import { getSelectedNetwork } from '../networkStore';

function formatTime(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp * 1000);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${month}/${day} ${hours}:${minutes}`;
}

export default function History({ history, balance = 0, account, language = 'ko', onBalanceChange, showToast }) {
  const [linkedTelegram, setLinkedTelegram] = useState(null);
  const [telegramHash, setTelegramHash] = useState(null);
  const [telegramBalance, setTelegramBalance] = useState(0);
  const [loading, setLoading] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [linkedDevice, setLinkedDevice] = useState(null);
  const [deviceBalance, setDeviceBalance] = useState(0);
  const [deviceClaiming, setDeviceClaiming] = useState(false);
  const [deviceLoading, setDeviceLoading] = useState(false);
  const [deviceUnlinking, setDeviceUnlinking] = useState(false);
  const fetchingRef = useRef(false);

  // 연결된 텔레그램 ID & 기기 조회
  useEffect(() => {
    if (account && !fetchingRef.current) {
      fetchingRef.current = true;
      fetchLinkedTelegram();
      fetchLinkedDevice();
    }
  }, [account]);

  const fetchLinkedTelegram = async () => {
    if (!account) return;

    setLoading(true);
    try {
      const hash = await getWalletLinkedTelegram(account);

      const zeroHash = '0x0000000000000000000000000000000000000000000000000000000000000000';
      const isLinked = hash && hash !== zeroHash;

      if (isLinked) {
        setTelegramHash(hash);

        // hash로 username 조회 (서명 필수)
        const hashHex = hash.startsWith('0x') ? hash.slice(2) : hash;
        try {
          const message = `Verify telegram username for hash: ${hashHex}`;
          const { signer } = await getSignerAndContract();
          const signature = await signer.signMessage(message);
          const response = await fetch(`/api/telegram/username?network=${getSelectedNetwork()}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hash: hashHex, signature }),
          });
          const data = await response.json();
          if (data.telegram_username) {
            setLinkedTelegram(data.telegram_username);
          } else {
            setLinkedTelegram(null);
          }
        } catch (err) {
          setLinkedTelegram(null);
        }

        await fetchTelegramBalance(hash);
      } else {
        setLinkedTelegram(null);
        setTelegramHash(null);
        setTelegramBalance(0);
      }
    } catch (err) {
      console.error('텔레그램 연결 조회 실패:', err.message);
      setLinkedTelegram(null);
      setTelegramHash(null);
      setTelegramBalance(0);
    } finally {
      setLoading(false);
    }
  };

  const fetchTelegramBalance = async (telegramHash) => {
    try {
      const balance = await getTelegramBalance(telegramHash);
      setTelegramBalance(balance);
    } catch (err) {
      console.error('텔레그램 잔액 조회 실패:', err.message);
      setTelegramBalance(0);
    }
  };

  const handleClaimToWallet = async () => {
    if (!telegramHash || telegramBalance <= 0) return;

    setClaiming(true);
    try {
      await claimTelegramToWallet(telegramHash);
      showToast?.('success', `${telegramBalance.toFixed(4)} ${t(language, 'claimToWalletSuccess')}`);

      // 잔액 갱신
      await fetchLinkedTelegram();
      if (onBalanceChange) onBalanceChange();
    } catch (err) {
      showToast?.('error', err.message || t(language, 'claimToWalletError'));
    } finally {
      setClaiming(false);
    }
  };

  const handleUnlinkTelegram = async () => {
    if (!window.confirm(t(language, 'unlinkConfirm'))) return;

    setUnlinking(true);
    try {
      await unlinkTelegram();
      showToast?.('success', t(language, 'unlinkSuccess'));
      setLinkedTelegram(null);
      setTelegramHash(null);
      setTelegramBalance(0);
    } catch (err) {
      console.error('[Unlink] 실패:', err);
      console.error('[Unlink] reason:', err.reason, '| code:', err.code, '| data:', err.data);
      showToast?.('error', err.reason || err.message || t(language, 'unlinkError'));
    } finally {
      setUnlinking(false);
    }
  };

  const fetchLinkedDevice = async () => {
    if (!account) return;

    setDeviceLoading(true);
    try {
      const hash = await getWalletLinkedDevice(account);

      const zeroHash = '0x0000000000000000000000000000000000000000000000000000000000000000';
      const isLinked = hash && hash !== zeroHash;

      if (isLinked) {
        setLinkedDevice(hash);
        try {
          const bal = await getDeviceBalance(hash);
          setDeviceBalance(bal);
        } catch (err) {
          console.error('기기 잔액 조회 실패:', err.message);
          setDeviceBalance(0);
        }
      } else {
        setLinkedDevice(null);
        setDeviceBalance(0);
      }
    } catch (err) {
      console.error('기기 연결 조회 실패:', err.message);
      setLinkedDevice(null);
      setDeviceBalance(0);
    } finally {
      setDeviceLoading(false);
    }
  };

  const handleUnlinkDevice = async () => {
    if (!window.confirm(t(language, 'unlinkDeviceConfirm'))) return;

    setDeviceUnlinking(true);
    try {
      await unlinkDevice();
      showToast?.('success', t(language, 'unlinkDeviceSuccess'));
      setLinkedDevice(null);
      setDeviceBalance(0);
    } catch (err) {
      console.error('[UnlinkDevice] 실패:', err);
      showToast?.('error', err.reason || err.message || t(language, 'unlinkDeviceError'));
    } finally {
      setDeviceUnlinking(false);
    }
  };

  const handleClaimDeviceToWallet = async () => {
    if (!linkedDevice || deviceBalance <= 0) return;

    setDeviceClaiming(true);
    try {
      await claimDeviceToWallet(linkedDevice);
      showToast?.('success', `${deviceBalance.toFixed(4)} ${t(language, 'deviceClaimSuccess')}`);

      await fetchLinkedDevice();
      if (onBalanceChange) onBalanceChange();
    } catch (err) {
      showToast?.('error', err.message || t(language, 'claimToWalletError'));
    } finally {
      setDeviceClaiming(false);
    }
  };

  if (!account) {
    return <div className="history-empty">{t(language, 'connectWalletPrompt')}</div>;
  }

  return (
    <div className="history-container">
      {/* 내 토카몬 정보 */}
      <div className="tokamon-info">
        <div className="tokamon-section">
          <div className="section-label">{t(language, 'walletAddress')}</div>
          <div className="section-value wallet-address">{account}</div>
        </div>

        <div className="tokamon-telegram-section">
          <div className="telegram-section-header">
            <span className="telegram-icon-large">💬</span>
            <span className="telegram-section-title">{t(language, 'telegramAccount')}</span>
          </div>

          <div className="telegram-info-content">
            <div className="telegram-account-info">
              <div className="telegram-label">{t(language, 'telegramName')}</div>
              {loading ? (
                <div className="telegram-value" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Spinner size={14} /> {t(language, 'loading')}</div>
              ) : linkedTelegram ? (
                <div className="telegram-value telegram-linked">
                  <span className="telegram-icon">✅</span>
                  <span className="telegram-username">{linkedTelegram}</span>
                  <span
                    onClick={(unlinking || claiming) ? undefined : handleUnlinkTelegram}
                    style={{
                      color: '#888', fontSize: '11px', textDecoration: 'underline',
                      cursor: (unlinking || claiming) ? 'default' : 'pointer', marginLeft: '8px',
                      opacity: (unlinking || claiming) ? 0.5 : 1,
                    }}
                  >
                    {unlinking ? t(language, 'processing') : t(language, 'unlinkTelegram')}
                  </span>
                </div>
              ) : (
                <div className="telegram-not-linked-container">
                  <div className="telegram-value telegram-not-linked">
                    <span>{t(language, 'notConfigured')}</span>
                    <div className="telegram-help-tip">
                      <div className="help-tip-icon">💡</div>
                      <div className="help-tip-content">
                        <strong>{t(language, 'telegramLinkGuide')}</strong>
                        <ol>
                          <li>{t(language, 'telegramStep1')} <code>@TokamonBot</code></li>
                          <li><code>/start</code> {t(language, 'telegramStep2')}</li>
                          <li><code>/link</code> {t(language, 'telegramStep3')}</li>
                          <li>{t(language, 'telegramStep4')}<br/><code className="wallet-address-code">{account}</code></li>
                        </ol>
                        <p className="help-tip-note">{t(language, 'telegramNote')}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="telegram-balance-section">
              <div className="balance-label">{t(language, 'tonBalance')}</div>
              <div className="balance-amount-section">
                <div className="balance-amount">{linkedTelegram ? telegramBalance.toFixed(4) : '0.0000'} TON</div>
                {linkedTelegram && telegramBalance > 0 && (
                  <button
                    className="claim-to-wallet-btn btn-with-spinner"
                    onClick={handleClaimToWallet}
                    disabled={claiming || unlinking}
                  >
                    {claiming && <Spinner size={14} />}
                    {claiming ? t(language, 'processing') : t(language, 'claimToWallet')}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="tokamon-telegram-section">
          <div className="telegram-section-header">
            <span className="telegram-icon-large">📱</span>
            <span className="telegram-section-title">{t(language, 'deviceAccount')}</span>
          </div>

          <div className="telegram-info-content">
            <div className="telegram-account-info">
              <div className="telegram-label">{t(language, 'deviceHash')}</div>
              {deviceLoading ? (
                <div className="telegram-value" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Spinner size={14} /> {t(language, 'loading')}</div>
              ) : linkedDevice ? (
                <div className="telegram-value telegram-linked">
                  <span className="telegram-icon">✅</span>
                  <span className="telegram-username">{linkedDevice.slice(0, 10)}...{linkedDevice.slice(-8)}</span>
                  <span
                    onClick={(deviceUnlinking || deviceClaiming) ? undefined : handleUnlinkDevice}
                    style={{
                      color: '#888', fontSize: '11px', textDecoration: 'underline',
                      cursor: (deviceUnlinking || deviceClaiming) ? 'default' : 'pointer', marginLeft: '8px',
                      opacity: (deviceUnlinking || deviceClaiming) ? 0.5 : 1,
                    }}
                  >
                    {deviceUnlinking ? t(language, 'processing') : t(language, 'unlinkDevice')}
                  </span>
                </div>
              ) : (
                <div className="telegram-not-linked-container">
                  <div className="telegram-value telegram-not-linked">
                    <span>{t(language, 'deviceNotLinked')}</span>
                    <div className="telegram-help-tip">
                      <div className="help-tip-icon">💡</div>
                      <div className="help-tip-content">
                        <strong>{t(language, 'deviceLinkGuide')}</strong>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="telegram-balance-section">
              <div className="balance-label">{t(language, 'deviceBalance')}</div>
              <div className="balance-amount-section">
                <div className="balance-amount">{linkedDevice ? deviceBalance.toFixed(4) : '0.0000'} TON</div>
                {linkedDevice && deviceBalance > 0 && (
                  <button
                    className="claim-to-wallet-btn btn-with-spinner"
                    onClick={handleClaimDeviceToWallet}
                    disabled={deviceClaiming || deviceUnlinking}
                  >
                    {deviceClaiming && <Spinner size={14} />}
                    {deviceClaiming ? t(language, 'processing') : t(language, 'deviceClaimToWallet')}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
