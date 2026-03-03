import 'react-native-get-random-values';
import React, { useState, useEffect, useCallback } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import TabNavigator from './src/navigation/TabNavigator';
import IntroScreen from './src/screens/IntroScreen';
import { initWallet, onWalletChange } from './src/services/wallet';
import { registerForPushNotifications, setupNotificationListener, getDeviceId } from './src/services/notifications';
import { initNetwork, onNetworkChange } from './src/utils/networkStore';

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
    </SafeAreaProvider>
  );
}
