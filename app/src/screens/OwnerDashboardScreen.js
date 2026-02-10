import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { useAppKit, useAccount } from '@reown/appkit-react-native';
import { getSpots, getSpotClaimHistory, redepositSpot, updateSpotCooldown } from '../services/api';
import { t } from '../translations';

export default function OwnerDashboardScreen({ language }) {
  const { open } = useAppKit();
  const { address, isConnected } = useAccount();
  const wallet = isConnected ? address : '';
  const [spots, setSpots] = useState([]);
  const [redepositSpotId, setRedepositSpotId] = useState(null);
  const [redepositAmount, setRedepositAmount] = useState('');
  const [redepositing, setRedepositing] = useState(false);
  const [cooldownSpotId, setCooldownSpotId] = useState(null);
  const [cooldownSecondsInput, setCooldownSecondsInput] = useState('');
  const [updatingCooldown, setUpdatingCooldown] = useState(false);
  const [claimHistorySpotId, setClaimHistorySpotId] = useState(null);
  const [claimHistory, setClaimHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const fetchSpots = useCallback(async () => {
    const data = await getSpots();
    if (Array.isArray(data)) setSpots(data);
  }, []);

  useEffect(() => {
    fetchSpots();
    const interval = setInterval(fetchSpots, 30000);
    return () => clearInterval(interval);
  }, [fetchSpots]);

  const mySpots = wallet
    ? spots.filter((s) => s.creator_address?.toLowerCase() === wallet.toLowerCase())
    : [];

  const handleRedeposit = async (spotId) => {
    const amount = Number(redepositAmount);
    if (!amount || amount <= 0) {
      Alert.alert('오류', '올바른 금액을 입력해주세요');
      return;
    }
    setRedepositing(true);
    try {
      await redepositSpot(spotId, amount, wallet);
      setRedepositSpotId(null);
      setRedepositAmount('');
      fetchSpots();
      Alert.alert('성공', `${amount} TON 재예치 완료!`);
    } catch (err) {
      Alert.alert('오류', err.message || '재예치 실패');
    } finally {
      setRedepositing(false);
    }
  };

  const handleUpdateCooldown = async (spotId) => {
    const seconds = Number(cooldownSecondsInput);
    if (isNaN(seconds) || seconds < 0) {
      Alert.alert('오류', '올바른 숫자를 입력해주세요');
      return;
    }
    setUpdatingCooldown(true);
    try {
      await updateSpotCooldown(spotId, seconds, wallet);
      setCooldownSpotId(null);
      setCooldownSecondsInput('');
      fetchSpots();
      Alert.alert('성공', '쿨다운이 변경되었습니다');
    } catch (err) {
      Alert.alert('오류', err.message || '쿨다운 수정 실패');
    } finally {
      setUpdatingCooldown(false);
    }
  };

  const handleShowClaimHistory = async (spotId) => {
    if (claimHistorySpotId === spotId) {
      setClaimHistorySpotId(null);
      setClaimHistory([]);
      return;
    }
    setClaimHistorySpotId(spotId);
    setLoadingHistory(true);
    try {
      const result = await getSpotClaimHistory(spotId);
      setClaimHistory(Array.isArray(result) ? result : result.history || []);
    } catch {
      setClaimHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  const shortenAddress = (addr) => {
    if (!addr) return '';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  if (!wallet) {
    return (
      <View style={styles.walletPrompt}>
        <Text style={styles.promptTitle}>{t(language, 'ownerWalletRequired')}</Text>
        <Text style={styles.promptDesc}>{t(language, 'walletConnectDesc')}</Text>
        <TouchableOpacity style={styles.connectBtn} onPress={() => open()}>
          <Text style={styles.connectBtnText}>{t(language, 'connectWallet')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>
          {t(language, 'mySpots')} ({mySpots.length})
        </Text>
        <TouchableOpacity onPress={() => open()}>
          <Text style={styles.changeWallet}>{shortenAddress(wallet)}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.list}>
        {mySpots.length === 0 ? (
          <Text style={styles.empty}>{t(language, 'noSpotsCreated')}</Text>
        ) : (
          mySpots.map((spot) => {
            const claimsLeft = spot.reward > 0 ? Math.floor(spot.remaining / spot.reward) : 0;
            const isExhausted = spot.remaining < spot.reward;
            const cd = spot.cooldown || 0;
            let cooldownDisplay = '';
            if (cd >= 3600) cooldownDisplay = `${(cd / 3600).toFixed(1)}h`;
            else if (cd >= 60) cooldownDisplay = `${Math.floor(cd / 60)}m`;
            else cooldownDisplay = `${cd}s`;

            return (
              <View key={spot.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.spotName}>{spot.name}</Text>
                  <Text style={[
                    styles.status,
                    isExhausted ? styles.exhausted : spot.active ? styles.active : styles.inactive,
                  ]}>
                    {isExhausted ? t(language, 'exhausted') : spot.active ? t(language, 'active') : t(language, 'inactive')}
                  </Text>
                </View>
                <Text style={styles.detail}>
                  {t(language, 'remainingTON')}: {spot.remaining} | {t(language, 'rewardPerVisit')}: {spot.reward} TON | {t(language, 'remainingVisits')}: {claimsLeft}{t(language, 'times')}
                </Text>
                <Text style={styles.detail}>
                  {spot.start_time} ~ {spot.end_time} | {t(language, 'cooldown')} {cooldownDisplay}
                </Text>
                <Text style={styles.detail}>
                  {t(language, 'duplicateClaims')}: {spot.allow_duplicate_claims ? t(language, 'allowed') : t(language, 'notAllowed')}
                </Text>
                {spot.stamp_goal > 0 && (
                  <Text style={styles.stamp}>
                    {t(language, 'stampGoalAchievement')} {spot.stamp_goal}{t(language, 'stampGoalAchievement2')} +{spot.stamp_bonus} TON
                  </Text>
                )}

                {/* 재예치 폼 */}
                {redepositSpotId === spot.id ? (
                  <View style={styles.inlineForm}>
                    <Text style={styles.formLabel}>{t(language, 'additionalDeposit')}</Text>
                    <TextInput
                      style={styles.formInput}
                      placeholder="10"
                      placeholderTextColor="#666"
                      keyboardType="numeric"
                      value={redepositAmount}
                      onChangeText={setRedepositAmount}
                    />
                    <View style={styles.formActions}>
                      <TouchableOpacity
                        style={[styles.actionBtn, styles.primaryAction]}
                        onPress={() => handleRedeposit(spot.id)}
                        disabled={redepositing}
                      >
                        <Text style={styles.actionBtnText}>
                          {redepositing ? t(language, 'processing') : t(language, 'redeposit')}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionBtn, styles.secondaryAction]}
                        onPress={() => { setRedepositSpotId(null); setRedepositAmount(''); }}
                      >
                        <Text style={styles.secondaryActionText}>{t(language, 'cancel')}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : cooldownSpotId === spot.id ? (
                  /* 쿨다운 변경 폼 */
                  <View style={styles.inlineForm}>
                    <Text style={styles.formLabel}>{t(language, 'cooldownSeconds')}</Text>
                    <TextInput
                      style={styles.formInput}
                      placeholder={String(spot.cooldown)}
                      placeholderTextColor="#666"
                      keyboardType="numeric"
                      value={cooldownSecondsInput}
                      onChangeText={setCooldownSecondsInput}
                    />
                    <Text style={styles.formHint}>{t(language, 'cooldownHint')}</Text>
                    <View style={styles.formActions}>
                      <TouchableOpacity
                        style={[styles.actionBtn, styles.primaryAction]}
                        onPress={() => handleUpdateCooldown(spot.id)}
                        disabled={updatingCooldown}
                      >
                        <Text style={styles.actionBtnText}>
                          {updatingCooldown ? t(language, 'processing') : t(language, 'changeCooldown')}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionBtn, styles.secondaryAction]}
                        onPress={() => { setCooldownSpotId(null); setCooldownSecondsInput(''); }}
                      >
                        <Text style={styles.secondaryActionText}>{t(language, 'cancel')}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  /* 액션 버튼들 */
                  <View style={styles.actionRow}>
                    <TouchableOpacity
                      style={styles.smallBtn}
                      onPress={() => setRedepositSpotId(spot.id)}
                    >
                      <Text style={styles.smallBtnText}>{t(language, 'redeposit')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.smallBtn}
                      onPress={() => {
                        setCooldownSpotId(spot.id);
                        setCooldownSecondsInput(String(spot.cooldown));
                      }}
                    >
                      <Text style={styles.smallBtnText}>{t(language, 'changeCooldown')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.smallBtn}
                      onPress={() => handleShowClaimHistory(spot.id)}
                    >
                      <Text style={styles.smallBtnText}>
                        {claimHistorySpotId === spot.id ? t(language, 'closeList') : t(language, 'claimList')}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* 클래임 내역 */}
                {claimHistorySpotId === spot.id && (
                  <View style={styles.historySection}>
                    <Text style={styles.historyTitle}>{t(language, 'claimHistoryTitle')}</Text>
                    {loadingHistory ? (
                      <ActivityIndicator size="small" color="#4FC3F7" />
                    ) : claimHistory.length === 0 ? (
                      <Text style={styles.historyEmpty}>{t(language, 'noClaimHistoryYet')}</Text>
                    ) : (
                      claimHistory.map((item, idx) => (
                        <View key={idx} style={styles.historyItem}>
                          <View style={styles.historyRow}>
                            <Text style={styles.historyAddr}>{shortenAddress(item.user_address)}</Text>
                            <Text style={styles.historyReward}>
                              {item.reward} TON{item.bonus > 0 ? ` (+${item.bonus})` : ''}
                            </Text>
                          </View>
                          <Text style={styles.historyTime}>
                            {new Date(item.created_at).toLocaleString()}
                            {item.stamp > 0 ? ` | 스탬프 ${item.stamp}회` : ''}
                          </Text>
                        </View>
                      ))
                    )}
                  </View>
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
  walletPrompt: {
    flex: 1,
    backgroundColor: '#111',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  promptTitle: { color: '#fff', fontSize: 20, fontWeight: '700', marginBottom: 8 },
  promptDesc: { color: '#888', fontSize: 14, marginBottom: 24, textAlign: 'center', lineHeight: 20 },
  connectBtn: {
    backgroundColor: '#3b82f6',
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  connectBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
  },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  changeWallet: { color: '#4FC3F7', fontSize: 13 },
  list: { flex: 1, paddingHorizontal: 12 },
  empty: { color: '#666', fontSize: 15, textAlign: 'center', marginTop: 40 },
  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  spotName: { color: '#fff', fontSize: 16, fontWeight: '700' },
  status: { fontSize: 12, fontWeight: '600' },
  exhausted: { color: '#f97316' },
  active: { color: '#4ade80' },
  inactive: { color: '#f87171' },
  detail: { color: '#aaa', fontSize: 13, marginTop: 2 },
  stamp: { color: '#facc15', fontSize: 13, marginTop: 4 },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  smallBtn: {
    backgroundColor: '#2a2a2a',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3a3a3a',
  },
  smallBtnText: { color: '#ccc', fontSize: 13 },
  inlineForm: {
    marginTop: 10,
    padding: 12,
    backgroundColor: '#222',
    borderRadius: 8,
  },
  formLabel: { color: '#aaa', fontSize: 14, marginBottom: 8 },
  formInput: {
    backgroundColor: '#2a2a2a',
    color: '#fff',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#4FC3F7',
  },
  formHint: { color: '#888', fontSize: 12, marginTop: 4 },
  formActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  actionBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  primaryAction: { backgroundColor: '#3b82f6' },
  secondaryAction: { backgroundColor: '#333' },
  actionBtnText: { color: '#fff', fontWeight: '600' },
  secondaryActionText: { color: '#aaa', fontWeight: '600' },
  historySection: {
    marginTop: 10,
    padding: 12,
    backgroundColor: '#222',
    borderRadius: 8,
  },
  historyTitle: { color: '#4FC3F7', fontSize: 14, fontWeight: '700', marginBottom: 8 },
  historyEmpty: { color: '#888', fontSize: 13 },
  historyItem: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  historyAddr: { color: '#ddd', fontSize: 13, fontFamily: 'Courier' },
  historyReward: { color: '#4FC3F7', fontSize: 13 },
  historyTime: { color: '#888', fontSize: 11, marginTop: 2 },
});
