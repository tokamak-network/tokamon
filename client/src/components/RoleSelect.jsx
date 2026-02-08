import React, { useState } from 'react';
import DinoCharacter from './DinoCharacter';

export default function RoleSelect({ onSelect }) {
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
              height="80px"
              width="80px"
              scale={1}
              cameraPosition={[0, 2, 4]}
            />
          </div>
          <h1 className="main-title">Tokamon</h1>
        </div>
        <p className="role-select-subtitle">매장 방문하고 TON 받자</p>
        <p className="role-select-subtitle-sub">Web3 기반 로열티 리워드 플랫폼</p>
      </div>

      <div className="role-select-buttons">
        <button className="role-select-btn customer" onClick={() => onSelect('customer')}>
          <div className="role-btn-icon-wrapper">
            <span className="role-select-icon">🚶</span>
          </div>
          <div className="role-btn-content">
            <span className="role-select-label">고객</span>
            <span className="role-select-desc">스팟 탐색하고 TON 받기</span>
          </div>
          <span className="role-btn-arrow">→</span>
        </button>

        <button className="role-select-btn owner" onClick={() => onSelect('owner')}>
          <div className="role-btn-icon-wrapper">
            <span className="role-select-icon">🏪</span>
          </div>
          <div className="role-btn-content">
            <span className="role-select-label">점주</span>
            <span className="role-select-desc">내 스팟 만들고 관리하기</span>
          </div>
          <span className="role-btn-arrow">→</span>
        </button>

        <button className="role-select-btn store" onClick={() => onSelect('store')}>
          <div className="role-btn-icon-wrapper">
            <span className="role-select-icon">📱</span>
          </div>
          <div className="role-btn-content">
            <span className="role-select-label">매장 키오스크</span>
            <span className="role-select-desc">텔레그램으로 TON 발급하기</span>
          </div>
          <span className="role-btn-arrow">→</span>
        </button>
      </div>

      <div className="role-select-footer">
        <p>🔒 MetaMask로 안전하게 연결</p>
      </div>
    </div>
  );
}
