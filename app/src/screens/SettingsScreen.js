import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getTelegramLinked } from '../services/api';
import { disconnectWallet } from '../services/wallet';
import { t } from '../utils/translations';

export default function SettingsScreen({ wallet, language, onLanguageChange, onWalletDisconnect }) {
  const [linkedTelegram, setLinkedTelegram] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (wallet) {
      fetchLinkedTelegram();
    }
  }, [wallet]);

  const fetchLinkedTelegram = async () => {
    if (!wallet) return;
    setLoading(true);
    try {
      const data = await getTelegramLinked(wallet);
      if (data.linked && data.telegram_hash) {
        setLinkedTelegram(data.telegram_hash);
      } else {
        setLinkedTelegram(null);
      }
    } catch {
      setLinkedTelegram(null);
    } finally {
      setLoading(false);
    }
  };

  const handleLanguageChange = async (lang) => {
    await AsyncStorage.setItem('language', lang);
    onLanguageChange(lang);
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
      {/* Telegram Account Link */}
      <View style={styles.section}>
        <View style={styles.sectionTitleRow}>
          <Text style={styles.sectionTitleIcon}>💬</Text>
          <Text style={styles.sectionTitle}>{t(language, 'telegramAccountLink')}</Text>
        </View>

        {wallet ? (
          loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color="#4FC3F7" />
              <Text style={styles.loadingText}>{t(language, 'loading')}</Text>
            </View>
          ) : linkedTelegram ? (
            <View style={styles.linkedBadge}>
              <Text style={styles.statusIcon}>✅</Text>
              <Text style={styles.statusText}>{t(language, 'connected')}</Text>
              <Text style={styles.hashText} numberOfLines={1}>
                {linkedTelegram.slice(0, 8)}...{linkedTelegram.slice(-8)}
              </Text>
            </View>
          ) : (
            <View style={styles.unlinkedBadge}>
              <Text style={styles.statusIcon}>❌</Text>
              <Text style={styles.statusTextRed}>{t(language, 'notConnected')}</Text>
            </View>
          )
        ) : (
          <View style={styles.walletRequiredBadge}>
            <Text style={styles.walletRequiredIcon}>🔗</Text>
            <Text style={styles.walletRequiredText}>{t(language, 'walletRequired')}</Text>
          </View>
        )}

        {/* Guide */}
        <View style={styles.guideBox}>
          <Text style={styles.guideTitle}>💡 {t(language, 'connectionGuide')}</Text>
          <View style={styles.guideDivider} />
          <Text style={styles.guideStep}>
            1. {t(language, 'guideStep1')} @TokamonBot {t(language, 'guideStep1_2')}
          </Text>
          <Text style={styles.guideStep}>
            2. /start {t(language, 'guideStep2')}
          </Text>
          <Text style={styles.guideStep}>
            3. /link {t(language, 'guideStep3')}
          </Text>
          <Text style={styles.guideStep}>
            4. {t(language, 'guideStep4')}{' '}
            {wallet ? (
              <Text style={styles.guideWalletInline}>{wallet.slice(0, 10)}...</Text>
            ) : t(language, 'walletRequired')}
          </Text>
        </View>
      </View>

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

      {/* Information */}
      <View style={styles.section}>
        <View style={styles.sectionTitleRow}>
          <Text style={styles.sectionTitleIcon}>ℹ️</Text>
          <Text style={styles.sectionTitle}>{t(language, 'information')}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>{t(language, 'version')}</Text>
          <View style={styles.infoValueBadge}>
            <Text style={styles.infoValue}>1.0.0</Text>
          </View>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>{t(language, 'network')}</Text>
          <View style={[styles.infoValueBadge, styles.infoValueNetwork]}>
            <View style={styles.networkDot} />
            <Text style={[styles.infoValue, styles.infoValueGreen]}>Tokamak L2</Text>
          </View>
        </View>
        {wallet && (
          <View style={[styles.infoRow, styles.infoRowLast]}>
            <Text style={styles.infoLabel}>{t(language, 'myWallet')}</Text>
            <Text style={styles.infoValueMono}>
              {wallet.slice(0, 6)}...{wallet.slice(-4)}
            </Text>
          </View>
        )}
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
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  loadingText: {
    color: '#888',
    fontSize: 13,
  },
  linkedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(16,185,129,0.08)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.15)',
    flexWrap: 'wrap',
  },
  unlinkedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(248,113,113,0.08)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.15)',
  },
  statusIcon: {
    fontSize: 14,
  },
  statusText: {
    color: '#10b981',
    fontSize: 14,
    fontWeight: '700',
  },
  statusTextRed: {
    color: '#f87171',
    fontSize: 14,
    fontWeight: '600',
  },
  hashText: {
    color: '#777',
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    flex: 1,
  },
  walletRequiredBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.03)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  walletRequiredIcon: {
    fontSize: 14,
  },
  walletRequiredText: {
    color: '#777',
    fontSize: 13,
  },
  guideBox: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.1)',
  },
  guideTitle: {
    color: '#fbbf24',
    fontSize: 13,
    fontWeight: '700',
  },
  guideDivider: {
    height: 1,
    backgroundColor: 'rgba(251,191,36,0.1)',
    marginVertical: 8,
  },
  guideStep: {
    color: '#bbb',
    fontSize: 12,
    marginBottom: 4,
    lineHeight: 18,
  },
  guideWalletInline: {
    color: '#4FC3F7',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 11,
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
  networkDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10b981',
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
