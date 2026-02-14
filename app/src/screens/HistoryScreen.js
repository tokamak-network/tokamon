import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Alert,
} from 'react-native';
import { getClaimHistory } from '../services/api';
import { getTelegramLinked } from '../services/api';
import {
  getWalletLinkedTelegram,
  getTelegramBalanceContract,
  claimTelegramToWallet,
} from '../services/contract';
import { t } from '../utils/translations';

function formatTime(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp * 1000);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${month}/${day} ${hours}:${minutes}`;
}

export default function HistoryScreen({ wallet, language = 'ko', onBalanceChange }) {
  const [history, setHistory] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [linkedTelegram, setLinkedTelegram] = useState(null);
  const [telegramHash, setTelegramHash] = useState(null);
  const [telegramBalance, setTelegramBalance] = useState(0);
  const [loading, setLoading] = useState(false);
  const [claiming, setClaiming] = useState(false);

  const fetchHistory = useCallback(async () => {
    if (!wallet) return;
    try {
      const data = await getClaimHistory(wallet);
      setHistory(data);
    } catch (err) {
      console.warn('Failed to fetch history:', err.message);
    }
  }, [wallet]);

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
          const data = await getTelegramLinked(wallet);
          if (data.linked && data.telegram_username) {
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
    fetchHistory();
    fetchLinkedTelegram();
  }, [fetchHistory, fetchLinkedTelegram]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchHistory(), fetchLinkedTelegram()]);
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

  if (!wallet) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyIcon}>🔗</Text>
        <Text style={styles.emptyText}>{t(language, 'connectWalletPrompt')}</Text>
      </View>
    );
  }

  const renderHistoryItem = ({ item, index }) => {
    const hasBonus = item.bonus && item.bonus > 0;
    const totalReward = (item.reward || 0) + (item.bonus || 0);

    return (
      <View style={styles.historyItem}>
        <View style={styles.historyTop}>
          <Text style={styles.historyName} numberOfLines={1}>
            {item.spot_name || `Spot #${item.spot_id}`}
          </Text>
          <Text style={styles.historyAmount}>+{totalReward} TON</Text>
        </View>
        <View style={styles.historyBottom}>
          <Text style={styles.historyTime}>{formatTime(item.timestamp)}</Text>
          {item.stamp !== undefined && (
            <Text style={styles.historyStamp}>
              {t(language, 'stampGoalAchievement')} {item.stamp}/{item.stamp_goal || '?'}
            </Text>
          )}
        </View>
        {hasBonus && (
          <Text style={styles.historyBonus}>
            Stamp bonus +{item.bonus} TON
          </Text>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={history}
        keyExtractor={(item, idx) => `${item.spot_id}-${idx}`}
        renderItem={renderHistoryItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#4FC3F7"
          />
        }
        ListHeaderComponent={
          <View>
            {/* Wallet address */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>{t(language, 'walletAddress')}</Text>
              <Text style={styles.walletAddress} numberOfLines={1}>
                {wallet}
              </Text>
            </View>

            {/* Telegram section */}
            <View style={styles.section}>
              <View style={styles.telegramHeader}>
                <Text style={styles.telegramIcon}>💬</Text>
                <Text style={styles.sectionLabel}>{t(language, 'telegramAccount')}</Text>
              </View>

              {loading ? (
                <Text style={styles.loadingText}>{t(language, 'loading')}</Text>
              ) : linkedTelegram ? (
                <View>
                  <View style={styles.linkedRow}>
                    <Text style={styles.checkIcon}>✅</Text>
                    <Text style={styles.linkedText}>{linkedTelegram}</Text>
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
                          style={styles.claimBtn}
                          onPress={handleClaimToWallet}
                          disabled={claiming}
                        >
                          <Text style={styles.claimBtnText}>
                            {claiming
                              ? t(language, 'processing')
                              : t(language, 'claimToWallet')}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                </View>
              ) : (
                <View>
                  <Text style={styles.notLinkedText}>
                    {t(language, 'notConfigured')}
                  </Text>
                  {/* Link guide */}
                  <View style={styles.guideBox}>
                    <Text style={styles.guideTitle}>
                      💡 {t(language, 'telegramLinkGuide')}
                    </Text>
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
                    <Text style={styles.guideWallet} numberOfLines={1}>
                      {wallet}
                    </Text>
                    <Text style={styles.guideNote}>
                      {t(language, 'telegramNote')}
                    </Text>
                  </View>
                </View>
              )}
            </View>

            {/* Claim History Header */}
            <Text style={styles.historyHeader}>{t(language, 'claimHistory')}</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.historyEmpty}>
            <Text style={styles.emptyText}>{t(language, 'noClaimHistory')}</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  emptyContainer: {
    flex: 1,
    backgroundColor: '#0f0f0f',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyText: {
    color: '#888',
    fontSize: 15,
    textAlign: 'center',
  },
  section: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#2a2a3e',
  },
  sectionLabel: {
    color: '#888',
    fontSize: 12,
    marginBottom: 4,
  },
  walletAddress: {
    color: '#ccc',
    fontSize: 13,
    fontFamily: 'monospace',
  },
  telegramHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  telegramIcon: {
    fontSize: 18,
  },
  loadingText: {
    color: '#888',
    fontSize: 13,
  },
  linkedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  checkIcon: {
    fontSize: 16,
  },
  linkedText: {
    color: '#10b981',
    fontSize: 14,
    fontWeight: '600',
  },
  notLinkedText: {
    color: '#f87171',
    fontSize: 13,
  },
  balanceSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#2a2a3e',
  },
  balanceLabel: {
    color: '#888',
    fontSize: 12,
    marginBottom: 4,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  balanceAmount: {
    color: '#fbbf24',
    fontSize: 18,
    fontWeight: '700',
  },
  claimBtn: {
    backgroundColor: '#10b981',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  claimBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  guideBox: {
    backgroundColor: '#111122',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
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
  guideWallet: {
    color: '#4FC3F7',
    fontSize: 11,
    fontFamily: 'monospace',
    marginTop: 2,
    marginBottom: 6,
  },
  guideNote: {
    color: '#10b981',
    fontSize: 12,
    marginTop: 4,
  },
  historyHeader: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 20,
    marginBottom: 8,
  },
  historyItem: {
    backgroundColor: '#1a1a2e',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#2a2a3e',
  },
  historyTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  historyName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
    marginRight: 8,
  },
  historyAmount: {
    color: '#10b981',
    fontSize: 15,
    fontWeight: '700',
  },
  historyBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 10,
  },
  historyTime: {
    color: '#888',
    fontSize: 12,
  },
  historyStamp: {
    color: '#fbbf24',
    fontSize: 12,
  },
  historyBonus: {
    color: '#fbbf24',
    fontSize: 12,
    marginTop: 3,
  },
  historyEmpty: {
    alignItems: 'center',
    paddingTop: 30,
  },
});
