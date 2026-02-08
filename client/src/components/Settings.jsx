import React, { useState, useEffect } from 'react';

export default function Settings({ onClose }) {
  const [telegramUsername, setTelegramUsername] = useState('');
  const [saved, setSaved] = useState(false);

  // localStorage에서 불러오기
  useEffect(() => {
    const savedUsername = localStorage.getItem('tokamon_telegram_username');
    if (savedUsername) {
      setTelegramUsername(savedUsername);
    }
  }, []);

  // 텔레그램 username 입력 핸들러
  const handleUsernameChange = (e) => {
    let value = e.target.value;
    // @ 없이 입력해도 자동으로 추가
    if (value && !value.startsWith('@')) {
      value = '@' + value;
    }
    setTelegramUsername(value);
    setSaved(false);
  };

  // 저장
  const handleSave = () => {
    const username = telegramUsername.replace('@', '').trim();
    if (username.length < 5) {
      alert('텔레그램 username은 최소 5자 이상이어야 합니다');
      return;
    }

    localStorage.setItem('tokamon_telegram_username', telegramUsername);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  // 삭제
  const handleClear = () => {
    if (confirm('저장된 텔레그램 아이디를 삭제하시겠습니까?')) {
      localStorage.removeItem('tokamon_telegram_username');
      setTelegramUsername('');
      setSaved(false);
    }
  };

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>설정</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="settings-content">
          <div className="settings-section">
            <h3>내 텔레그램 아이디</h3>
            <p className="settings-desc">
              텔레그램 username을 저장하면 매번 입력하지 않아도 됩니다.
            </p>
            
            <div className="settings-input-group">
              <label>텔레그램 Username</label>
              <input
                type="text"
                placeholder="@username"
                value={telegramUsername}
                onChange={handleUsernameChange}
              />
            </div>

            {saved && (
              <div className="settings-saved-message">
                ✓ 저장되었습니다
              </div>
            )}

            <div className="settings-actions">
              <button className="btn-save" onClick={handleSave}>
                저장
              </button>
              {telegramUsername && (
                <button className="btn-clear" onClick={handleClear}>
                  삭제
                </button>
              )}
            </div>
          </div>

          <div className="settings-section">
            <h3>정보</h3>
            <div className="settings-info">
              <div className="info-row">
                <span>버전</span>
                <span>1.0.0</span>
              </div>
              <div className="info-row">
                <span>네트워크</span>
                <span>Ganache Local (Chain ID: 1337)</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
