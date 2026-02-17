import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Alert,
  ActivityIndicator,
  Platform,
  Linking,
} from 'react-native';
import * as Location from 'expo-location';
import {
  getDeviceBalance as getDeviceBalanceApi,
  getDeviceBalanceByListenerUrl,
  requestWalletLinkCode,
  verifyAndLinkWallet,
} from '../services/api';
import { getAllNetworks, getSelectedNetwork } from '../utils/networkStore';
import { WEB_CLIENT_URL } from '../utils/constants';
import { t } from '../utils/translations';

export default function WalletScreen({ pushToken, receivedCode, language = 'ko', networkId, onNetworkChange }) {
  const [refreshing, setRefreshing] = useState(false);
  const [networkBalances, setNetworkBalances] = useState({});
  const [balancesLoading, setBalancesLoading] = useState(false);
  const [deviceHash, setDeviceHash] = useState(null);
  const [userPos, setUserPos] = useState(null);
  const [linkedWallet, setLinkedWallet] = useState(null);
  const [walletInput, setWalletInput] = useState('');
  const [linkPhase, setLinkPhase] = useState('idle'); // idle | requesting | waiting_code | verifying
  const [walletInputError, setWalletInputError] = useState('');

  const networks = getAllNetworks();

  // GPS 위치 가져오기
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const loc = await Location.getCurrentPositionAsync({});
      setUserPos({ lat: loc.coords.latitude, lng: loc.coords.longitude });
    })();
  }, []);

  // 모든 네트워크의 잔액 조회
  const fetchAllBalances = useCallback(async () => {
    if (!pushToken) return;
    setBalancesLoading(true);
    const balances = {};
    await Promise.all(
      networks.map(async (net) => {
        try {
          const data = await getDeviceBalanceByListenerUrl(pushToken, net.listenerUrl);
          balances[net.id] = data.balance || 0;
          // 현재 네트워크의 device_hash + linked_wallet 저장
          if (net.id === getSelectedNetwork()) {
            setDeviceHash(data.device_hash || null);
            if (data.linked_wallet) {
              setLinkedWallet(data.linked_wallet);
            }
          }
        } catch {
          balances[net.id] = 0;
        }
      })
    );
    setNetworkBalances(balances);
    setBalancesLoading(false);
  }, [pushToken, networkId]);

  useEffect(() => {
    fetchAllBalances();
  }, [fetchAllBalances]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAllBalances();
    setRefreshing(false);
  };

  // FCM 자동 인증: wallet_link 코드 수신 시 자동으로 verify-and-link 호출
  useEffect(() => {
    if (
      receivedCode &&
      receivedCode.spotId === 'wallet_link' &&
      linkPhase === 'waiting_code' &&
      walletInput
    ) {
      handleVerifyLink(receivedCode.code);
    }
  }, [receivedCode]);

  const handleRequestLinkCode = async () => {
    const addr = walletInput.trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) {
      setWalletInputError(t(language, 'invalidWalletAddress'));
      return;
    }
    if (linkedWallet && addr.toLowerCase() === linkedWallet.toLowerCase()) {
      setWalletInputError(t(language, 'sameWalletError'));
      return;
    }
    setWalletInputError('');
    setLinkPhase('requesting');
    try {
      const result = await requestWalletLinkCode(pushToken, addr);
      if (result.debug_code) {
        // FCM 전송 실패 시 debug_code로 자동 인증
        setLinkPhase('verifying');
        await handleVerifyLink(result.debug_code);
      } else {
        setLinkPhase('waiting_code');
      }
    } catch (err) {
      Alert.alert('Error', err.message || 'Request failed');
      setLinkPhase('idle');
    }
  };

  const handleVerifyLink = async (code) => {
    setLinkPhase('verifying');
    try {
      const result = await verifyAndLinkWallet(pushToken, walletInput.trim(), code);
      if (result.success) {
        setLinkedWallet(walletInput.trim());
        setWalletInput('');
        Alert.alert('', t(language, 'walletLinkSuccess'));
      }
    } catch (err) {
      Alert.alert('Error', err.message || 'Verification failed');
    } finally {
      setLinkPhase('idle');
    }
  };

  const totalBalance = Object.values(networkBalances).reduce((sum, b) => sum + b, 0);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.listContent}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4FC3F7" />
      }
    >
      {/* Total Balance Card */}
      {pushToken && (
        <View style={styles.totalBalanceCard}>
          <View style={styles.balanceHeaderRow}>
            <Text style={styles.totalBalanceLabel}>{t(language, 'deviceBalance')}</Text>
            <TouchableOpacity style={styles.refreshBtn} onPress={fetchAllBalances} activeOpacity={0.7}>
              <Text style={styles.refreshBtnText}>↻</Text>
            </TouchableOpacity>
          </View>
          {balancesLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color="#4FC3F7" />
              <Text style={styles.loadingText}>{t(language, 'loading')}</Text>
            </View>
          ) : (
            <Text style={styles.totalBalanceAmount}>
              {totalBalance.toFixed(4)} <Text style={styles.totalBalanceUnit}>TON</Text>
            </Text>
          )}
        </View>
      )}

      {/* Current Location */}
      {userPos && (
        <View style={styles.locationRow}>
          <Text style={styles.locationIcon}>📍</Text>
          <Text style={styles.locationText}>
            {userPos.lat.toFixed(6)}, {userPos.lng.toFixed(6)}
          </Text>
        </View>
      )}

      {/* Multiverse Balances */}
      {pushToken && (
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionIcon}>🌐</Text>
            <Text style={styles.sectionLabel}>Multiverse</Text>
          </View>

          {networks.map((net) => {
            const balance = networkBalances[net.id] || 0;
            const isActive = net.id === networkId;
            return (
              <View key={net.id} style={[styles.networkBalanceRow, isActive && styles.networkBalanceRowActive]}>
                <View style={[styles.netDot, isActive ? styles.netDotActive : styles.netDotInactive]} />
                <View style={styles.networkBalanceInfo}>
                  <Text style={[styles.networkBalanceName, isActive && styles.networkBalanceNameActive]}>
                    {net.name}
                  </Text>
                  <Text style={styles.networkBalanceChain}>Chain ID: {net.chainId} (0x{net.chainId.toString(16)})</Text>
                </View>
                {balancesLoading ? (
                  <ActivityIndicator size="small" color="#666" />
                ) : (
                  <Text style={[styles.networkBalanceAmount, balance > 0 && styles.networkBalanceAmountPositive]}>
                    {balance.toFixed(4)} <Text style={styles.networkBalanceUnit}>TON</Text>
                  </Text>
                )}
              </View>
            );
          })}
        </View>
      )}

      {/* Device Wallet Registration */}
      {pushToken && (
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionIcon}>🔐</Text>
            <Text style={styles.sectionLabel}>{t(language, 'deviceWalletLink')}</Text>
          </View>

          {linkedWallet ? (
            <View>
              <View style={styles.linkedBadge}>
                <Text style={styles.linkedText}>{t(language, 'walletLinked')}</Text>
              </View>
              <View style={styles.walletBox}>
                <Text style={styles.walletAddress} numberOfLines={1}>{linkedWallet}</Text>
              </View>
              <View style={styles.claimGuideBox}>
                <Text style={styles.claimGuideText}>{t(language, 'claimViaWebGuide')}</Text>
                <Text
                  style={styles.claimGuideUrl}
                  onPress={() => Linking.openURL(WEB_CLIENT_URL)}
                >
                  {WEB_CLIENT_URL}
                </Text>
              </View>
            </View>
          ) : linkPhase === 'requesting' || linkPhase === 'waiting_code' || linkPhase === 'verifying' ? (
            <View>
              <View style={styles.actionBtnInner}>
                <ActivityIndicator size="small" color="#4FC3F7" />
                <Text style={styles.loadingText}>
                  {linkPhase === 'requesting' ? t(language, 'requestingCode') :
                   linkPhase === 'waiting_code' ? t(language, 'waitingCode') :
                   t(language, 'processing')}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.actionBtn, styles.cancelBtn]}
                onPress={() => setLinkPhase('idle')}
                activeOpacity={0.7}
              >
                <Text style={styles.actionBtnText}>{t(language, 'cancel')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View>
              <Text style={styles.guideText}>{t(language, 'enterWalletToLink')}</Text>
              <TextInput
                style={[styles.walletInput, walletInputError ? styles.walletInputError : null]}
                value={walletInput}
                onChangeText={(text) => {
                  setWalletInput(text);
                  if (walletInputError) setWalletInputError('');
                }}
                placeholder="0x..."
                placeholderTextColor="#555"
                autoCapitalize="none"
                autoCorrect={false}
              />
              {walletInputError ? (
                <Text style={styles.errorText}>{walletInputError}</Text>
              ) : null}
              <TouchableOpacity
                style={[styles.actionBtn, styles.linkBtn, !walletInput && styles.actionBtnDisabled]}
                onPress={handleRequestLinkCode}
                disabled={!walletInput}
                activeOpacity={0.7}
              >
                <Text style={styles.actionBtnText}>{t(language, 'registerWallet')}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

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
  // Total Balance Card
  totalBalanceCard: {
    backgroundColor: '#12122a',
    borderRadius: 20,
    padding: 24,
    marginTop: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.15)',
    shadowColor: '#fbbf24',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 6,
  },
  totalBalanceLabel: {
    color: '#999',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  balanceHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: 8,
  },
  refreshBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshBtnText: {
    fontSize: 18,
    color: '#999',
  },
  totalBalanceAmount: {
    color: '#fbbf24',
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  totalBalanceUnit: {
    fontSize: 18,
    fontWeight: '600',
    color: '#d4a017',
  },
  // Section
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
  // Network Balances
  networkBalanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 4,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  networkBalanceRowActive: {
    backgroundColor: 'rgba(16,185,129,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.2)',
  },
  netDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  netDotActive: {
    backgroundColor: '#10b981',
  },
  netDotInactive: {
    backgroundColor: '#555',
  },
  networkBalanceInfo: {
    flex: 1,
  },
  networkBalanceName: {
    color: '#bbb',
    fontSize: 14,
    fontWeight: '600',
  },
  networkBalanceNameActive: {
    color: '#10b981',
    fontWeight: '700',
  },
  networkBalanceChain: {
    color: '#666',
    fontSize: 11,
    marginTop: 2,
  },
  networkBalanceAmount: {
    color: '#777',
    fontSize: 15,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  networkBalanceAmountPositive: {
    color: '#fbbf24',
  },
  networkBalanceUnit: {
    fontSize: 11,
    fontWeight: '600',
  },
  // Wallet
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
  // Actions
  guideText: {
    color: '#888',
    fontSize: 13,
    marginBottom: 10,
  },
  actionBtn: {
    backgroundColor: '#10b981',
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
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
  actionBtnDisabled: {
    backgroundColor: '#333',
    shadowColor: 'transparent',
  },
  actionBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  claimGuideBox: {
    backgroundColor: 'rgba(59,130,246,0.08)',
    borderRadius: 10,
    padding: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.15)',
  },
  claimGuideText: {
    color: '#8bb8f0',
    fontSize: 13,
    lineHeight: 19,
  },
  claimGuideUrl: {
    color: '#60a5fa',
    fontSize: 13,
    marginTop: 8,
    textDecorationLine: 'underline',
  },
  linkedBadge: {
    backgroundColor: 'rgba(16,185,129,0.1)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  linkedText: {
    color: '#10b981',
    fontSize: 14,
    fontWeight: '700',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 4,
  },
  locationIcon: {
    fontSize: 13,
  },
  locationText: {
    color: '#888',
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
  walletInput: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    color: '#ddd',
    fontSize: 14,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.2)',
    marginBottom: 8,
  },
  walletInputError: {
    borderColor: '#ef4444',
  },
  errorText: {
    color: '#ef4444',
    fontSize: 12,
    marginBottom: 8,
  },
  cancelBtn: {
    backgroundColor: '#555',
    shadowColor: 'transparent',
    marginTop: 12,
  },
});
