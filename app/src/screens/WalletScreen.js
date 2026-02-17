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
import { useWalletConnectModal } from '@walletconnect/modal-react-native';
import {
  getDeviceBalance as getDeviceBalanceApi,
  getDeviceBalanceByListenerUrl,
  linkDeviceToWallet as linkDeviceToWalletApi,
} from '../services/api';
import {
  getWalletLinkedDevice,
  claimDeviceToWalletContract,
} from '../services/contract';
import { disconnectWallet, setWalletFromWC } from '../services/wallet';
import { getAllNetworks, getNetworkConfig, getSelectedNetwork } from '../utils/networkStore';
import NetworkSelector from '../components/NetworkSelector';
import { t } from '../utils/translations';

export default function WalletScreen({ wallet, pushToken, language = 'ko', networkId, onNetworkChange }) {
  const { open, isConnected: wcConnected, provider: wcProvider } = useWalletConnectModal();
  const [refreshing, setRefreshing] = useState(false);
  const [networkBalances, setNetworkBalances] = useState({});
  const [balancesLoading, setBalancesLoading] = useState(false);
  const [deviceHash, setDeviceHash] = useState(null);
  const [deviceLinked, setDeviceLinked] = useState(false);
  const [deviceClaiming, setDeviceClaiming] = useState(false);
  const [deviceLinking, setDeviceLinking] = useState(false);

  const networks = getAllNetworks();
  const currentNetwork = getNetworkConfig();

  // WalletConnect 연결 완료 시 signer 설정
  useEffect(() => {
    if (wcConnected && wcProvider) {
      setWalletFromWC(wcProvider).catch((err) => {
        console.warn('WalletConnect signer setup failed:', err.message);
      });
    }
  }, [wcConnected, wcProvider]);

  // WalletConnect로 연결
  const handleWalletConnect = async () => {
    try {
      await open();
    } catch (err) {
      Alert.alert('WalletConnect', err.message || 'Connection failed');
    }
  };

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
          // 현재 네트워크의 device_hash 저장
          if (net.id === getSelectedNetwork()) {
            setDeviceHash(data.device_hash || null);
          }
        } catch {
          balances[net.id] = 0;
        }
      })
    );
    setNetworkBalances(balances);

    if (wallet) {
      try {
        const linked = await getWalletLinkedDevice(wallet);
        const zeroHash = '0x0000000000000000000000000000000000000000000000000000000000000000';
        setDeviceLinked(linked && linked !== zeroHash);
      } catch {
        setDeviceLinked(false);
      }
    }
    setBalancesLoading(false);
  }, [pushToken, wallet, networkId]);

  useEffect(() => {
    fetchAllBalances();
  }, [fetchAllBalances]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAllBalances();
    setRefreshing(false);
  };

  const totalBalance = Object.values(networkBalances).reduce((sum, b) => sum + b, 0);
  const currentBalance = networkBalances[networkId] || 0;

  // 지갑 연결 해제
  const handleDisconnect = async () => {
    await disconnectWallet();
    setDeviceLinked(false);
  };

  // 디바이스 → 지갑 연결
  const handleLinkDevice = async () => {
    if (!pushToken || !wallet) return;
    setDeviceLinking(true);
    try {
      await linkDeviceToWalletApi(pushToken, wallet);
      Alert.alert('', t(language, 'deviceLinked'));
      setDeviceLinked(true);
      await fetchAllBalances();
    } catch (err) {
      Alert.alert('Error', err.message || 'Link failed');
    } finally {
      setDeviceLinking(false);
    }
  };

  // 디바이스 잔액 → 지갑으로 출금
  const handleDeviceClaimToWallet = async () => {
    if (!deviceHash || currentBalance <= 0) return;
    setDeviceClaiming(true);
    try {
      await claimDeviceToWalletContract('0x' + deviceHash);
      Alert.alert('', `${currentBalance.toFixed(4)} TON ${t(language, 'claimToWalletSuccess') || '지갑으로 전송 완료!'}`);
      await fetchAllBalances();
    } catch (err) {
      Alert.alert('Error', err.message || 'Claim failed');
    } finally {
      setDeviceClaiming(false);
    }
  };

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
          <Text style={styles.totalBalanceLabel}>{t(language, 'deviceBalance')}</Text>
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
                  <Text style={styles.networkBalanceChain}>Chain {net.chainId}</Text>
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

      {/* Wallet Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionIcon}>👛</Text>
          <Text style={styles.sectionLabel}>{t(language, 'walletAddress')}</Text>
        </View>

        {/* Current Network */}
        <View style={styles.currentNetworkRow}>
          <NetworkSelector currentNetworkId={networkId} onNetworkChange={onNetworkChange} />
        </View>

        {wallet ? (
          <View>
            <View style={styles.walletBox}>
              <Text style={styles.walletAddress} numberOfLines={1}>{wallet}</Text>
            </View>
            <TouchableOpacity onPress={handleDisconnect} style={styles.disconnectBtn}>
              <Text style={styles.disconnectBtnText}>{t(language, 'disconnect')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.wcBtn}
            onPress={handleWalletConnect}
            activeOpacity={0.7}
          >
            <Text style={styles.wcBtnIcon}>🔗</Text>
            <View style={styles.wcBtnInfo}>
              <Text style={styles.wcBtnTitle}>WalletConnect</Text>
              <Text style={styles.wcBtnDesc}>MetaMask, Trust Wallet...</Text>
            </View>
          </TouchableOpacity>
        )}
      </View>

      {/* Device → Wallet Actions */}
      {wallet && pushToken && (
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionIcon}>📱</Text>
            <Text style={styles.sectionLabel}>{t(language, 'claimToWallet')}</Text>
          </View>

          {!deviceLinked ? (
            <View>
              <Text style={styles.guideText}>
                {t(language, 'connectWalletToWithdraw')}
              </Text>
              <TouchableOpacity
                style={[styles.actionBtn, styles.linkBtn, deviceLinking && styles.actionBtnDisabled]}
                onPress={handleLinkDevice}
                disabled={deviceLinking}
                activeOpacity={0.7}
              >
                {deviceLinking ? (
                  <View style={styles.actionBtnInner}>
                    <ActivityIndicator size="small" color="#fff" />
                    <Text style={styles.actionBtnText}>{t(language, 'processing')}</Text>
                  </View>
                ) : (
                  <Text style={styles.actionBtnText}>{t(language, 'linkDevice')}</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <View>
              <View style={styles.linkedBadge}>
                <Text style={styles.linkedText}>{t(language, 'deviceLinked')}</Text>
              </View>

              {currentBalance > 0 && (
                <TouchableOpacity
                  style={[styles.actionBtn, deviceClaiming && styles.actionBtnDisabled]}
                  onPress={handleDeviceClaimToWallet}
                  disabled={deviceClaiming}
                  activeOpacity={0.7}
                >
                  {deviceClaiming ? (
                    <View style={styles.actionBtnInner}>
                      <ActivityIndicator size="small" color="#fff" />
                      <Text style={styles.actionBtnText}>{t(language, 'processing')}</Text>
                    </View>
                  ) : (
                    <Text style={styles.actionBtnText}>
                      {currentBalance.toFixed(4)} TON {t(language, 'claimToWallet')}
                    </Text>
                  )}
                </TouchableOpacity>
              )}
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
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
  // Current Network in Wallet
  currentNetworkRow: {
    marginBottom: 10,
  },
  // Connect Options
  wcBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(59,130,246,0.12)',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.3)',
  },
  wcBtnIcon: {
    fontSize: 24,
  },
  wcBtnInfo: {
    flex: 1,
  },
  wcBtnTitle: {
    color: '#3b82f6',
    fontSize: 16,
    fontWeight: '700',
  },
  wcBtnDesc: {
    color: '#666',
    fontSize: 12,
    marginTop: 2,
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
  disconnectBtn: {
    marginTop: 10,
    alignItems: 'center',
    paddingVertical: 8,
  },
  disconnectBtnText: {
    color: '#ef4444',
    fontSize: 13,
    fontWeight: '600',
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
});
