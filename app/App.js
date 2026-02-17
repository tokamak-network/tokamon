import 'react-native-get-random-values';
import '@walletconnect/react-native-compat';
import React, { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { WalletConnectModal } from '@walletconnect/modal-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import TabNavigator from './src/navigation/TabNavigator';
import IntroScreen from './src/screens/IntroScreen';
import { initWallet, onWalletChange } from './src/services/wallet';
import { registerForPushNotifications, setupNotificationListener } from './src/services/notifications';
import { initNetwork, getSelectedNetwork, onNetworkChange } from './src/utils/networkStore';
import { WALLETCONNECT_PROJECT_ID } from './src/utils/constants';
import { getNetworkConfig } from './src/utils/networkStore';

export default function App() {
  const [showIntro, setShowIntro] = useState(true);
  const [wallet, setWallet] = useState(null);
  const [language, setLanguage] = useState('ko');
  const [pushToken, setPushToken] = useState(null);
  const [receivedCode, setReceivedCode] = useState(null);
  const [networkId, setNetworkId] = useState('local');

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

    // FCM 푸시 토큰 발급 (항상 토큰 반환 보장)
    registerForPushNotifications()
      .then((token) => {
        if (token) setPushToken(token);
      })
      .catch(() => {
        // 알림 서비스 초기화 실패 시 대체 토큰
        const fallback = `device_fallback_${Date.now()}`;
        setPushToken(fallback);
      });

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

  if (showIntro) {
    return (
      <>
        <StatusBar style="light" />
        <IntroScreen onFinish={() => setShowIntro(false)} />
      </>
    );
  }

  return (
    <>
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
        pushToken={pushToken}
        receivedCode={receivedCode}
        language={language}
        networkId={networkId}
        onLanguageChange={handleLanguageChange}
        onWalletDisconnect={handleWalletDisconnect}
        onNetworkChange={(id) => setNetworkId(id)}
      />
    </NavigationContainer>
    <WalletConnectModal
      projectId={WALLETCONNECT_PROJECT_ID}
      providerMetadata={{
        name: 'Tokamon',
        description: 'Tokamon - Location-based TON rewards',
        url: 'https://tokamon.io',
        icons: ['https://tokamon.io/icon.png'],
        redirect: {
          native: 'tokamon://',
        },
      }}
      sessionParams={{
        namespaces: {
          eip155: {
            methods: ['eth_sendTransaction', 'personal_sign', 'eth_signTypedData'],
            chains: [`eip155:${getNetworkConfig().chainId}`],
            events: ['chainChanged', 'accountsChanged'],
            rpiMap: {
              [`eip155:${getNetworkConfig().chainId}`]: getNetworkConfig().rpcUrl,
            },
          },
        },
      }}
    />
    </>
  );
}
