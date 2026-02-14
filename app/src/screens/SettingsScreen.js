import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
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
        <Text style={styles.sectionTitle}>{t(language, 'telegramAccountLink')}</Text>

        {wallet ? (
          loading ? (
            <Text style={styles.loadingText}>{t(language, 'loading')}</Text>
          ) : linkedTelegram ? (
            <View style={styles.linkedRow}>
              <Text style={styles.statusIcon}>✅</Text>
              <Text style={styles.statusText}>{t(language, 'connected')}</Text>
              <Text style={styles.hashText} numberOfLines={1}>
                {linkedTelegram.slice(0, 8)}...{linkedTelegram.slice(-8)}
              </Text>
            </View>
          ) : (
            <View style={styles.linkedRow}>
              <Text style={styles.statusIcon}>❌</Text>
              <Text style={styles.statusTextRed}>{t(language, 'notConnected')}</Text>
            </View>
          )
        ) : (
          <Text style={styles.walletRequiredText}>{t(language, 'walletRequired')}</Text>
        )}

        {/* Guide */}
        <View style={styles.guideBox}>
          <Text style={styles.guideTitle}>💡 {t(language, 'connectionGuide')}</Text>
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
            {wallet ? `${wallet.slice(0, 10)}...` : t(language, 'walletRequired')}
          </Text>
        </View>
      </View>

      {/* Language Settings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t(language, 'languageSettings')}</Text>
        <Text style={styles.sectionDesc}>{t(language, 'languageDesc')}</Text>

        <View style={styles.langRow}>
          <TouchableOpacity
            style={[styles.langBtn, language === 'ko' && styles.langBtnActive]}
            onPress={() => handleLanguageChange('ko')}
          >
            <Text
              style={[
                styles.langBtnText,
                language === 'ko' && styles.langBtnTextActive,
              ]}
            >
              한국어
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.langBtn, language === 'en' && styles.langBtnActive]}
            onPress={() => handleLanguageChange('en')}
          >
            <Text
              style={[
                styles.langBtnText,
                language === 'en' && styles.langBtnTextActive,
              ]}
            >
              English
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Information */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t(language, 'information')}</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>{t(language, 'version')}</Text>
          <Text style={styles.infoValue}>1.0.0</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>{t(language, 'network')}</Text>
          <Text style={styles.infoValue}>Tokamak L2</Text>
        </View>
        {wallet && (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{t(language, 'myWallet')}</Text>
            <Text style={styles.infoValue}>
              {wallet.slice(0, 6)}...{wallet.slice(-4)}
            </Text>
          </View>
        )}
      </View>

      {/* Wallet disconnect */}
      {wallet && (
        <TouchableOpacity style={styles.disconnectBtn} onPress={handleDisconnect}>
          <Text style={styles.disconnectBtnText}>{t(language, 'disconnect')}</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  section: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2a2a3e',
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 10,
  },
  sectionDesc: {
    color: '#888',
    fontSize: 13,
    marginBottom: 10,
  },
  loadingText: {
    color: '#888',
    fontSize: 13,
  },
  linkedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  statusIcon: {
    fontSize: 16,
  },
  statusText: {
    color: '#10b981',
    fontSize: 14,
    fontWeight: '600',
  },
  statusTextRed: {
    color: '#f87171',
    fontSize: 14,
  },
  hashText: {
    color: '#888',
    fontSize: 11,
    fontFamily: 'monospace',
    flex: 1,
  },
  walletRequiredText: {
    color: '#888',
    fontSize: 13,
  },
  guideBox: {
    backgroundColor: '#111122',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
  },
  guideTitle: {
    color: '#fbbf24',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  guideStep: {
    color: '#ccc',
    fontSize: 12,
    marginBottom: 3,
  },
  langRow: {
    flexDirection: 'row',
    gap: 10,
  },
  langBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#111122',
    alignItems: 'center',
  },
  langBtnActive: {
    backgroundColor: '#4FC3F7',
  },
  langBtnText: {
    color: '#888',
    fontSize: 14,
    fontWeight: '600',
  },
  langBtnTextActive: {
    color: '#fff',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a3e',
  },
  infoLabel: {
    color: '#888',
    fontSize: 13,
  },
  infoValue: {
    color: '#ccc',
    fontSize: 13,
  },
  disconnectBtn: {
    backgroundColor: '#ef4444',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  disconnectBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
