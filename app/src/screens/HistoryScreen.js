import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { getTelegramUsername, getDeviceBalance as getDeviceBalanceApi } from '../services/api';
import {
  getWalletLinkedTelegram,
  getTelegramBalanceContract,
  claimTelegramToWallet,
  getDeviceBalanceContract,
  getWalletLinkedDevice,
  claimDeviceToWalletContract,
} from '../services/contract';
import { getSigner } from '../services/wallet';
import { t } from '../utils/translations';

export default function HistoryScreen({ wallet, deviceId, language = 'ko', onBalanceChange }) {
  const [refreshing, setRefreshing] = useState(false);
  // Telegram state
  const [linkedTelegram, setLinkedTelegram] = useState(null);
  const [telegramHash, setTelegramHash] = useState(null);
  const [telegramBalance, setTelegramBalance] = useState(0);
  const [loading, setLoading] = useState(false);
  const [claiming, setClaiming] = useState(false);
  // Device state
  const [deviceBalance, setDeviceBalance] = useState(0);
  const [deviceHash, setDeviceHash] = useState(null);
  const [deviceLinked, setDeviceLinked] = useState(false);
  const [deviceLoading, setDeviceLoading] = useState(false);
  const [deviceClaiming, setDeviceClaiming] = useState(false);
  const [deviceLinking, setDeviceLinking] = useState(false);

  const fetchDeviceInfo = useCallback(async () => {
    if (!deviceId) return;
    setDeviceLoading(true);
    try {
      const data = await getDeviceBalanceApi(deviceId);
      setDeviceBalance(data.balance || 0);
      setDeviceHash(data.device_hash || null);

      // 지갑이 연결되어 있으면 디바이스 연결 상태 확인
      if (wallet) {
        try {
          const linked = await getWalletLinkedDevice(wallet);
          const zeroHash = '0x0000000000000000000000000000000000000000000000000000000000000000';
          setDeviceLinked(linked && linked !== zeroHash);
        } catch {
          setDeviceLinked(false);
        }
      }
    } catch {
      setDeviceBalance(0);
      setDeviceHash(null);
    } finally {
      setDeviceLoading(false);
    }
  }, [deviceId, wallet]);

  const fetchLinkedTelegram = useCallback(async () => {
    if (!wallet) return;
    setLoading(true);
    try {
      const hash = await getWalletLinkedTelegram(wallet);
      const zeroHash = '0x0000000000000000000000000000000000000000000000000000000000000000';
      const isLinked = hash && hash !== zeroHash;

      if (isLinked) {
        setTelegramHash(hash);
        try {
          const hashHex = hash.startsWith('0x') ? hash.slice(2) : hash;
          const message = `Verify telegram username for hash: ${hashHex}`;
          const signer = getSigner();
          const signature = await signer.signMessage(message);
          const data = await getTelegramUsername(hash, signature);
          if (data.telegram_username) {
            setLinkedTelegram(data.telegram_username);
          } else {
            setLinkedTelegram(t(language, 'connected'));
          }
        } catch {
          setLinkedTelegram(t(language, 'connected'));
        }

        try {
          const bal = await getTelegramBalanceContract(hash);
          setTelegramBalance(bal);
        } catch {
          setTelegramBalance(0);
        }
      } else {
        setLinkedTelegram(null);
        setTelegramHash(null);
        setTelegramBalance(0);
      }
    } catch {
      setLinkedTelegram(null);
      setTelegramHash(null);
      setTelegramBalance(0);
    } finally {
      setLoading(false);
    }
  }, [wallet, language]);

  useEffect(() => {
    fetchLinkedTelegram();
    fetchDeviceInfo();
  }, [fetchLinkedTelegram, fetchDeviceInfo]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchLinkedTelegram(), fetchDeviceInfo()]);
    setRefreshing(false);
  };

  const handleClaimToWallet = async () => {
    if (!telegramHash || telegramBalance <= 0) return;
    setClaiming(true);
    try {
      await claimTelegramToWallet(telegramHash);
      Alert.alert('', `${telegramBalance.toFixed(4)} TON transferred to wallet!`);
      await fetchLinkedTelegram();
      onBalanceChange?.();
    } catch (err) {
      Alert.alert('Error', err.message || 'Claim failed');
    } finally {
      setClaiming(false);
    }
  };

  // 디바이스 → 지갑 연결 (지갑 탭에서 인증 플로우 사용)
  const handleLinkDevice = () => {
    Alert.alert('', t(language, 'deviceWalletLink'), [{ text: 'OK' }]);
  };

  // 디바이스 잔액 → 지갑으로 출금
  const handleDeviceClaimToWallet = async () => {
    if (!deviceHash || deviceBalance <= 0) return;
    setDeviceClaiming(true);
    try {
      await claimDeviceToWalletContract('0x' + deviceHash);
      Alert.alert('', `${deviceBalance.toFixed(4)} TON transferred to wallet!`);
      await fetchDeviceInfo();
      onBalanceChange?.();
    } catch (err) {
      Alert.alert('Error', err.message || 'Claim failed');
    } finally {
      setDeviceClaiming(false);
    }
  };

  // 지갑 미연결이지만 디바이스 토큰이 있는 경우
  if (!wallet && deviceId) {
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4FC3F7" />
        }
      >
        {/* Device balance section */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionIcon}>📱</Text>
            <Text style={styles.sectionLabel}>{t(language, 'deviceBalance')}</Text>
          </View>
          {deviceLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color="#4FC3F7" />
              <Text style={styles.loadingText}>{t(language, 'loading')}</Text>
            </View>
          ) : (
            <View>
              <View style={styles.balanceSection}>
                <Text style={styles.balanceLabel}>{t(language, 'tonBalance')}</Text>
                <View style={styles.balanceRow}>
                  <Text style={styles.balanceAmount}>
                    {deviceBalance.toFixed(4)} TON
                  </Text>
                </View>
              </View>
              <View style={styles.connectWalletGuide}>
                <Text style={styles.connectWalletText}>
                  {t(language, 'connectWalletToWithdraw')}
                </Text>
              </View>
            </View>
          )}
        </View>
      </ScrollView>
    );
  }

  if (!wallet) {
    return (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyCard}>
          <Text style={styles.emptyIcon}>🔗</Text>
          <Text style={styles.emptyTitle}>{t(language, 'connectWalletPrompt')}</Text>
          <Text style={styles.emptySubtext}>Connect your wallet to view claim history</Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.listContent}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor="#4FC3F7"
        />
      }
    >
      {/* Wallet address card */}
      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionIcon}>👛</Text>
          <Text style={styles.sectionLabel}>{t(language, 'walletAddress')}</Text>
        </View>
        <View style={styles.walletBox}>
          <Text style={styles.walletAddress} numberOfLines={1}>
            {wallet}
          </Text>
        </View>
      </View>

      {/* Device balance section */}
      {deviceId && (
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionIcon}>📱</Text>
            <Text style={styles.sectionLabel}>{t(language, 'deviceBalance')}</Text>
          </View>

          {deviceLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color="#4FC3F7" />
              <Text style={styles.loadingText}>{t(language, 'loading')}</Text>
            </View>
          ) : (
            <View>
              <View style={styles.balanceSection}>
                <Text style={styles.balanceLabel}>{t(language, 'tonBalance')}</Text>
                <View style={styles.balanceRow}>
                  <Text style={styles.balanceAmount}>
                    {deviceBalance.toFixed(4)} TON
                  </Text>
                </View>
              </View>

              {/* Link device + Withdraw buttons */}
              <View style={styles.deviceActions}>
                {!deviceLinked ? (
                  <TouchableOpacity
                    style={[styles.claimBtn, styles.linkBtn, deviceLinking && styles.claimBtnDisabled]}
                    onPress={handleLinkDevice}
                    disabled={deviceLinking}
                    activeOpacity={0.7}
                  >
                    {deviceLinking ? (
                      <View style={styles.claimBtnInner}>
                        <ActivityIndicator size="small" color="#fff" />
                        <Text style={styles.claimBtnText}>{t(language, 'processing')}</Text>
                      </View>
                    ) : (
                      <Text style={styles.claimBtnText}>{t(language, 'linkDevice')}</Text>
                    )}
                  </TouchableOpacity>
                ) : (
                  <View style={styles.linkedBadge}>
                    <Text style={styles.checkIcon}>✅</Text>
                    <Text style={styles.linkedText}>{t(language, 'deviceLinked')}</Text>
                  </View>
                )}

                {deviceLinked && deviceBalance > 0 && (
                  <TouchableOpacity
                    style={[styles.claimBtn, deviceClaiming && styles.claimBtnDisabled]}
                    onPress={handleDeviceClaimToWallet}
                    disabled={deviceClaiming}
                    activeOpacity={0.7}
                  >
                    {deviceClaiming ? (
                      <View style={styles.claimBtnInner}>
                        <ActivityIndicator size="small" color="#fff" />
                        <Text style={styles.claimBtnText}>{t(language, 'processing')}</Text>
                      </View>
                    ) : (
                      <Text style={styles.claimBtnText}>{t(language, 'claimToWallet')}</Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
        </View>
      )}

      {/* Telegram section */}
      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionIcon}>💬</Text>
          <Text style={styles.sectionLabel}>{t(language, 'telegramAccount')}</Text>
        </View>

        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color="#4FC3F7" />
            <Text style={styles.loadingText}>{t(language, 'loading')}</Text>
          </View>
        ) : linkedTelegram ? (
          <View>
            <View style={styles.linkedRow}>
              <View style={styles.linkedBadge}>
                <Text style={styles.checkIcon}>✅</Text>
                <Text style={styles.linkedText}>{linkedTelegram}</Text>
              </View>
            </View>

            {/* Telegram balance */}
            <View style={styles.balanceSection}>
              <Text style={styles.balanceLabel}>{t(language, 'tonBalance')}</Text>
              <View style={styles.balanceRow}>
                <Text style={styles.balanceAmount}>
                  {telegramBalance.toFixed(4)} TON
                </Text>
                {telegramBalance > 0 && (
                  <TouchableOpacity
                    style={[styles.claimBtn, claiming && styles.claimBtnDisabled]}
                    onPress={handleClaimToWallet}
                    disabled={claiming}
                    activeOpacity={0.7}
                  >
                    {claiming ? (
                      <View style={styles.claimBtnInner}>
                        <ActivityIndicator size="small" color="#fff" />
                        <Text style={styles.claimBtnText}>
                          {t(language, 'processing')}
                        </Text>
                      </View>
                    ) : (
                      <Text style={styles.claimBtnText}>
                        {t(language, 'claimToWallet')}
                      </Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        ) : (
          <View>
            <View style={styles.notLinkedBadge}>
              <Text style={styles.notLinkedIcon}>⚠️</Text>
              <Text style={styles.notLinkedText}>
                {t(language, 'notConfigured')}
              </Text>
            </View>
            {/* Link guide */}
            <View style={styles.guideBox}>
              <Text style={styles.guideTitle}>
                💡 {t(language, 'telegramLinkGuide')}
              </Text>
              <View style={styles.guideDivider} />
              <Text style={styles.guideStep}>
                1. {t(language, 'telegramStep1')} @TokamonBot
              </Text>
              <Text style={styles.guideStep}>
                2. /start {t(language, 'telegramStep2')}
              </Text>
              <Text style={styles.guideStep}>
                3. /link {t(language, 'telegramStep3')}
              </Text>
              <Text style={styles.guideStep}>
                4. {t(language, 'telegramStep4')}
              </Text>
              <View style={styles.guideWalletBox}>
                <Text style={styles.guideWallet} numberOfLines={1}>
                  {wallet}
                </Text>
              </View>
              <Text style={styles.guideNote}>
                {t(language, 'telegramNote')}
              </Text>
            </View>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a1a',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  emptyContainer: {
    flex: 1,
    backgroundColor: '#0a0a1a',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyCard: {
    backgroundColor: '#12122a',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.1)',
    width: '100%',
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    color: '#ccc',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySubtext: {
    color: '#666',
    fontSize: 13,
    textAlign: 'center',
  },
  section: {
    backgroundColor: '#12122a',
    borderRadius: 16,
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  sectionIcon: {
    fontSize: 16,
  },
  sectionLabel: {
    color: '#999',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  walletBox: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  walletAddress: {
    color: '#bbb',
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  loadingText: {
    color: '#888',
    fontSize: 13,
  },
  linkedRow: {
    marginBottom: 4,
  },
  linkedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(16,185,129,0.1)',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  checkIcon: {
    fontSize: 14,
  },
  linkedText: {
    color: '#10b981',
    fontSize: 14,
    fontWeight: '700',
  },
  notLinkedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(248,113,113,0.1)',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  notLinkedIcon: {
    fontSize: 14,
  },
  notLinkedText: {
    color: '#f87171',
    fontSize: 13,
    fontWeight: '600',
  },
  balanceSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  balanceLabel: {
    color: '#888',
    fontSize: 12,
    marginBottom: 6,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  balanceAmount: {
    color: '#fbbf24',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  deviceActions: {
    marginTop: 12,
    gap: 8,
  },
  claimBtn: {
    backgroundColor: '#10b981',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 12,
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  linkBtn: {
    backgroundColor: '#3b82f6',
    shadowColor: '#3b82f6',
  },
  claimBtnDisabled: {
    backgroundColor: '#333',
    shadowColor: 'transparent',
  },
  claimBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  claimBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  connectWalletGuide: {
    marginTop: 12,
    backgroundColor: 'rgba(251,191,36,0.08)',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.15)',
  },
  connectWalletText: {
    color: '#fbbf24',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  guideBox: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    padding: 14,
    marginTop: 8,
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
  guideWalletBox: {
    backgroundColor: 'rgba(79,195,247,0.08)',
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginTop: 4,
    marginBottom: 6,
  },
  guideWallet: {
    color: '#4FC3F7',
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  guideNote: {
    color: '#10b981',
    fontSize: 12,
    marginTop: 4,
    fontWeight: '500',
  },
});
