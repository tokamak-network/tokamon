import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  SafeAreaView, View, Text, StyleSheet, StatusBar, TouchableOpacity,
  Animated, Easing,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppKitProvider, AppKit } from '@reown/appkit-react-native';
import { appKit } from './src/services/wallet';
import { getSpots } from './src/services/api';
import { t } from './src/translations';
import RoleSelectScreen from './src/screens/RoleSelectScreen';
import MapScreen from './src/screens/MapScreen';
import SpotListScreen from './src/screens/SpotListScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import OwnerDashboardScreen from './src/screens/OwnerDashboardScreen';
import CreateSpotScreen from './src/screens/CreateSpotScreen';
import StoreKioskScreen from './src/screens/StoreKioskScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import TabBar from './src/components/TabBar';

// 헤더 타이틀 — 보라→핑크→골드 색상 사이클
function HeaderTitle() {
  const colorAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(colorAnim, {
        toValue: 3,
        duration: 3000,
        easing: Easing.linear,
        useNativeDriver: false,
      }),
    ).start();
  }, [colorAnim]);

  const color = colorAnim.interpolate({
    inputRange: [0, 1, 2, 3],
    outputRange: ['#a78bfa', '#ec4899', '#fbbf24', '#a78bfa'],
  });

  return (
    <Animated.Text style={[styles.headerTitle, { color }]}>
      Tokamon
    </Animated.Text>
  );
}

const CUSTOMER_TABS = (lang) => [
  { key: 'map', label: t(lang, 'map') },
  { key: 'list', label: t(lang, 'spotList') },
  { key: 'history', label: t(lang, 'myTokamon') },
];

const OWNER_TABS = (lang) => [
  { key: 'owner-dashboard', label: t(lang, 'mySpotManagement') },
  { key: 'create', label: t(lang, 'createSpot') },
];

function AppContent() {
  const [role, setRole] = useState(null);
  const [tab, setTab] = useState('map');
  const [language, setLanguage] = useState('ko');
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [spots, setSpots] = useState([]);

  // 스팟 목록 공유 (고객 모드에서 지도/리스트 모두 사용)
  const refreshSpots = useCallback(async () => {
    try {
      const data = await getSpots();
      if (Array.isArray(data)) setSpots(data);
    } catch (e) {
      console.warn('스팟 로드 실패:', e.message);
    }
  }, []);

  useEffect(() => {
    if (role === 'customer' || role === 'owner') {
      refreshSpots();
      const interval = setInterval(refreshSpots, 30000);
      return () => clearInterval(interval);
    }
  }, [role, refreshSpots]);

  const handleSelectRole = (selectedRole) => {
    setRole(selectedRole);
    if (selectedRole === 'customer') setTab('map');
    else if (selectedRole === 'owner') setTab('owner-dashboard');
  };

  const handleBackToRoleSelect = () => {
    setRole(null);
    setTab('map');
  };

  // 역할 선택 화면
  if (!role) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />
        <RoleSelectScreen onSelect={handleSelectRole} language={language} />
        <SettingsScreen
          visible={settingsVisible}
          onClose={() => setSettingsVisible(false)}
          language={language}
          onLanguageChange={setLanguage}
        />
      </SafeAreaView>
    );
  }

  // 현재 탭에 맞는 화면 렌더링
  const renderScreen = () => {
    switch (tab) {
      // 고객 탭
      case 'map':
        return <MapScreen />;
      case 'list':
        return <SpotListScreen spots={spots} language={language} />;
      case 'history':
        return <HistoryScreen language={language} />;
      // 점주 탭
      case 'owner-dashboard':
        return <OwnerDashboardScreen language={language} />;
      case 'create':
        return <CreateSpotScreen language={language} />;
      default:
        return <MapScreen />;
    }
  };

  // 키오스크 모드 (탭 없이 단일 화면)
  if (role === 'store') {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBackToRoleSelect}>
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>
          <HeaderTitle />
          <TouchableOpacity onPress={() => setSettingsVisible(true)}>
            <Text style={styles.settingsIcon}>⚙</Text>
          </TouchableOpacity>
        </View>
        <StoreKioskScreen language={language} />
        <SettingsScreen
          visible={settingsVisible}
          onClose={() => setSettingsVisible(false)}
          language={language}
          onLanguageChange={setLanguage}
        />
      </SafeAreaView>
    );
  }

  // 고객/점주 모드 (탭 있음)
  const tabs = role === 'customer' ? CUSTOMER_TABS(language) : OWNER_TABS(language);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBackToRoleSelect}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <HeaderTitle />
        <TouchableOpacity onPress={() => setSettingsVisible(true)}>
          <Text style={styles.settingsIcon}>⚙</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        {renderScreen()}
      </View>

      <TabBar tabs={tabs} activeTab={tab} onTabPress={setTab} />

      <SettingsScreen
        visible={settingsVisible}
        onClose={() => setSettingsVisible(false)}
        language={language}
        onLanguageChange={setLanguage}
      />
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppKitProvider instance={appKit}>
        <AppContent />
        <AppKit />
      </AppKitProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#111',
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  backArrow: { color: '#4FC3F7', fontSize: 22, paddingRight: 8 },
  settingsIcon: { color: '#888', fontSize: 20, paddingLeft: 8 },
  content: { flex: 1 },
});
