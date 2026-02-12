import React, { useState, useEffect, useCallback } from 'react';
import Map from './components/Map';
import SpotInfo from './components/SpotInfo';
import CreateSpot from './components/CreateSpot';
import SpotList from './components/SpotList';
import History from './components/History';
import RoleSelect from './components/RoleSelect';
import OwnerDashboard from './components/OwnerDashboard';
import StoreKiosk from './components/StoreKiosk';
import TelegramLinkPage from './components/TelegramLinkPage';
import Settings from './components/Settings';
import { getSpots, requestClaim, getClaimHistory, getTelegramBalance } from './api';
import { getBalance as getContractBalance, resetContractCache } from './contract';
import { getETH, getTON, resetFaucetCache } from './faucet';
import { t } from './translations';

// RPC URL을 브라우저 접속 호스트 기준으로 결정
function getAnvilRpcUrl() {
  const host = window.location.hostname;
  return `http://${host}:8999`;
}

// MetaMask 연결
async function connectMetaMask() {
  if (!window.ethereum) {
    alert('MetaMask가 설치되어 있지 않습니다');
    return null;
  }

  try {
    await window.ethereum.request({
      method: 'wallet_addEthereumChain',
      params: [{
        chainId: '0x539',
        chainName: 'Tokamon Local',
        rpcUrls: [getAnvilRpcUrl()],
        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
      }],
    });
  } catch (e) {
    // 이미 추가된 경우 무시
  }

  const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
  return accounts[0];
}

export default function App() {
  // 텔레그램 링크 페이지 라우팅 체크
  const urlParams = new URLSearchParams(window.location.search);
  const isTelegramLinkPage = window.location.pathname === '/telegram-link' || urlParams.has('token');
  
  if (isTelegramLinkPage) {
    return <TelegramLinkPage />;
  }

  const [wallet, setWallet] = useState(null);
  const [balance, setBalance] = useState(0);
  const [ethBalance, setEthBalance] = useState(0);
  const [telegramBalance, setTelegramBalance] = useState(null);
  const [spots, setSpots] = useState([]);
  const [selectedSpot, setSelectedSpot] = useState(null);
  const [userPos, setUserPos] = useState(null);
  const [claiming, setClaiming] = useState(false);
  const [message, setMessage] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [history, setHistory] = useState([]);
  const [rpcUrl, setRpcUrl] = useState(getAnvilRpcUrl());
  const [chainId, setChainId] = useState(null);

  // 역할: null | 'customer' | 'owner'
  const [role, setRole] = useState(null);

  // 스팟 생성 모드
  const [createMode, setCreateMode] = useState(false);
  const [pinPos, setPinPos] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  // 현재 탭
  const [tab, setTab] = useState('map');

  // 설정 모달
  const [showSettings, setShowSettings] = useState(false);

  // 지갑 메뉴 드롭다운
  const [showWalletMenu, setShowWalletMenu] = useState(false);

  // 언어 설정 (시스템 언어 기본값)
  const [language, setLanguage] = useState(() => {
    const saved = localStorage.getItem('tokamon_language');
    if (saved) return saved;
    // 브라우저 언어 감지
    return 'en';
  });

  // 언어 변경 함수
  const changeLanguage = (lang) => {
    setLanguage(lang);
    localStorage.setItem('tokamon_language', lang);
  };

  // 메뉴 외부 클릭 시 닫기
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (showWalletMenu && !e.target.closest('.wallet-menu') && !e.target.closest('[data-wallet-trigger]')) {
        setShowWalletMenu(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showWalletMenu]);

  // 네트워크 정보 가져오기
  const fetchNetworkInfo = useCallback(async () => {
    if (!window.ethereum) return;
    try {
      const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
      const chainIdDec = parseInt(chainIdHex, 16);
      setChainId(chainIdDec);

      // RPC URL 가져오기 (provider를 통해)
      const { ethers } = await import('ethers');
      const provider = new ethers.BrowserProvider(window.ethereum);
      const network = await provider.getNetwork();

      if (chainIdDec === 1337) {
        setRpcUrl(getAnvilRpcUrl());
      }
    } catch (err) {
      console.warn('네트워크 정보 조회 실패:', err.message);
    }
  }, []);

  // MetaMask 계정 변경 감지
  useEffect(() => {
    if (!window.ethereum) return;
    const handleAccountsChanged = (accounts) => {
      resetContractCache();
      resetFaucetCache();
      if (accounts.length === 0) {
        setWallet(null);
      } else {
        setWallet(accounts[0]);
      }
    };
    const handleChainChanged = () => {
      fetchNetworkInfo();
    };
    window.ethereum.on('accountsChanged', handleAccountsChanged);
    window.ethereum.on('chainChanged', handleChainChanged);
    return () => {
      window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
      window.ethereum.removeListener('chainChanged', handleChainChanged);
    };
  }, [fetchNetworkInfo]);

  // GPS (데모용: 남산 위치 고정)
  useEffect(() => {
    setUserPos({ lat: 37.5512, lng: 126.9882 });
  }, []);

  // 잔액 갱신 (TON + ETH)
  const refreshBalance = useCallback(async () => {
    if (!wallet) return;
    try {
      console.log('=== 잔액 조회 시작 ===');
      console.log('지갑 주소:', wallet);
      
      // TON 잔액 (컨트랙트)
      const bal = await getContractBalance(wallet);
      console.log('TON 잔액 (컨트랙트):', bal);
      setBalance(bal);

      // ETH 잔액 (지갑)
      if (window.ethereum) {
        const { ethers } = await import('ethers');
        const provider = new ethers.BrowserProvider(window.ethereum);
        const ethBal = await provider.getBalance(wallet);
        const ethFormatted = Number(ethers.formatEther(ethBal)).toFixed(4);
        console.log('ETH 잔액 (wei):', ethBal.toString());
        console.log('ETH 잔액 (ether):', ethers.formatEther(ethBal));
        console.log('ETH 잔액 (포맷):', ethFormatted);
        setEthBalance(ethFormatted);
      }
      console.log('=== 잔액 조회 완료 ===');
    } catch (err) {
      console.error('잔액 조회 실패:', err);
      console.warn('잔액 조회 실패:', err.message);
    }
  }, [wallet]);

  // 텔레그램 잔액 갱신
  const refreshTelegramBalance = useCallback(async () => {
    try {
      const savedUsername = localStorage.getItem('tokamon_telegram_username');
      if (savedUsername) {
        const result = await getTelegramBalance(savedUsername);
        if (result.balance !== undefined) {
          setTelegramBalance(result.balance);
        }
      } else {
        setTelegramBalance(null);
      }
    } catch (err) {
      console.warn('텔레그램 잔액 조회 실패:', err.message);
      setTelegramBalance(null);
    }
  }, []);

  // 스팟 목록
  const refreshSpots = useCallback(async () => {
    const data = await getSpots();
    if (Array.isArray(data)) setSpots(data);
  }, []);

  // 히스토리
  const refreshHistory = useCallback(async () => {
    if (!wallet) return;
    const data = await getClaimHistory(wallet);
    if (Array.isArray(data)) setHistory(data);
  }, [wallet]);

  // 역할 선택 후 스팟 로드 (지갑 없이도)
  useEffect(() => {
    if (!role) return;
    refreshSpots();
    if (role === 'customer') {
      refreshTelegramBalance();
    }
    const interval = setInterval(() => {
      refreshSpots();
      if (role === 'customer') {
        refreshTelegramBalance();
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [role, refreshSpots, refreshTelegramBalance]);

  // 지갑 연결 시 잔액/히스토리 로드
  useEffect(() => {
    if (!wallet) return;
    refreshBalance();
    refreshHistory();
    fetchNetworkInfo();
    const interval = setInterval(refreshBalance, 30000);
    return () => clearInterval(interval);
  }, [wallet, refreshBalance, refreshHistory, fetchNetworkInfo]);

  // 탭 전환
  const switchTab = (t) => {
    setTab(t);
    setSelectedSpot(null);
    setPinPos(null);
    setCreateMode(t === 'create');
    setShowCreateForm(false);
    setMessage(null);
  };

  // 역할 선택
  const handleRoleSelect = (r) => {
    setRole(r);
    if (r === 'store') {
      setTab('store-kiosk');
    } else {
      setTab(r === 'customer' ? 'map' : 'owner-dashboard');
    }
  };

  // 역할 전환
  const handleRoleSwitch = () => {
    const newRole = role === 'customer' ? 'owner' : 'customer';
    setRole(newRole);
    setTab(newRole === 'customer' ? 'map' : 'owner-dashboard');
    setSelectedSpot(null);
    setPinPos(null);
    setCreateMode(false);
    setShowCreateForm(false);
    setMessage(null);
  };

  // MetaMask 연결
  const handleConnect = async () => {
    setConnecting(true);
    const address = await connectMetaMask();
    if (address) {
      setWallet(address);
      await fetchNetworkInfo();
    }
    setConnecting(false);
  };

  // 지갑 연결 끊기
  const handleDisconnect = () => {
    setWallet(null);
    setBalance(0);
    setEthBalance(0);
    setMessage(null); // 메시지 초기화
    resetContractCache();
    resetFaucetCache();
  };

  // ETH 받기 (Faucet 컨트랙트)
  const handleGetETH = async () => {
    if (!wallet) {
      await handleConnect();
      return;
    }

    setMessage(null);
    try {
      console.log('ETH 받기 시작...');
      setMessage({ type: 'info', text: t(language, 'approveInMetaMask') });
      await getETH();
      setMessage({ type: 'success', text: t(language, 'getETHComplete') });
      refreshBalance();
    } catch (err) {
      console.error('ETH faucet error:', err);
      const errorMsg = err.reason || err.message || t(language, 'getETHFailed');
      setMessage({ type: 'error', text: errorMsg });
    }
  };

  // TON 받기 (Faucet 컨트랙트)
  const handleGetTON = async () => {
    if (!wallet) {
      await handleConnect();
      return;
    }

    setMessage(null);
    try {
      console.log('TON 받기 시작...');
      setMessage({ type: 'info', text: t(language, 'approveInMetaMask') });
      await getTON();
      setMessage({ type: 'success', text: t(language, 'getTONComplete') });
      refreshBalance();
    } catch (err) {
      console.error('TON faucet error:', err);
      const errorMsg = err.reason || err.message || t(language, 'getTONFailed');
      setMessage({ type: 'error', text: errorMsg });
    }
  };

  // 지도 클릭 (생성 모드)
  const handleMapClick = (pos) => {
    setPinPos(pos);
    setShowCreateForm(true);
  };

  // 클레임
  const handleClaim = async (spotId) => {
    if (!userPos || !wallet) return;
    setClaiming(true);
    setMessage(null);

    const result = await requestClaim(wallet, spotId, userPos.lat, userPos.lng);

    if (result.error) {
      setMessage({ type: 'error', text: result.error });
    } else {
      setMessage({ type: 'success', text: result.message });
      refreshBalance();
      refreshSpots();
      refreshHistory();
    }
    setClaiming(false);
  };

  // 역할 미선택 → 역할 선택 화면
  if (!role) {
    return <RoleSelect onSelect={handleRoleSelect} language={language} />;
  }

  // store 역할일 때
  if (role === 'store') {
    return (
      <>
        <div className="header">
          <h1 onClick={() => setRole(null)} style={{ cursor: 'pointer' }}>Tokamon</h1>
        </div>
        <StoreKiosk language={language} onLanguageChange={changeLanguage} />
      </>
    );
  }

  // 고객 탭 목록
  const customerTabs = [
    { key: 'map', label: t(language, 'map') },
    { key: 'list', label: t(language, 'spotList') },
    { key: 'history', label: t(language, 'myTokamon') },
  ];

  // 점주 탭 목록
  const ownerTabs = [
    { key: 'owner-dashboard', label: t(language, 'mySpotManagement') },
    { key: 'create', label: t(language, 'createSpot') },
  ];

  const tabs = role === 'customer' ? customerTabs : ownerTabs;

  return (
    <>
      {/* 헤더 */}
      <div className="header">
        <h1 onClick={() => setRole(null)} style={{ cursor: 'pointer' }}>Tokamon</h1>
        <div className="header-right">
          {role === 'customer' && telegramBalance !== null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ color: '#0088CC', fontSize: '12px', fontWeight: '600' }}>
                💬 텔레그램
              </span>
              <span style={{ color: '#fbbf24', fontSize: '14px', fontWeight: '600' }}>
                {Number(telegramBalance).toFixed(2)} TON
              </span>
            </div>
          )}
          {wallet ? (
            <div style={{ position: 'relative' }}>
              <div 
                data-wallet-trigger
                style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', padding: '4px 8px', borderRadius: '6px', background: showWalletMenu ? '#222' : 'transparent' }}
                onClick={() => setShowWalletMenu(!showWalletMenu)}
              >
                <span style={{ color: '#888', fontSize: '12px' }}>
                  {wallet.slice(0, 6)}...{wallet.slice(-4)}
                </span>
                <span style={{ color: '#fbbf24', fontSize: '14px', fontWeight: '600' }}>
                  {Number(balance).toFixed(2)} TON
                </span>
                <span style={{ color: '#60a5fa', fontSize: '14px', fontWeight: '600' }}>
                  {ethBalance} ETH
                </span>
                <span style={{ color: '#888', fontSize: '10px' }}>▼</span>
              </div>
              
              {showWalletMenu && (
                <div className="wallet-menu">
                  <button className="wallet-menu-item" onClick={() => { handleGetETH(); setShowWalletMenu(false); }}>
                    <span style={{ color: '#60a5fa' }}>💧</span> {t(language, 'getETH')}
                  </button>
                  <button className="wallet-menu-item" onClick={() => { handleGetTON(); setShowWalletMenu(false); }}>
                    <span style={{ color: '#10b981' }}>💧</span> {t(language, 'getTON')}
                  </button>
                  <button className="wallet-menu-item disconnect" onClick={() => { handleDisconnect(); setShowWalletMenu(false); }}>
                    <span style={{ color: '#ef4444' }}>🔌</span> {t(language, 'disconnectWallet')}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button className="faucet-btn" onClick={handleConnect} disabled={connecting}>
              {connecting ? t(language, 'connecting') : t(language, 'connectWallet')}
            </button>
          )}
          <button className="settings-btn" onClick={() => setShowSettings(true)}>
            ⚙️
          </button>
        </div>
      </div>

      {/* 탭 */}
      <div className="tabs">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`tab ${tab === t.key ? 'tab-active' : ''}`}
            onClick={() => switchTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 지도 (고객: 지도탭 / 점주: 스팟만들기탭) */}
      {(tab === 'map' || tab === 'create') && (
        <Map
          userPos={userPos}
          spots={spots}
          selectedSpot={selectedSpot}
          onSelectSpot={setSelectedSpot}
          initialCenter={userPos}
          createMode={createMode}
          pinPos={pinPos}
          onMapClick={handleMapClick}
          wallet={wallet}
        />
      )}

      {/* 하단 패널 */}
      <div className="bottom-panel">
        {message && (
          <div className={`message ${message.type}`}>{message.text}</div>
        )}

        {/* 고객: 지도 탭 */}
        {tab === 'map' && (
          selectedSpot ? (
            <SpotInfo
              spot={selectedSpot}
              userPos={userPos}
              wallet={wallet}
              role={role}
              onCollect={handleClaim}
              collecting={claiming}
              onRedeposited={() => { refreshSpots(); refreshBalance(); }}
              onConnectWallet={handleConnect}
            />
          ) : (
            <div className="points-display">
              지도에서 스팟을 선택하세요 ({spots.filter(s => s.remaining > 0).length}개 활성 스팟)
            </div>
          )
        )}

        {/* 고객: 스팟 목록 탭 */}
        {tab === 'list' && (
          <SpotList
            spots={spots}
            language={language}
            onSelect={(spot) => {
              setSelectedSpot(spot);
              switchTab('map');
            }}
          />
        )}

        {/* 고객: 내 토카몬 탭 */}
        {tab === 'history' && (
          wallet ? (
            <History
              history={history}
              balance={balance}
              account={wallet}
              language={language}
              onBalanceChange={refreshBalance}
            />
          ) : (
            <div className="wallet-connect-prompt">
              <p>{t(language, 'connectWalletPrompt')}</p>
              <button className="primary" onClick={handleConnect} disabled={connecting}>
                {connecting ? t(language, 'connecting') : t(language, 'connectWallet')}
              </button>
            </div>
          )
        )}

        {/* 점주: 내 스팟 관리 탭 */}
        {tab === 'owner-dashboard' && (
          <OwnerDashboard
            spots={spots}
            wallet={wallet}
            balance={balance}
            onConnectWallet={handleConnect}
            onRedeposited={() => { refreshSpots(); refreshBalance(); }}
            language={language}
          />
        )}

        {/* 점주: 스팟 만들기 탭 */}
        {tab === 'create' && !showCreateForm && (
          wallet ? (
            <div className="points-display">
              {balance <= 0
                ? `${t(language, 'insufficientBalance')} (${Number(balance).toFixed(2)} TON) - ${t(language, 'pressChargeButton')}`
                : t(language, 'tapMapToSelectLocation')
              }
            </div>
          ) : (
            <div className="wallet-connect-prompt">
              <p>{t(language, 'connectWalletToCreateSpot')}</p>
              <button className="primary" onClick={handleConnect} disabled={connecting}>
                {connecting ? t(language, 'connecting') : t(language, 'connectWallet')}
              </button>
            </div>
          )
        )}
      </div>

      {/* 스팟 생성 폼 */}
      {showCreateForm && pinPos && wallet && (
        <CreateSpot
          pinPos={pinPos}
          wallet={wallet}
          balance={balance}
          language={language}
          onClose={() => {
            setShowCreateForm(false);
            setPinPos(null);
          }}
          onCreated={() => {
            refreshSpots();
            refreshBalance();
            switchTab(role === 'owner' ? 'owner-dashboard' : 'map');
          }}
        />
      )}

      {/* 설정 모달 */}
      {showSettings && (
        <Settings 
          account={wallet}
          language={language}
          onLanguageChange={changeLanguage}
          onClose={() => {
            setShowSettings(false);
            if (role === 'customer') {
              refreshTelegramBalance();
            }
          }} 
        />
      )}
    </>
  );
}
