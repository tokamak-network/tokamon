import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { disconnectWallet } from '../services/wallet';
import { t } from '../utils/translations';
import { setSelectedNetwork, getAllNetworks } from '../utils/networkStore';

export default function SettingsScreen({ wallet, language, networkId: currentNetworkId, onLanguageChange, onWalletDisconnect, onNetworkChange }) {

  const handleLanguageChange = async (lang) => {
    await AsyncStorage.setItem('language', lang);
    onLanguageChange(lang);
  };

  const handleNetworkChange = async (id) => {
    await setSelectedNetwork(id);
    onNetworkChange?.(id);
  };

  const handleDisconnect = () => {
    Alert.alert(
      t(language, 'disconnect'),
      '',
      [
        { text: t(language, 'cancel'), style: 'cancel' },
        {
          text: t(language, 'confirm'),
          style: 'destructive',
          onPress: async () => {
            await disconnectWallet();
            onWalletDisconnect?.();
          },
        },
      ]
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Language Settings */}
      <View style={styles.section}>
        <View style={styles.sectionTitleRow}>
          <Text style={styles.sectionTitleIcon}>🌐</Text>
          <Text style={styles.sectionTitle}>{t(language, 'languageSettings')}</Text>
        </View>
        <Text style={styles.sectionDesc}>{t(language, 'languageDesc')}</Text>

        <View style={styles.langRow}>
          <TouchableOpacity
            style={[styles.langBtn, language === 'ko' && styles.langBtnActive]}
            onPress={() => handleLanguageChange('ko')}
            activeOpacity={0.7}
          >
            <Text style={styles.langFlag}>🇰🇷</Text>
            <Text
              style={[
                styles.langBtnText,
                language === 'ko' && styles.langBtnTextActive,
              ]}
            >
              한국어
            </Text>
            {language === 'ko' && <Text style={styles.langCheck}>✓</Text>}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.langBtn, language === 'en' && styles.langBtnActive]}
            onPress={() => handleLanguageChange('en')}
            activeOpacity={0.7}
          >
            <Text style={styles.langFlag}>🇺🇸</Text>
            <Text
              style={[
                styles.langBtnText,
                language === 'en' && styles.langBtnTextActive,
              ]}
            >
              English
            </Text>
            {language === 'en' && <Text style={styles.langCheck}>✓</Text>}
          </TouchableOpacity>
        </View>
      </View>

      {/* Network Selection */}
      <View style={styles.section}>
        <View style={styles.sectionTitleRow}>
          <Text style={styles.sectionTitleIcon}>🌐</Text>
          <Text style={styles.sectionTitle}>{t(language, 'network')}</Text>
        </View>
        <View style={styles.networkRow}>
          {getAllNetworks().map((net) => (
            <TouchableOpacity
              key={net.id}
              style={[styles.networkBtn, currentNetworkId === net.id && styles.networkBtnActive]}
              onPress={() => handleNetworkChange(net.id)}
              activeOpacity={0.7}
            >
              <View style={[styles.networkDot, currentNetworkId === net.id ? styles.networkDotActive : styles.networkDotInactive]} />
              <View style={styles.networkBtnInfo}>
                <Text
                  style={[
                    styles.networkBtnText,
                    currentNetworkId === net.id && styles.networkBtnTextActive,
                  ]}
                  numberOfLines={1}
                >
                  {net.name}
                </Text>
                <Text style={styles.networkBtnChain}>Chain ID: {net.chainId}</Text>
              </View>
              {currentNetworkId === net.id && <Text style={styles.networkCheck}>✓</Text>}
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Information */}
      <View style={styles.section}>
        <View style={styles.sectionTitleRow}>
          <Text style={styles.sectionTitleIcon}>ℹ️</Text>
          <Text style={styles.sectionTitle}>{t(language, 'information')}</Text>
        </View>
        <View style={[styles.infoRow, styles.infoRowLast]}>
          <Text style={styles.infoLabel}>{t(language, 'version')}</Text>
          <View style={styles.infoValueBadge}>
            <Text style={styles.infoValue}>1.0.0</Text>
          </View>
        </View>
      </View>

      {/* Powered by */}
      <View style={styles.poweredBy}>
        <Text style={styles.poweredByText}>Powered by Tokamak Network</Text>
      </View>

      {/* Wallet disconnect */}
      {wallet && (
        <TouchableOpacity
          style={styles.disconnectBtn}
          onPress={handleDisconnect}
          activeOpacity={0.7}
        >
          <Text style={styles.disconnectBtnIcon}>⚠️</Text>
          <Text style={styles.disconnectBtnText}>{t(language, 'disconnect')}</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a1a',
  },
  content: {
    flexGrow: 1,
    padding: 16,
    paddingBottom: 40,
  },
  section: {
    backgroundColor: '#12122a',
    borderRadius: 16,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionTitleIcon: {
    fontSize: 18,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  sectionDesc: {
    color: '#777',
    fontSize: 13,
    marginBottom: 12,
    lineHeight: 18,
  },
  langRow: {
    flexDirection: 'row',
    gap: 10,
  },
  langBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  langBtnActive: {
    backgroundColor: 'rgba(79,195,247,0.15)',
    borderColor: 'rgba(79,195,247,0.4)',
  },
  langFlag: {
    fontSize: 18,
  },
  langBtnText: {
    color: '#777',
    fontSize: 15,
    fontWeight: '600',
  },
  langBtnTextActive: {
    color: '#4FC3F7',
    fontWeight: '700',
  },
  langCheck: {
    color: '#4FC3F7',
    fontSize: 14,
    fontWeight: '800',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  infoRowLast: {
    borderBottomWidth: 0,
  },
  infoLabel: {
    color: '#777',
    fontSize: 13,
    fontWeight: '500',
  },
  infoLabelActive: {
    color: '#10b981',
    fontWeight: '600',
  },
  infoValueBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    gap: 4,
  },
  infoValueNetwork: {
    backgroundColor: 'rgba(16,185,129,0.08)',
  },
  networkRow: {
    gap: 8,
  },
  networkBtn: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  networkBtnActive: {
    backgroundColor: 'rgba(16,185,129,0.12)',
    borderColor: 'rgba(16,185,129,0.35)',
  },
  networkBtnInfo: {
    flex: 1,
  },
  networkBtnText: {
    color: '#777',
    fontSize: 14,
    fontWeight: '600',
  },
  networkBtnTextActive: {
    color: '#10b981',
    fontWeight: '700',
  },
  networkBtnChain: {
    color: '#555',
    fontSize: 11,
    marginTop: 2,
  },
  networkCheck: {
    color: '#10b981',
    fontSize: 14,
    fontWeight: '800',
  },
  networkDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  networkDotActive: {
    backgroundColor: '#10b981',
  },
  networkDotInactive: {
    backgroundColor: '#555',
  },
  infoValue: {
    color: '#ccc',
    fontSize: 13,
    fontWeight: '500',
  },
  infoValueGreen: {
    color: '#10b981',
  },
  infoValueMono: {
    color: '#4FC3F7',
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  poweredBy: {
    alignItems: 'center',
    paddingVertical: 16,
    marginTop: 'auto',
  },
  poweredByText: {
    color: '#444',
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.5,
  },
  disconnectBtn: {
    backgroundColor: 'rgba(239,68,68,0.12)',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 4,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.25)',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  disconnectBtnIcon: {
    fontSize: 14,
  },
  disconnectBtnText: {
    color: '#ef4444',
    fontSize: 15,
    fontWeight: '700',
  },
});
