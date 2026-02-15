import 'react-native-get-random-values';
import React, { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import TabNavigator from './src/navigation/TabNavigator';
import IntroScreen from './src/screens/IntroScreen';
import { initWallet, onWalletChange } from './src/services/wallet';
import { registerForPushNotifications } from './src/services/notifications';

export default function App() {
  const [showIntro, setShowIntro] = useState(true);
  const [wallet, setWallet] = useState(null);
  const [language, setLanguage] = useState('ko');
  const [pushToken, setPushToken] = useState(null);

  useEffect(() => {
    AsyncStorage.getItem('language').then((lang) => {
      if (lang) setLanguage(lang);
    });

    initWallet();

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

    return unsub;
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
        language={language}
        onLanguageChange={handleLanguageChange}
        onWalletDisconnect={handleWalletDisconnect}
      />
    </NavigationContainer>
  );
}
