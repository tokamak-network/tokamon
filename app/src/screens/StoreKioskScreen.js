import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity,
} from 'react-native';
import { getSpots, kioskClaim, kioskCheckBalance } from '../services/api';
import { t } from '../translations';

export default function StoreKioskScreen({ language }) {
  const [spots, setSpots] = useState([]);
  const [selectedSpot, setSelectedSpot] = useState(null);
  const [telegramUsername, setTelegramUsername] = useState('');
  const [balance, setBalance] = useState(null);
  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchSpots = useCallback(async () => {
    try {
      const data = await getSpots();
      if (Array.isArray(data)) setSpots(data);
    } catch (e) {
      console.warn('스팟 로드 실패:', e.message);
    }
  }, []);

  useEffect(() => {
    fetchSpots();
  }, [fetchSpots]);

  const activeSpots = spots.filter((s) => s.remaining >= s.reward);

  const handleUsernameChange = (value) => {
    if (value && !value.startsWith('@')) {
      value = '@' + value;
    }
    setTelegramUsername(value);
  };

  const handleCheckBalance = async () => {
    const username = telegramUsername.replace('@', '').trim();
    if (username.length < 5) {
      setMessage({ type: 'error', text: t(language, 'enterValidTelegram') });
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const result = await kioskCheckBalance(username);
      setBalance(result.balance ?? 0);
    } catch (err) {
      setMessage({ type: 'error', text: err.message || '잔액 조회 실패' });
    } finally {
      setLoading(false);
    }
  };

  const handleClaim = async () => {
    if (!selectedSpot) return;
    const username = telegramUsername.replace('@', '').trim();
    if (username.length < 5) {
      setMessage({ type: 'error', text: t(language, 'enterValidTelegram') });
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const result = await kioskClaim(username, selectedSpot.id, selectedSpot.lat, selectedSpot.lng);
      if (result.error) {
        setMessage({ type: 'error', text: result.error });
      } else {
        setMessage({
          type: 'success',
          text: `${selectedSpot.reward} TON ${t(language, 'claimSuccess')}`,
        });
        if (result.balance != null) setBalance(result.balance);
        fetchSpots();
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message || '클레임 실패' });
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setTelegramUsername('');
    setBalance(null);
    setSelectedSpot(null);
    setMessage(null);
  };

  // 1단계: 스팟 선택
  if (!selectedSpot) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{t(language, 'storeKioskTitle')}</Text>
        <Text style={styles.subtitle}>{t(language, 'selectSpot')}</Text>

        <ScrollView style={styles.list}>
          {activeSpots.length === 0 ? (
            <Text style={styles.empty}>{t(language, 'noSpotsAvailable')}</Text>
          ) : (
            activeSpots.map((spot) => (
              <TouchableOpacity
                key={spot.id}
                style={styles.spotCard}
                onPress={() => setSelectedSpot(spot)}
              >
                <View style={styles.spotCardHeader}>
                  <Text style={styles.spotName}>{spot.name}</Text>
                  <Text style={styles.spotReward}>{spot.reward} TON</Text>
                </View>
                <Text style={styles.spotDetail}>
                  남은 잔액: {spot.remaining} TON ({Math.floor(spot.remaining / spot.reward)}회)
                </Text>
                <Text style={styles.spotDetail}>
                  {spot.start_time} ~ {spot.end_time}
                </Text>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      </View>
    );
  }

  // 2단계: 텔레그램 입력 + 클레임
  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backBtn} onPress={handleClear}>
        <Text style={styles.backText}>← {t(language, 'back')}</Text>
      </TouchableOpacity>

      <View style={styles.selectedSpotInfo}>
        <Text style={styles.selectedSpotName}>{selectedSpot.name}</Text>
        <Text style={styles.selectedSpotReward}>{selectedSpot.reward} TON</Text>
      </View>

      <View style={styles.inputSection}>
        <Text style={styles.inputLabel}>{t(language, 'telegramUsername')}</Text>
        <TextInput
          style={styles.telegramInput}
          placeholder={t(language, 'telegramPlaceholder')}
          placeholderTextColor="#666"
          value={telegramUsername}
          onChangeText={handleUsernameChange}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!loading}
        />
      </View>

      {message && (
        <View style={[styles.message, message.type === 'success' ? styles.success : styles.error]}>
          <Text style={styles.messageText}>{message.text}</Text>
        </View>
      )}

      {balance !== null && (
        <View style={styles.balanceDisplay}>
          <Text style={styles.balanceLabel}>{t(language, 'currentBalance')}</Text>
          <Text style={styles.balanceAmount}>{Number(balance).toFixed(2)} TON</Text>
        </View>
      )}

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.secondaryBtn, loading && styles.disabled]}
          onPress={handleCheckBalance}
          disabled={loading || telegramUsername.replace('@', '').length < 5}
        >
          <Text style={styles.secondaryBtnText}>{t(language, 'checkBalance')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.primaryBtn, loading && styles.disabled]}
          onPress={handleClaim}
          disabled={loading || telegramUsername.replace('@', '').length < 5}
        >
          <Text style={styles.primaryBtnText}>
            {loading ? t(language, 'claiming') : `${selectedSpot.reward} TON ${t(language, 'claimTON')}`}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111', padding: 16 },
  title: { color: '#fff', fontSize: 22, fontWeight: '800', marginBottom: 4 },
  subtitle: { color: '#888', fontSize: 14, marginBottom: 16 },
  list: { flex: 1 },
  empty: { color: '#666', fontSize: 15, textAlign: 'center', marginTop: 40 },
  spotCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  spotCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  spotName: { color: '#fff', fontSize: 16, fontWeight: '700' },
  spotReward: { color: '#4FC3F7', fontSize: 16, fontWeight: '700' },
  spotDetail: { color: '#aaa', fontSize: 13, marginTop: 2 },
  backBtn: { marginBottom: 16 },
  backText: { color: '#4FC3F7', fontSize: 16 },
  selectedSpotInfo: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  selectedSpotName: { color: '#fff', fontSize: 20, fontWeight: '700' },
  selectedSpotReward: { color: '#4FC3F7', fontSize: 24, fontWeight: '800', marginTop: 4 },
  inputSection: { marginBottom: 16 },
  inputLabel: { color: '#aaa', fontSize: 14, marginBottom: 8 },
  telegramInput: {
    backgroundColor: '#1a1a1a',
    color: '#fff',
    borderRadius: 12,
    padding: 16,
    fontSize: 18,
    borderWidth: 1,
    borderColor: '#333',
    textAlign: 'center',
  },
  message: { padding: 10, borderRadius: 10, marginBottom: 12 },
  success: { backgroundColor: '#166534' },
  error: { backgroundColor: '#7f1d1d' },
  messageText: { color: '#fff', textAlign: 'center', fontSize: 14 },
  balanceDisplay: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  balanceLabel: { color: '#aaa', fontSize: 14 },
  balanceAmount: { color: '#4ade80', fontSize: 18, fontWeight: '700' },
  actions: { gap: 12, marginTop: 8 },
  secondaryBtn: {
    backgroundColor: '#2a2a2a',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#3a3a3a',
  },
  secondaryBtnText: { color: '#ccc', fontSize: 16, fontWeight: '600' },
  primaryBtn: {
    backgroundColor: '#3b82f6',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  disabled: { opacity: 0.5 },
});
