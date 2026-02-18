import React, { useState, useEffect, useCallback } from 'react';
import { setWalletProvider, getWalletProvider } from './walletProvider';
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
import Toast from './components/Toast';
import { Spinner } from './components/Spinner';
import { getSpots, getTelegramBalance } from './api';
import { getBalance as getContractBalance, resetContractCache } from './contract';
import { getETH, resetFaucetCache } from './faucet';
import { t } from './translations';
import useGeolocation from './hooks/useGeolocation';
import useToast from './hooks/useToast';
import { isWithinActiveTime, isSpotClosed } from './spotUtils';
import { getNetworkConfig, getSelectedNetwork, setSelectedNetwork, getAllNetworks, onNetworkChange } from './networkStore';

// RPC URL을 현재 네트워크 설정에서 가져오기
function getRpcUrl() {
  const config = getNetworkConfig();
  // local 네트워크일 때 브라우저 호스트 기준
  if (config.id === 'local') {
    const host = window.location.hostname;
    return `http://${host}:8999`;
  }
  return config.rpcUrl;
}

// MetaMask 연결 (오너 모드용)
async function connectMetaMask(showToast) {
  if (!window.ethereum) {
    showToast?.('error', 'MetaMask가 설치되어 있지 않습니다');
    return null;
  }

  const config = getNetworkConfig();
  const chainIdHex = '0x' + config.chainId.toString(16);

  try {
    await window.ethereum.request({
      method: 'wallet_addEthereumChain',
      params: [{
        chainId: chainIdHex,
        chainName: config.name,
        rpcUrls: [getRpcUrl()],
        nativeCurrency: config.nativeCurrency,
      }],
    });
  } catch (e) {
    // 이미 추가된 경우 무시
  }

  const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
  setWalletProvider(window.ethereum);
  return accounts[0];
}

export default function App() {
  // 텔레그램 링크 페이지 라우팅 체크
  const urlParams = new URLSearchParams(window.location.search);
  const isTelegramLinkPage = window.location.pathname === '/telegram-link' || urlParams.has('token');

  if (isTelegramLinkPage) {
    return <TelegramLinkPage />;
  }

  const { toasts, showToast, removeToast } = useToast();
  const [wallet, setWallet] = useState(null);
  const [balance, setBalance] = useState(0);
  const [ethBalance, setEthBalance] = useState(0);
  const [telegramBalance, setTelegramBalance] = useState(null);
  const [spots, setSpots] = useState([]);
  const [spotsLoading, setSpotsLoading] = useState(false);
  const [selectedSpot, setSelectedSpot] = useState(null);
  const { userPos, gpsStatus } = useGeolocation();
  const [message, setMessage] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [history, setHistory] = useState([]);
  const [rpcUrl, setRpcUrl] = useState(getRpcUrl());
  const [chainId, setChainId] = useState(null);
  const [networkId, setNetworkId] = useState(getSelectedNetwork());

  // 지도 뷰 상태 유지 (탭 전환 시 복원)
  const [mapView, setMapView] = useState(null);

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

  // 네트워크 메뉴 드롭다운
  const [showNetworkMenu, setShowNetworkMenu] = useState(false);

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
      if (showNetworkMenu && !e.target.closest('.network-menu') && !e.target.closest('[data-network-trigger]')) {
        setShowNetworkMenu(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showWalletMenu, showNetworkMenu]);

  // 네트워크 변경 시 데이터 새로고침
  const handleNetworkSwitch = useCallback(async (newNetworkId) => {
    setSelectedNetwork(newNetworkId);
    setNetworkId(newNetworkId);
    setRpcUrl(getRpcUrl());
    setSpots([]);
    setHistory([]);
    setSelectedSpot(null);
    resetContractCache();
    resetFaucetCache();

    // MetaMask 체인 전환
    if (window.ethereum && wallet) {
      const config = getAllNetworks().find((n) => n.id === newNetworkId);
      if (config) {
        const chainIdHex = '0x' + config.chainId.toString(16);
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: chainIdHex }],
          });
        } catch (switchErr) {
          // 체인이 MetaMask에 없으면 추가
          if (switchErr.code === 4902) {
            try {
              await window.ethereum.request({
                method: 'wallet_addEthereumChain',
                params: [{
                  chainId: chainIdHex,
                  chainName: config.name,
                  rpcUrls: [config.id === 'local' ? `http://${window.location.hostname}:8999` : config.rpcUrl],
                  nativeCurrency: config.nativeCurrency,
                }],
              });
            } catch {}
          }
        }
      }
    }
  }, [wallet]);

  // 네트워크 변경 리스너
  useEffect(() => {
    return onNetworkChange((id) => {
      setNetworkId(id);
      setRpcUrl(getRpcUrl());
    });
  }, []);

  // 네트워크 정보 가져오기
  const fetchNetworkInfo = useCallback(async () => {
    const prov = getWalletProvider();
    if (!prov) return;
    try {
      const chainIdHex = await prov.request({ method: 'eth_chainId' });
      const chainIdDec = parseInt(chainIdHex, 16);
      setChainId(chainIdDec);
      setRpcUrl(getRpcUrl());
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

  // 잔액 갱신 (TON + ETH)
  const refreshBalance = useCallback(async () => {
    if (!wallet) return;
    try {
      const bal = await getContractBalance(wallet);
      setBalance(bal);

      const walletProv = getWalletProvider();
      if (walletProv) {
        const { ethers } = await import('ethers');
        const provider = new ethers.BrowserProvider(walletProv);
        const ethBal = await provider.getBalance(wallet);
        setEthBalance(Number(ethers.formatEther(ethBal)).toFixed(4));
      }
    } catch (err) {
      console.error('잔액 조회 실패:', err.message);
    }
  }, [wallet, networkId]);

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
    setSpotsLoading(true);
    try {
      const data = await getSpots();
      if (Array.isArray(data)) setSpots(data);
    } finally {
      setSpotsLoading(false);
    }
  }, []);

  // 히스토리
  const refreshHistory = useCallback(async () => {
    // TODO: Firestore 기반 히스토리 조회로 전환 필요
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

  // 지갑 연결 (MetaMask)
  const handleConnect = async () => {
    setConnecting(true);
    try {
      const address = await connectMetaMask(showToast);
      if (address) {
        setWallet(address);
        await fetchNetworkInfo();
      }
    } finally {
      setConnecting(false);
    }
  };

  // 지갑 연결 끊기
  const handleDisconnect = async () => {
    setWalletProvider(null);
    setWallet(null);
    setBalance(0);
    setEthBalance(0);
    setMessage(null);
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
      showToast('info', t(language, 'approveInMetaMask'));
      await getETH();
      showToast('success', t(language, 'getETHComplete'));
      refreshBalance();
    } catch (err) {
      console.error('ETH faucet error:', err);
      const errorMsg = err.reason || err.message || t(language, 'getETHFailed');
      showToast('error', errorMsg);
    }
  };

  // 지도 클릭 (생성 모드) - 노란 핀만 표시, + 버튼으로 추가 확인
  const handleMapClick = (pos) => {
    setPinPos(pos);
  };

  const handleConfirmAddSpot = () => {
    if (!wallet) {
      handleConnect();
      return;
    }
    if (pinPos) setShowCreateForm(true);
  };

  // 역할 미선택 → 역할 선택 화면
  if (!role) {
    return <RoleSelect onSelect={handleRoleSelect} language={language} />;
  }

  // store 역할일 때
  if (role === 'store') {
    return (
      <>
        <Toast toasts={toasts} onRemove={removeToast} />
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
      <Toast toasts={toasts} onRemove={removeToast} />
      {/* 헤더 */}
      <div className="header">
        <h1 onClick={() => setRole(null)} style={{ cursor: 'pointer' }}>Tokamon</h1>
        <div className="header-right">
          {role === 'customer' && telegramBalance !== null && (
            <div className="header-telegram">
              <span className="header-telegram-label">
                💬
              </span>
              <span className="header-telegram-balance">
                {Number(telegramBalance).toFixed(2)} TON
              </span>
            </div>
          )}
          {wallet ? (
            <div style={{ position: 'relative' }}>
              <div
                className="header-wallet-info"
                data-wallet-trigger
                style={{ background: showWalletMenu ? '#222' : 'transparent' }}
                onClick={() => setShowWalletMenu(!showWalletMenu)}
              >
                <span className="header-wallet-address">
                  {wallet.slice(0, 6)}...{wallet.slice(-4)}
                </span>
                <span className="header-wallet-balance">
                  {ethBalance} TON
                </span>
                <span style={{ color: '#888', fontSize: '10px' }}>▼</span>
              </div>

              {showWalletMenu && (
                <div className="wallet-menu">
                  <button className="wallet-menu-item" onClick={() => { handleGetETH(); setShowWalletMenu(false); }}>
                    <span style={{ color: '#60a5fa' }}>💧</span> {t(language, 'getETH')}
                  </button>
                  <button className="wallet-menu-item disconnect" onClick={() => { handleDisconnect(); setShowWalletMenu(false); }}>
                    <span style={{ color: '#ef4444' }}>🔌</span> {t(language, 'disconnectWallet')}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button className="faucet-btn btn-with-spinner" onClick={handleConnect} disabled={connecting}>
              {connecting && <Spinner size={14} />}
              {connecting ? t(language, 'connecting') : t(language, 'connectWallet')}
            </button>
          )}
          <div style={{ position: 'relative' }}>
            <button
              className="network-badge"
              data-network-trigger
              onClick={() => setShowNetworkMenu(!showNetworkMenu)}
            >
              <span className="network-dot-indicator" />
              {getNetworkConfig().name}
              <span style={{ fontSize: '8px', marginLeft: '2px' }}>▼</span>
            </button>
            {showNetworkMenu && (
              <div className="network-menu">
                {getAllNetworks().map((net) => (
                  <button
                    key={net.id}
                    className={`network-menu-item ${networkId === net.id ? 'active' : ''}`}
                    onClick={() => {
                      handleNetworkSwitch(net.id);
                      setShowNetworkMenu(false);
                      refreshSpots();
                    }}
                  >
                    <span className={`network-dot-indicator ${networkId === net.id ? '' : 'inactive'}`} />
                    {net.name}
                    {networkId === net.id && <span style={{ marginLeft: 'auto', fontSize: '12px' }}>✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
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

      {/* 지도 (고객: 지도탭 / 점주: 대시보드+스팟만들기탭) */}
      {(tab === 'map' || tab === 'owner-dashboard' || tab === 'create') && (
        <Map
          userPos={userPos}
          gpsStatus={gpsStatus}
          spots={spots}
          selectedSpot={selectedSpot}
          onSelectSpot={setSelectedSpot}
          initialCenter={userPos}
          createMode={createMode}
          pinPos={pinPos}
          onMapClick={handleMapClick}
          onConfirmAddSpot={handleConfirmAddSpot}
          wallet={wallet}
          role={role}
          language={language}
          mapView={mapView}
          onViewChange={setMapView}
        />
      )}

      {/* 하단 패널 */}
      <div className={`bottom-panel${tab === 'list' || tab === 'history' ? ' full-height' : ''}`}>
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
              language={language}
              onRedeposited={() => { refreshSpots(); refreshBalance(); }}
              onConnectWallet={handleConnect}
              onClose={() => setSelectedSpot(null)}
              showToast={showToast}
            />
          ) : (
            <div className="points-display">
              {spotsLoading
                ? <span className="btn-with-spinner"><Spinner size={14} /> {t(language, 'loadingSpots')}</span>
                : `${t(language, 'selectSpotOnMap')} (${spots.filter(s => s.remaining >= s.reward && !isSpotClosed(s) && s.active && isWithinActiveTime(s)).length}${t(language, 'activeSpotsCount')})`
              }
            </div>
          )
        )}

        {/* 고객: 스팟 목록 탭 */}
        {tab === 'list' && (
          <SpotList
            spots={spots}
            userPos={userPos}
            language={language}
            onSelect={(spot) => {
              switchTab('map');
              setSelectedSpot(spot);
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
              showToast={showToast}
            />
          ) : (
            <div className="wallet-connect-prompt">
              <p>{t(language, 'connectWalletPrompt')}</p>
              <button className="primary btn-with-spinner" onClick={handleConnect} disabled={connecting}>
                {connecting && <Spinner size={16} />}
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
            showToast={showToast}
          />
        )}

        {/* 점주: 스팟 만들기 탭 */}
        {tab === 'create' && !showCreateForm && (
          pinPos ? (
            <div className="points-display">
              <p style={{ marginBottom: 8 }}>{t(language, 'locationSelected')}</p>
              {wallet ? (
                balance <= 0 ? (
                  <p>{t(language, 'insufficientBalance')} ({Number(balance).toFixed(2)} TON)</p>
                ) : (
                  <p>{t(language, 'pressAddButton')}</p>
                )
              ) : (
                <div>
                  <p style={{ marginBottom: 12 }}>{t(language, 'connectWalletToAdd')}</p>
                  <button className="primary" onClick={handleConnect} disabled={connecting}>
                    {connecting ? t(language, 'connecting') : t(language, 'connectWallet')}
                  </button>
                </div>
              )}
            </div>
          ) : wallet ? (
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
          showToast={showToast}
          onClose={() => {
            setShowCreateForm(false);
            setPinPos(null);
          }}
          onCreated={async () => {
            await refreshBalance();
            switchTab(role === 'owner' ? 'owner-dashboard' : 'map');
            // 리스너가 이벤트 수신 → Firestore 저장 완료까지 대기 후 새로고침
            await new Promise(r => setTimeout(r, 2000));
            await refreshSpots();
          }}
        />
      )}

      {/* 설정 모달 */}
      {showSettings && (
        <Settings
          account={wallet}
          language={language}
          onLanguageChange={changeLanguage}
          onNetworkChange={(id) => {
            handleNetworkSwitch(id);
            refreshSpots();
          }}
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
