import { useState, useEffect } from 'react';
import { ethers } from 'ethers';

const API = 'http://localhost:3001';

export default function StoreKiosk() {
  const [telegramUsername, setTelegramUsername] = useState('');
  const [balance, setBalance] = useState(null);
  const [spots, setSpots] = useState([]);
  const [selectedSpot, setSelectedSpot] = useState(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [wallet, setWallet] = useState(null);
  const [contract, setContract] = useState(null);

  // 스팟 목록 로드
  useEffect(() => {
    fetchSpots();
    initContract();
  }, []);

  const fetchSpots = async () => {
    try {
      const res = await fetch(`${API}/api/spots`);
      const data = await res.json();
      setSpots(data);
    } catch (err) {
      console.error('스팟 로드 실패:', err);
    }
  };

  // 점주의 스팟만 필터링
  const ownerSpots = wallet 
    ? spots.filter(spot => {
        const match = spot.creator_address?.toLowerCase() === wallet.toLowerCase();
        if (spots.length > 0) {
          console.log('스팟 필터링:', {
            spotId: spot.id,
            spotCreator: spot.creator_address,
            wallet: wallet,
            match: match
          });
        }
        return match;
      })
    : [];
  
  // 디버깅
  if (wallet && spots.length > 0) {
    console.log('전체 스팟 수:', spots.length);
    console.log('점주 스팟 수:', ownerSpots.length);
    console.log('연결된 지갑:', wallet);
  }

  // 컨트랙트 초기화
  const initContract = async () => {
    try {
      const res = await fetch(`${API}/api/contract`);
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
      setMessage('MetaMask가 설치되어 있지 않습니다');
      return;
    }

    try {
      // 체인 추가/전환
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: '0x539',
          chainName: 'Ganache Local',
          rpcUrls: ['http://127.0.0.1:8999'],
          nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
        }],
      }).catch(() => {});

      const accounts = await window.ethereum.request({ 
        method: 'eth_requestAccounts' 
      });
      
      setWallet(accounts[0]);
      // 메시지 제거 - 헤더에 연결 상태가 표시됨
    } catch (err) {
      console.error('지갑 연결 실패:', err);
      alert('지갑 연결 실패: ' + err.message);
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

  // 텔레그램 username 입력 핸들러
  const handleUsernameChange = (e) => {
    let value = e.target.value;
    // @ 없이 입력해도 자동으로 추가
    if (value && !value.startsWith('@')) {
      value = '@' + value;
    }
    setTelegramUsername(value);
  };

  // 초기화
  const handleClear = () => {
    setTelegramUsername('');
    setBalance(null);
    setSelectedSpot(null);
    setMessage('');
  };

  // 잔액 확인 (컨트랙트에서 직접 조회)
  const handleCheckBalance = async () => {
    const username = telegramUsername.replace('@', '').trim();
    if (username.length < 5) {
      setMessage('올바른 텔레그램 username을 입력해주세요 (최소 5자)');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      // 텔레그램 ID 해싱
      const crypto = window.crypto || window.msCrypto;
      const encoder = new TextEncoder();
      const salt = 'tokamon-telegram-2024';
      const data = encoder.encode(salt + username.toLowerCase());
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const telegramHash = '0x' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      console.log('잔액 조회:', { username, telegramHash });

      // 컨트랙트에서 직접 조회
      if (!contract) {
        setMessage('컨트랙트 연결 실패');
        setLoading(false);
        return;
      }

      const balanceWei = await contract.getTelegramBalance(telegramHash);
      const balanceTon = Number(ethers.formatEther(balanceWei));
      
      console.log('잔액 조회 결과:', { balanceWei: balanceWei.toString(), balanceTon });

      setBalance(balanceTon);
      setMessage(''); // 메시지는 표시하지 않음 (balance-display-large에서 표시)
    } catch (err) {
      console.error('잔액 조회 에러:', err);
      setMessage('잔액 조회 실패: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // 클레임 (MetaMask로 직접 트랜잭션)
  const handleClaim = async () => {
    if (!selectedSpot) {
      setMessage('스팟을 선택해주세요');
      return;
    }

    if (!wallet) {
      setMessage('먼저 지갑을 연결해주세요');
      return;
    }

    const username = telegramUsername.replace('@', '').trim();
    if (username.length < 5) {
      setMessage('올바른 텔레그램 username을 입력해주세요');
      return;
    }

    setLoading(true);
    setMessage('MetaMask에서 트랜잭션을 승인해주세요...');

    try {
      // 텔레그램 ID 해싱
      const crypto = window.crypto || window.msCrypto;
      const encoder = new TextEncoder();
      const salt = 'tokamon-telegram-2024';
      const data = encoder.encode(salt + username.toLowerCase());
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const telegramHash = '0x' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      // 서버에서 검증 먼저 수행 (키오스크는 매장 내에 있으므로 스팟 위치 사용)
      const validateRes = await fetch(`${API}/api/telegram/validate-claim`, {
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
        setMessage(validateData.error || '클레임 검증 실패');
        setLoading(false);
        return;
      }

      // 컨트랙트 호출 (점주가 직접 서명)
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const contractWithSigner = contract.connect(signer);

      console.log('클레임 시작:', {
        spotId: selectedSpot.id,
        telegramHash,
        telegramUsername
      });

      const tx = await contractWithSigner.claimToTelegram(
        selectedSpot.id,
        telegramHash
      );

      setMessage('트랜잭션 처리 중...');
      const receipt = await tx.wait();
      
      console.log('트랜잭션 완료:', receipt);

      // 성공 후 잔액 조회 (컨트랙트에서 직접)
      console.log('잔액 조회 시작:', telegramUsername);
      const balanceWei = await contract.getTelegramBalance(telegramHash);
      const balanceTon = Number(ethers.formatEther(balanceWei));
      console.log('잔액 조회 결과:', { balanceWei: balanceWei.toString(), balanceTon });
      setBalance(balanceTon);

      setMessage(`✅ ${selectedSpot.reward} TON 적립 완료!`);
      
      // 텔레그램 알림 전송
      try {
        await fetch(`${API}/api/telegram/notify-claim`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            telegram_username: telegramUsername,
            spot_name: selectedSpot.name,
            reward: selectedSpot.reward,
            bonus: 0 // 스탬프 보너스는 향후 추가
          }),
        });
        console.log('텔레그램 알림 전송 완료');
      } catch (notifyErr) {
        console.error('텔레그램 알림 전송 실패 (무시):', notifyErr);
        // 알림 실패해도 클레임은 성공이므로 무시
      }
      
      // 스팟 목록 새로고침
      fetchSpots();
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
        <div className="kiosk-header">
          <h1>매장 키오스크</h1>
          <p>리워드를 받을 스팟을 선택하세요</p>
          {wallet && (
            <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              <p style={{ fontSize: '14px', color: '#10b981', margin: 0 }}>
                🔗 점주 연결됨: {wallet.slice(0, 6)}...{wallet.slice(-4)}
              </p>
              <button 
                onClick={disconnectWallet}
                style={{
                  padding: '6px 16px',
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
                연결 해제
              </button>
            </div>
          )}
        </div>

        <div className="kiosk-spot-selection">
          {!wallet ? (
            <div className="no-spots">
              <p>점주 지갑을 먼저 연결해주세요</p>
              <button className="kiosk-connect-wallet" onClick={connectWallet}>
                점주 지갑 연결 (MetaMask)
              </button>
            </div>
          ) : ownerSpots.length === 0 ? (
            <div className="no-spots">
              <p>연결된 지갑으로 생성한 스팟이 없습니다</p>
              <p style={{ fontSize: '14px', color: '#888' }}>
                지갑 주소: {wallet.slice(0, 10)}...{wallet.slice(-8)}
              </p>
            </div>
          ) : (
            <div className="spot-grid-compact">
              {ownerSpots.map((spot) => (
                <div
                  key={spot.id}
                  className="spot-card-compact"
                  onClick={() => setSelectedSpot(spot)}
                >
                  <div className="spot-compact-header">
                    <div className="spot-compact-title">
                      <h3>{spot.name}</h3>
                      <span className="spot-compact-badge">ID {spot.id}</span>
                    </div>
                    <div className="spot-compact-reward">{spot.reward} TON</div>
                  </div>
                  
                  <div className="spot-compact-info">
                    <div className="spot-compact-row">
                      <span className="compact-label">💰 남은 잔액</span>
                      <span className="compact-value">{spot.remaining} TON ({Math.floor(spot.remaining / spot.reward)}회)</span>
                    </div>
                    <div className="spot-compact-row">
                      <span className="compact-label">🕐 영업시간</span>
                      <span className="compact-value">{spot.start_time} ~ {spot.end_time}</span>
                    </div>
                    <div className="spot-compact-row">
                      <span className="compact-label">🎯 스탬프</span>
                      <span className="compact-value">{spot.stamp_goal}회 → +{spot.stamp_bonus} TON</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // 2단계: 텔레그램 입력 및 클레임
  return (
    <div className="store-kiosk">
      <div className="kiosk-header-with-back">
        <button className="back-button" onClick={() => setSelectedSpot(null)}>
          ← 뒤로
        </button>
        <div className="kiosk-header-content">
          <h2>{selectedSpot.name}</h2>
          <p>텔레그램 username을 입력하여 {selectedSpot.reward} TON을 받으세요</p>
          <p style={{ 
            fontSize: '13px', 
            color: '#aaa',
            marginTop: '8px'
          }}>
            💬 적립 알림을 받으려면 텔레그램 <strong style={{ color: '#0088CC' }}>@TokamonBot</strong>에게 <strong style={{ color: '#0088CC' }}>/start</strong> 입력 (최초 1회)
          </p>
        </div>
      </div>

      <div className="kiosk-main">
        <div className="telegram-input-large">
          <label>톤을 받으실 텔레그램 Username</label>
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
            <span>현재 잔액:</span>
            <span className="balance-amount">{Number(balance).toFixed(2)} TON</span>
          </div>
        )}

        <div className="action-buttons">
          <button
            className="btn-secondary"
            onClick={handleCheckBalance}
            disabled={loading || telegramUsername.replace('@', '').length < 5}
          >
            잔액 확인
          </button>
          <button
            className="btn-primary"
            onClick={handleClaim}
            disabled={loading || !wallet || telegramUsername.replace('@', '').length < 5}
          >
            {loading ? '처리 중...' : `${selectedSpot.reward} TON 받기`}
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
                연결 해제
              </button>
            </div>
          ) : (
            <p style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
              연결 안 됨
              <span style={{ color: '#ef4444', fontSize: '18px' }}>✗</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
