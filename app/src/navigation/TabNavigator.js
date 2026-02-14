import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import MapScreen from '../screens/MapScreen';
import SpotListScreen from '../screens/SpotListScreen';
import HistoryScreen from '../screens/HistoryScreen';
import SettingsScreen from '../screens/SettingsScreen';
import { t } from '../utils/translations';

const Tab = createBottomTabNavigator();

function TabIcon({ label, focused }) {
  const icons = {
    Map: '🗺️',
    Spots: '📍',
    History: '📋',
    Settings: '⚙️',
  };
  return (
    <Text style={{ fontSize: focused ? 22 : 20, opacity: focused ? 1 : 0.5 }}>
      {icons[label] || '•'}
    </Text>
  );
}

export default function TabNavigator({ wallet, language, onLanguageChange, onWalletDisconnect }) {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused }) => <TabIcon label={route.name} focused={focused} />,
        tabBarActiveTintColor: '#4FC3F7',
        tabBarInactiveTintColor: '#888',
        tabBarStyle: {
          backgroundColor: '#1a1a2e',
          borderTopColor: '#2a2a3e',
          borderTopWidth: 1,
          paddingBottom: 4,
          height: 56,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
        headerStyle: {
          backgroundColor: '#1a1a2e',
          shadowColor: 'transparent',
        },
        headerTintColor: '#fff',
        headerTitleStyle: {
          fontWeight: '700',
        },
      })}
    >
      <Tab.Screen
        name="MapTab"
        options={{
          title: t(language, 'map'),
          headerTitle: 'Tokamon',
          headerShown: false,
        }}
      >
        {(props) => (
          <MapScreen
            {...props}
            wallet={wallet}
            language={language}
          />
        )}
      </Tab.Screen>

      <Tab.Screen
        name="Spots"
        options={{
          title: t(language, 'spotList'),
          headerTitle: t(language, 'spotList'),
        }}
      >
        {(props) => (
          <SpotListScreen
            {...props}
            language={language}
          />
        )}
      </Tab.Screen>

      <Tab.Screen
        name="History"
        options={{
          title: t(language, 'myTokamon'),
          headerTitle: t(language, 'myTokamon'),
        }}
      >
        {(props) => (
          <HistoryScreen
            {...props}
            wallet={wallet}
            language={language}
          />
        )}
      </Tab.Screen>

      <Tab.Screen
        name="Settings"
        options={{
          title: t(language, 'settings'),
          headerTitle: t(language, 'settings'),
        }}
      >
        {(props) => (
          <SettingsScreen
            {...props}
            wallet={wallet}
            language={language}
            onLanguageChange={onLanguageChange}
            onWalletDisconnect={onWalletDisconnect}
          />
        )}
      </Tab.Screen>
    </Tab.Navigator>
  );
}
