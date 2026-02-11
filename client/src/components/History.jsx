import React, { useState, useEffect } from 'react';
import { t } from '../translations';
import { getTelegramBalance, getWalletLinkedTelegram, claimTelegramToWallet } from '../contract';

function formatTime(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp * 1000);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${month}/${day} ${hours}:${minutes}`;
}

export default function History({ history, balance = 0, account, language = 'ko', onBalanceChange }) {
  const [linkedTelegram, setLinkedTelegram] = useState(null);
  const [telegramHash, setTelegramHash] = useState(null);
  const [telegramBalance, setTelegramBalance] = useState(0);
  const [loading, setLoading] = useState(false);
  const [claiming, setClaiming] = useState(false);

  // 연결된 텔레그램 ID 조회
  useEffect(() => {
    console.log('History 컴포넌트 마운트, account:', account);
    if (account) {
      fetchLinkedTelegram();
    }
  }, [account]);

  const fetchLinkedTelegram = async () => {
    if (!account) {
      console.log('❌ account 없음, 텔레그램 조회 중단');
      return;
    }
    
    console.log('=== 텔레그램 정보 조회 시작 ===');
    console.log('지갑 주소:', account);
    
    setLoading(true);
    try {
      // 컨트랙트에서 직접 텔레그램 해시 조회
      console.log('1️⃣ 컨트랙트에서 텔레그램 해시 조회 중...');
      const hash = await getWalletLinkedTelegram(account);
      console.log('컨트랙트에서 조회한 텔레그램 해시:', hash);
      console.log('해시 타입:', typeof hash);
      console.log('해시 길이:', hash ? hash.length : 'null');
      
      // 해시가 0x0000...이면 연결 안됨
      const zeroHash = '0x0000000000000000000000000000000000000000000000000000000000000000';
      const isLinked = hash && hash !== zeroHash;
      console.log('연결 여부:', isLinked);
      console.log('제로 해시 비교:', hash === zeroHash);
      
      if (isLinked) {
        console.log('✅ 텔레그램 연결됨!');
        
        // 해시 저장
        setTelegramHash(hash);
        console.log('2️⃣ 해시 state에 저장 완료');
        
        // API에서 username 조회 (화면 표시용)
        console.log('3️⃣ API에서 username 조회 중...');
        try {
          const response = await fetch(`/api/telegram/linked/${account}`);
          const data = await response.json();
          console.log('API 응답:', data);
          if (data.linked && data.telegram_username) {
            setLinkedTelegram(data.telegram_username);
            console.log('Username 설정:', data.telegram_username);
          } else {
            setLinkedTelegram('연결됨');
            console.log('Username 없음, "연결됨"으로 표시');
          }
        } catch (err) {
          console.warn('Username 조회 실패:', err);
          setLinkedTelegram('연결됨');
        }
        
        // 컨트랙트에서 잔액 조회
        console.log('4️⃣ 컨트랙트에서 텔레그램 잔액 조회 시작...');
        await fetchTelegramBalance(hash);
      } else {
        console.log('❌ 텔레그램 연결 안됨 (해시가 0 또는 null)');
        setLinkedTelegram(null);
        setTelegramHash(null);
        setTelegramBalance(0);
      }
    } catch (err) {
      console.error('❌ 텔레그램 연결 조회 실패:', err);
      console.error('에러 상세:', err.message, err.stack);
      setLinkedTelegram(null);
      setTelegramHash(null);
      setTelegramBalance(0);
    } finally {
      setLoading(false);
      console.log('=== 텔레그램 정보 조회 완료 ===');
    }
  };

  const fetchTelegramBalance = async (telegramHash) => {
    try {
      console.log('💰 컨트랙트에서 잔액 조회 시작');
      console.log('   - 사용할 해시:', telegramHash);
      const balance = await getTelegramBalance(telegramHash);
      console.log('✅ 조회된 텔레그램 잔액:', balance, 'TON');
      console.log('   - 타입:', typeof balance);
      setTelegramBalance(balance);
      console.log('   - state에 저장 완료');
    } catch (err) {
      console.error('❌ 텔레그램 잔액 조회 실패:', err);
      console.error('   - 에러 메시지:', err.message);
      console.error('   - 에러 스택:', err.stack);
      setTelegramBalance(0);
    }
  };

  const handleClaimToWallet = async () => {
    if (!telegramHash || telegramBalance <= 0) return;
    
    console.log('=== 지갑으로 클레임 시작 ===');
    console.log('account:', account);
    console.log('telegramHash:', telegramHash);
    console.log('telegramBalance:', telegramBalance);
    
    setClaiming(true);
    try {
      console.log('컨트랙트 claimTelegramToWallet() 호출 중...');
      console.log('사용할 해시:', telegramHash);
      
      // 컨트랙트 직접 호출 (해시 전달)
      await claimTelegramToWallet(telegramHash);
      
      console.log('✅ 클레임 성공!');
      alert(`${telegramBalance.toFixed(4)} TON이 지갑으로 전송되었습니다!`);

      // 잔액 갱신
      await fetchLinkedTelegram();
      if (onBalanceChange) onBalanceChange();
    } catch (err) {
      console.error('❌ 클레임 실패:', err);
      alert(err.message || '클레임 중 오류가 발생했습니다');
    } finally {
      setClaiming(false);
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
                <div className="telegram-value">{t(language, 'loading')}</div>
              ) : linkedTelegram ? (
                <div className="telegram-value telegram-linked">
                  <span className="telegram-icon">✅</span>
                  <span className="telegram-username">{linkedTelegram}</span>
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
                    className="claim-to-wallet-btn"
                    onClick={handleClaimToWallet}
                    disabled={claiming}
                  >
                    {claiming ? t(language, 'processing') : t(language, 'claimToWallet')}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 클레임 기록 */}
      <div className="history-list">
        {(!history || history.length === 0) ? (
          <div className="history-empty">
            {t(language, 'noClaimHistory')}
          </div>
        ) : (
          <>
            {history.map((item, idx) => {
              const hasBonus = item.bonus && item.bonus > 0;
              const totalReward = (item.reward || 0) + (item.bonus || 0);
              return (
                <div key={idx} className="history-item">
                  <div className="history-item-top">
                    <span className="history-item-name">{item.spot_name || `스팟 #${item.spot_id}`}</span>
                    <span className="history-item-amount">
                      +{totalReward} TON
                    </span>
                  </div>
                  <div className="history-item-detail">
                    {formatTime(item.timestamp)}
                    {item.stamp !== undefined && (
                      <span className="history-item-stamp">
                        스탬프 {item.stamp}/{item.stamp_goal || '?'}
                      </span>
                    )}
                  </div>
                  {hasBonus && (
                    <div className="history-item-bonus">
                      스탬프 달성 보너스 +{item.bonus} TON
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
