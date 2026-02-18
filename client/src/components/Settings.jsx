import React from 'react';
import { t } from '../translations';
import { getSelectedNetwork, setSelectedNetwork, getAllNetworks } from '../networkStore';

export default function Settings({ onClose, account, language, onLanguageChange, onNetworkChange }) {
  const currentNetworkId = getSelectedNetwork();

  const handleNetworkChange = (id) => {
    setSelectedNetwork(id);
    if (onNetworkChange) onNetworkChange(id);
  };

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>{t(language, 'settings')}</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="settings-content">
          {/* My Wallet */}
          {account && (
            <div className="s-card">
              <div className="s-card-title">
                <span className="s-card-icon">💳</span>
                <span>{t(language, 'myWallet')}</span>
              </div>
              <div className="s-wallet-addr">{account}</div>
            </div>
          )}

          {/* Language */}
          <div className="s-card">
            <div className="s-card-title">
              <span className="s-card-icon">🌐</span>
              <span>{t(language, 'languageSettings')}</span>
            </div>
            <div className="s-lang-row">
              <button
                className={`s-lang-btn ${language === 'ko' ? 's-lang-active' : ''}`}
                onClick={() => onLanguageChange('ko')}
              >
                <span className="s-lang-flag">🇰🇷</span>
                <span>한국어</span>
                {language === 'ko' && <span className="s-check">✓</span>}
              </button>
              <button
                className={`s-lang-btn ${language === 'en' ? 's-lang-active' : ''}`}
                onClick={() => onLanguageChange('en')}
              >
                <span className="s-lang-flag">🇺🇸</span>
                <span>English</span>
                {language === 'en' && <span className="s-check">✓</span>}
              </button>
            </div>
          </div>

          {/* Multiverse */}
          <div className="s-card">
            <div className="s-card-title">
              <span className="s-card-icon">🌐</span>
              <span>Multiverse</span>
            </div>
            <div className="s-network-list">
              {getAllNetworks().map((net) => {
                const isActive = currentNetworkId === net.id;
                return (
                  <button
                    key={net.id}
                    className={`s-network-item ${isActive ? 's-network-active' : ''}`}
                    onClick={() => handleNetworkChange(net.id)}
                  >
                    <span className={`s-network-dot ${isActive ? 's-dot-active' : 's-dot-inactive'}`} />
                    <div className="s-network-info">
                      <span className={`s-network-name ${isActive ? 's-network-name-active' : ''}`}>{net.name}</span>
                      <span className="s-network-chain">Chain ID: {net.chainId}</span>
                    </div>
                    {isActive && <span className="s-check s-check-green">✓</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Information */}
          <div className="s-card">
            <div className="s-card-title">
              <span className="s-card-icon">ℹ️</span>
              <span>{t(language, 'information')}</span>
            </div>
            <div className="s-info-row">
              <span className="s-info-label">{t(language, 'version')}</span>
              <span className="s-info-value-badge">0.1.0</span>
            </div>
          </div>

          <div className="s-powered">Powered by Tokamak Network</div>
        </div>
      </div>
    </div>
  );
}
