import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator,
} from 'react-native';
import { getDeviceBalance, getDeviceClaimHistory } from '../services/api';
import { getDeviceId } from '../services/device';
import { t } from '../translations';

function formatTime(timestamp) {
  if (!timestamp) return '';
  const date = new Date(typeof timestamp === 'number' && timestamp < 1e12 ? timestamp * 1000 : timestamp);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${month}/${day} ${hours}:${minutes}`;
}

export default function HistoryScreen({ language }) {
  const [balance, setBalance] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const deviceId = await getDeviceId();
      const [balResult, histResult] = await Promise.all([
        getDeviceBalance(deviceId),
        getDeviceClaimHistory(deviceId),
      ]);
      setBalance(balResult.balance ?? 0);
      if (Array.isArray(histResult)) {
        setHistory(histResult);
      } else if (histResult.history) {
        setHistory(histResult.history);
      }
    } catch (e) {
      console.warn('히스토리 로드 실패:', e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* 잔액 카드 */}
      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>{t(language, 'deviceBalance')}</Text>
        <Text style={styles.balanceAmount}>
          {balance != null ? `${Number(balance).toFixed(4)} TON` : '-- TON'}
        </Text>
      </View>

      {/* 히스토리 */}
      <Text style={styles.sectionTitle}>{t(language, 'claimHistory')}</Text>
      <ScrollView style={styles.list}>
        {history.length === 0 ? (
          <Text style={styles.empty}>{t(language, 'noClaimHistory')}</Text>
        ) : (
          history.map((item, idx) => {
            const hasBonus = item.bonus && item.bonus > 0;
            const totalReward = (item.reward || 0) + (item.bonus || 0);
            return (
              <View key={idx} style={styles.historyItem}>
                <View style={styles.historyTop}>
                  <Text style={styles.historyName}>
                    {item.spot_name || `스팟 #${item.spot_id}`}
                  </Text>
                  <Text style={styles.historyAmount}>+{totalReward} TON</Text>
                </View>
                <View style={styles.historyBottom}>
                  <Text style={styles.historyTime}>{formatTime(item.timestamp || item.created_at)}</Text>
                  {item.stamp !== undefined && (
                    <Text style={styles.historyStamp}>
                      스탬프 {item.stamp}/{item.stamp_goal || '?'}
                    </Text>
                  )}
                </View>
                {hasBonus && (
                  <Text style={styles.historyBonus}>
                    스탬프 달성 보너스 +{item.bonus} TON
                  </Text>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#111' },
  balanceCard: {
    margin: 12,
    padding: 20,
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  balanceLabel: { color: '#888', fontSize: 14, marginBottom: 8 },
  balanceAmount: { color: '#4ade80', fontSize: 28, fontWeight: '800' },
  sectionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  list: { flex: 1, paddingHorizontal: 12 },
  empty: { color: '#666', fontSize: 15, textAlign: 'center', marginTop: 40 },
  historyItem: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  historyTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  historyName: { color: '#ddd', fontSize: 15, fontWeight: '600' },
  historyAmount: { color: '#4FC3F7', fontSize: 15, fontWeight: '700' },
  historyBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 12,
  },
  historyTime: { color: '#888', fontSize: 12 },
  historyStamp: { color: '#facc15', fontSize: 12 },
  historyBonus: {
    color: '#f59e0b',
    fontSize: 12,
    marginTop: 4,
    fontWeight: '600',
  },
});
