import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import MapScreen from '../screens/MapScreen';
import SpotListScreen from '../screens/SpotListScreen';
import HistoryScreen from '../screens/HistoryScreen';
import SettingsScreen from '../screens/SettingsScreen';
import { t } from '../utils/translations';

const Tab = createBottomTabNavigator();

const TAB_ICONS = {
  MapTab: { icon: 'map-outline', activeIcon: 'map' },
  Spots: { icon: 'location-outline', activeIcon: 'location' },
  History: { icon: 'person-outline', activeIcon: 'person' },
  Settings: { icon: 'settings-outline', activeIcon: 'settings' },
};

function TabIcon({ routeName, focused, color }) {
  const config = TAB_ICONS[routeName] || { icon: 'ellipse-outline', activeIcon: 'ellipse' };

  return (
    <View style={styles.tabIconContainer}>
      {focused && <View style={styles.activeIndicator} />}
      <Ionicons
        name={focused ? config.activeIcon : config.icon}
        size={focused ? 24 : 22}
        color={color}
      />
    </View>
  );
}

export default function TabNavigator({ wallet, pushToken, receivedCode, language, onLanguageChange, onWalletDisconnect, onNetworkChange }) {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color }) => <TabIcon routeName={route.name} focused={focused} color={color} />,
        tabBarActiveTintColor: '#4FC3F7',
        tabBarInactiveTintColor: '#666',
        tabBarStyle: {
          backgroundColor: '#111122',
          borderTopColor: 'rgba(167,139,250,0.15)',
          borderTopWidth: 1,
          paddingBottom: Platform.OS === 'ios' ? 24 : 8,
          paddingTop: 8,
          height: Platform.OS === 'ios' ? 88 : 64,
          shadowColor: '#a78bfa',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.1,
          shadowRadius: 12,
          elevation: 15,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginTop: 2,
        },
        headerStyle: {
          backgroundColor: '#111122',
          shadowColor: 'transparent',
          elevation: 0,
          borderBottomWidth: 1,
          borderBottomColor: 'rgba(167,139,250,0.1)',
        },
        headerTintColor: '#fff',
        headerTitleStyle: {
          fontWeight: '800',
          fontSize: 18,
          letterSpacing: 0.5,
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
            pushToken={pushToken}
            receivedCode={receivedCode}
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
            pushToken={pushToken}
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
            onNetworkChange={onNetworkChange}
          />
        )}
      </Tab.Screen>
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabIconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  activeIndicator: {
    position: 'absolute',
    top: -10,
    width: 24,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#4FC3F7',
  },
});
