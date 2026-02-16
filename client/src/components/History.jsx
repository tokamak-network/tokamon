import React, { useState, useEffect } from 'react';
import { t } from '../translations';
import { getTelegramBalance, getWalletLinkedTelegram, claimTelegramToWallet, unlinkTelegram } from '../contract';
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

  // 연결된 텔레그램 ID 조회
  useEffect(() => {
    if (account) {
      fetchLinkedTelegram();
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

        // hash로 직접 username 조회 (0x 제거)
        const hashHex = hash.startsWith('0x') ? hash.slice(2) : hash;
        try {
          const response = await fetch(`/api/telegram/username/${hashHex}?network=${getSelectedNetwork()}`);
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
                  <button
                    className="unlink-telegram-btn btn-with-spinner"
                    onClick={handleUnlinkTelegram}
                    disabled={unlinking}
                  >
                    {unlinking && <Spinner size={12} />}
                    {unlinking ? t(language, 'processing') : t(language, 'unlinkTelegram')}
                  </button>
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
                    disabled={claiming}
                  >
                    {claiming && <Spinner size={14} />}
                    {claiming ? t(language, 'processing') : t(language, 'claimToWallet')}
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
