import 'react-native-get-random-values';
import '@walletconnect/react-native-compat';
import React, { useState, useEffect, useCallback } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAppKit, AppKitProvider, AppKit } from '@reown/appkit-react-native';
import { EthersAdapter } from '@reown/appkit-ethers-react-native';
import TabNavigator from './src/navigation/TabNavigator';
import IntroScreen from './src/screens/IntroScreen';
import { initWallet, onWalletChange } from './src/services/wallet';
import { registerForPushNotifications, setupNotificationListener, getDeviceId } from './src/services/notifications';
import { initNetwork, onNetworkChange, getAllNetworks } from './src/utils/networkStore';
import { WALLETCONNECT_PROJECT_ID } from './src/utils/constants';

// Sepolia testnet (AppKit 기본 체인 - WalletConnect 세션 호환성용)
const sepoliaNetwork = {
  id: 11155111,
  name: 'Sepolia',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.sepolia.org'] } },
  chainNamespace: 'eip155',
  caipNetworkId: 'eip155:11155111',
  testnet: true,
};

// 커스텀 네트워크 (public RPC만 AppKit에 등록)
const customNetworks = getAllNetworks()
  .filter((net) => net.rpcUrl.startsWith('https://'))
  .map((net) => ({
    id: net.chainId,
    name: net.name,
    nativeCurrency: net.nativeCurrency || { name: 'TON', symbol: 'TON', decimals: 18 },
    rpcUrls: { default: { http: [net.rpcUrl] } },
    chainNamespace: 'eip155',
    caipNetworkId: `eip155:${net.chainId}`,
    testnet: true,
  }));

const appKitNetworks = [sepoliaNetwork, ...customNetworks];

// AsyncStorage → AppKit storage adapter
// AppKit 전용 prefix로 키를 분리하여 다른 저장소와 충돌 방지
const APPKIT_PREFIX = '@appkit:';
const appKitStorage = {
  async getKeys() {
    const allKeys = await AsyncStorage.getAllKeys();
    return allKeys
      .filter((k) => k.startsWith(APPKIT_PREFIX))
      .map((k) => k.slice(APPKIT_PREFIX.length));
  },
  async getEntries() {
    const allKeys = await AsyncStorage.getAllKeys();
    const appKitKeys = allKeys.filter((k) => k.startsWith(APPKIT_PREFIX));
    if (appKitKeys.length === 0) return [];
    const entries = await AsyncStorage.multiGet(appKitKeys);
    return entries.map(([key, value]) => {
      try {
        return [key.slice(APPKIT_PREFIX.length), value ? JSON.parse(value) : undefined];
      } catch {
        return [key.slice(APPKIT_PREFIX.length), undefined];
      }
    });
  },
  async getItem(key) {
    try {
      const value = await AsyncStorage.getItem(APPKIT_PREFIX + key);
      return value ? JSON.parse(value) : undefined;
    } catch {
      return undefined;
    }
  },
  async setItem(key, value) {
    await AsyncStorage.setItem(APPKIT_PREFIX + key, JSON.stringify(value));
  },
  async removeItem(key) {
    await AsyncStorage.removeItem(APPKIT_PREFIX + key);
  },
};

// Initialize Reown AppKit (singleton)
const appKit = createAppKit({
  projectId: WALLETCONNECT_PROJECT_ID,
  adapters: [new EthersAdapter()],
  networks: appKitNetworks,
  defaultNetwork: appKitNetworks[0],
  storage: appKitStorage,
  metadata: {
    name: 'Tokamon',
    description: 'Tokamon - Location-based TON rewards',
    url: 'https://tokamon.io',
    icons: ['https://tokamon.io/icon.png'],
    redirect: { native: 'tokamon://' },
  },
  themeMode: 'dark',
});

export default function App() {
  const [showIntro, setShowIntro] = useState(true);
  const [wallet, setWallet] = useState(null);
  const [language, setLanguage] = useState('ko');
  const [pushToken, setPushToken] = useState(null);
  const [deviceId, setDeviceId] = useState(null);
  const [receivedCode, setReceivedCode] = useState(null);
  const [networkId, setNetworkId] = useState('thanos-sepolia');

  useEffect(() => {
    AsyncStorage.getItem('language').then((lang) => {
      if (lang) setLanguage(lang);
    });

    initNetwork().then((id) => setNetworkId(id));
    initWallet();

    const unsubNetwork = onNetworkChange((id) => setNetworkId(id));

    const unsub = onWalletChange((address) => {
      setWallet(address);
    });

    // 디바이스 고유 ID 조회 (ANDROID_ID / IDFV)
    getDeviceId()
      .then((id) => { if (id) setDeviceId(id); })
      .catch((err) => console.error('[App] getDeviceId failed:', err));

    // FCM 푸시 토큰 발급 (푸시 알림 전송용)
    registerForPushNotifications()
      .then((token) => {
        if (token) setPushToken(token);
      })
      .catch(() => {});

    // FCM 알림 수신 리스너 (인증번호 자동 채우기)
    const cleanupNotifications = setupNotificationListener((code, spotId) => {
      setReceivedCode({ code, spotId, timestamp: Date.now() });
    });

    return () => {
      unsub();
      unsubNetwork();
      cleanupNotifications();
    };
  }, []);

  const handleLanguageChange = (lang) => {
    setLanguage(lang);
  };

  const handleWalletDisconnect = () => {
    setWallet(null);
  };

  return (
    <SafeAreaProvider>
      <AppKitProvider instance={appKit}>
        {showIntro ? (
          <>
            <StatusBar style="light" />
            <IntroScreen
              onReady={() => {}}
              onFinish={() => setShowIntro(false)}
            />
          </>
        ) : (
          <NavigationContainer
            theme={{
              ...DefaultTheme,
              dark: true,
              colors: {
                ...DefaultTheme.colors,
                primary: '#4FC3F7',
                background: '#0f0f0f',
                card: '#1a1a2e',
                text: '#fff',
                border: '#2a2a3e',
                notification: '#10b981',
              },
            }}
          >
            <StatusBar style="light" />
            <TabNavigator
              wallet={wallet}
              deviceId={deviceId}
              pushToken={pushToken}
              receivedCode={receivedCode}
              language={language}
              networkId={networkId}
              onLanguageChange={handleLanguageChange}
              onWalletDisconnect={handleWalletDisconnect}
              onNetworkChange={(id) => setNetworkId(id)}
            />
          </NavigationContainer>
        )}
        <AppKit />
      </AppKitProvider>
    </SafeAreaProvider>
  );
}
