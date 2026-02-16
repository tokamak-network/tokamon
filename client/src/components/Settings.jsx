import React, { useState, useEffect } from 'react';
import { t } from '../translations';
import { getSelectedNetwork, setSelectedNetwork, getAllNetworks } from '../networkStore';

function withNetwork(url) {
  const networkId = getSelectedNetwork();
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}network=${networkId}`;
}

export default function Settings({ onClose, account, language, onLanguageChange, onNetworkChange }) {
  const [linkedTelegram, setLinkedTelegram] = useState(null);
  const [loading, setLoading] = useState(false);

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
      const response = await fetch(withNetwork(`/api/telegram/linked/${account}`));
      const data = await response.json();

      if (data.linked && data.telegram_hash) {
        setLinkedTelegram(data.telegram_hash);
      } else {
        setLinkedTelegram(null);
      }
    } catch (err) {
      console.error('텔레그램 연결 조회 실패:', err);
      setLinkedTelegram(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>{t(language, 'settings')}</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="settings-content">
          <div className="settings-section">
            <h3>{t(language, 'telegramAccountLink')}</h3>

            {account && (
              <>
                {loading ? (
                  <div className="settings-loading">{t(language, 'loading')}</div>
                ) : linkedTelegram ? (
                  <div className="settings-linked-telegram">
                    <div className="linked-status">
                      <span className="status-icon">✅</span>
                      <span className="status-text">{t(language, 'connected')}</span>
                    </div>
                    <div className="linked-hash">
                      {linkedTelegram.slice(0, 8)}...{linkedTelegram.slice(-8)}
                    </div>
                  </div>
                ) : (
                  <div className="settings-no-telegram">
                    <div className="linked-status">
                      <span className="status-icon">❌</span>
                      <span className="status-text">{t(language, 'notConnected')}</span>
                    </div>
                  </div>
                )}
              </>
            )}

            <div className="telegram-guide">
              <div className="guide-title">💡 {t(language, 'connectionGuide')}</div>
              <ol className="guide-steps">
                <li>{t(language, 'guideStep1')} <code>@TokamonBot</code> {t(language, 'guideStep1_2')}</li>
                <li><code>/start</code> {t(language, 'guideStep2')}</li>
                <li><code>/link</code> {t(language, 'guideStep3')}</li>
                <li>{t(language, 'guideStep4')} <code className="wallet-code">{account ? `${account.slice(0, 10)}...` : t(language, 'walletRequired')}</code></li>
              </ol>
            </div>
          </div>

          <div className="settings-section settings-section-compact">
            <h3>{t(language, 'languageSettings')}</h3>

            <div className="language-selector-compact">
              <button
                className={`lang-btn-compact ${language === 'ko' ? 'active' : ''}`}
                onClick={() => onLanguageChange('ko')}
              >
                한국어
              </button>
              <button
                className={`lang-btn-compact ${language === 'en' ? 'active' : ''}`}
                onClick={() => onLanguageChange('en')}
              >
                English
              </button>
            </div>
          </div>

          <div className="settings-section">
            <h3>{t(language, 'network')}</h3>
            <div className="network-selector">
              {getAllNetworks().map((net) => (
                <button
                  key={net.id}
                  className={`lang-btn-compact ${getSelectedNetwork() === net.id ? 'active' : ''}`}
                  onClick={() => {
                    if (onNetworkChange) onNetworkChange(net.id);
                  }}
                >
                  {net.name}
                </button>
              ))}
            </div>
          </div>

          <div className="settings-section">
            <h3>{t(language, 'information')}</h3>
            <div className="settings-info">
              <div className="info-row">
                <span>{t(language, 'version')}</span>
                <span>1.0.0</span>
              </div>
              <div className="info-row">
                <span>{t(language, 'network')}</span>
                <span>{getAllNetworks().find(n => n.id === getSelectedNetwork())?.name || getSelectedNetwork()}</span>
              </div>
              {account && (
                <div className="info-row">
                  <span>{t(language, 'myWallet')}</span>
                  <span>{account.slice(0, 6)}...{account.slice(-4)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
