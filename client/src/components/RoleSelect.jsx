import React, { useState } from 'react';
import DinoCharacter from './DinoCharacter';
import { t } from '../translations';

export default function RoleSelect({ onSelect, language = 'ko' }) {
  const [animation, setAnimation] = useState('idle');

  return (
    <div className="role-select">
      <div className="role-select-header">
        <div className="title-with-icon">
          <div
            className="character-icon"
            onMouseEnter={() => setAnimation('walk')}
            onMouseLeave={() => setAnimation('idle')}
            onClick={() => setAnimation(animation === 'jump' ? 'idle' : 'jump')}
            style={{ cursor: 'pointer', userSelect: 'none' }}
          >
            <DinoCharacter
              animation={animation}
              height="145px"
              width="145px"
              scale={1.4}
              cameraPosition={[0, 2, 4]}
            />
          </div>
          <h1 className="main-title">{t(language, 'appName')}</h1>
        </div>
        <p className="role-select-subtitle">{t(language, 'roleSelectSubtitle')}</p>
      </div>

      <div className="role-select-buttons">
        <button className="role-select-btn customer" onClick={() => onSelect('customer')}>
          <div className="role-btn-icon-wrapper">
            <span className="role-select-icon">🚶</span>
          </div>
          <div className="role-btn-content">
            <span className="role-select-label">{t(language, 'customer')}</span>
            <span className="role-select-desc">{t(language, 'customerDesc')}</span>
          </div>
          <span className="role-btn-arrow">→</span>
        </button>

        <button className="role-select-btn store" onClick={() => onSelect('store')}>
          <div className="role-btn-icon-wrapper">
            <span className="role-select-icon">📱</span>
          </div>
          <div className="role-btn-content">
            <span className="role-select-label">{t(language, 'storeKiosk')}</span>
            <span className="role-select-desc">{t(language, 'storeKioskDesc')}</span>
          </div>
          <span className="role-btn-arrow">→</span>
        </button>

        <button className="role-select-btn owner" onClick={() => onSelect('owner')}>
          <div className="role-btn-icon-wrapper">
            <span className="role-select-icon">🏪</span>
          </div>
          <div className="role-btn-content">
            <span className="role-select-label">{t(language, 'owner')}</span>
            <span className="role-select-desc">{t(language, 'ownerDesc')}</span>
          </div>
          <span className="role-btn-arrow">→</span>
        </button>
      </div>

      <div className="role-select-footer">
        <div className="role-select-links">
          <a href="https://tokamon.io" target="_blank" rel="noopener noreferrer">tokamon.io</a>
          <span className="link-divider">·</span>
          <a href="https://github.com/tokamak-network/tokamon/blob/main/docs/USER_GUIDE.md" target="_blank" rel="noopener noreferrer">User Guide</a>
        </div>
      </div>
    </div>
  );
}
