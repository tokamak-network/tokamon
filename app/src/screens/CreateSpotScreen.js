import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, Alert,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { useAppKit, useAccount } from '@reown/appkit-react-native';
import { createSpot } from '../services/api';
import { t } from '../translations';

const COOLDOWN_OPTIONS = [
  { label: 'oneHour', value: 3600 },
  { label: 'sixHours', value: 21600 },
  { label: 'twelveHours', value: 43200 },
  { label: 'twentyFourHours', value: 86400 },
];

export default function CreateSpotScreen({ language }) {
  const { open } = useAppKit();
  const { address, isConnected } = useAccount();
  const mapRef = useRef(null);
  const [selectedPos, setSelectedPos] = useState(null);
  const [name, setName] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('22:00');
  const [deposit, setDeposit] = useState('');
  const [reward, setReward] = useState('');
  const [stampGoal, setStampGoal] = useState('5');
  const [stampBonus, setStampBonus] = useState('');
  const [cooldown, setCooldown] = useState(3600);
  const [creating, setCreating] = useState(false);

  const handleMapPress = (e) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    setSelectedPos({ latitude, longitude });
  };

  const handleCreate = async () => {
    if (!isConnected) {
      open();
      return;
    }
    if (!name.trim()) {
      Alert.alert('', t(language, 'storeName') + ' 필수');
      return;
    }
    if (!selectedPos) {
      Alert.alert('', t(language, 'tapMapToSelectLocation'));
      return;
    }
    const dep = Number(deposit);
    const rew = Number(reward);
    if (!dep || dep <= 0 || !rew || rew <= 0) {
      Alert.alert('', '예치금과 보상을 올바르게 입력해주세요');
      return;
    }

    setCreating(true);
    try {
      const result = await createSpot({
        name: name.trim(),
        lat: selectedPos.latitude,
        lng: selectedPos.longitude,
        deposit: dep,
        reward: rew,
        start_time: startTime,
        end_time: endTime,
        cooldown,
        stamp_goal: Number(stampGoal) || 0,
        stamp_bonus: Number(stampBonus) || 0,
        creator_address: address,
      });

      if (result.error) {
        Alert.alert(t(language, 'spotCreationFailed'), result.error);
      } else {
        Alert.alert('', t(language, 'spotCreated'));
        setName('');
        setSelectedPos(null);
        setDeposit('');
        setReward('');
        setStampGoal('5');
        setStampBonus('');
      }
    } catch (err) {
      Alert.alert(t(language, 'spotCreationFailed'), err.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>{t(language, 'createSpotTitle')}</Text>

      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={{
            latitude: 37.5665,
            longitude: 126.978,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          }}
          showsUserLocation
          onPress={handleMapPress}
        >
          {selectedPos && (
            <Marker coordinate={selectedPos} pinColor="#3b82f6" />
          )}
        </MapView>
        {!selectedPos && (
          <View style={styles.mapOverlay}>
            <Text style={styles.mapOverlayText}>{t(language, 'tapMapToSelectLocation')}</Text>
          </View>
        )}
      </View>

      <View style={styles.form}>
        <Text style={styles.label}>{t(language, 'storeName')}</Text>
        <TextInput
          style={styles.input}
          placeholder={t(language, 'storeNamePlaceholder')}
          placeholderTextColor="#666"
          value={name}
          onChangeText={setName}
        />

        <View style={styles.row}>
          <View style={styles.halfField}>
            <Text style={styles.label}>{t(language, 'openingTime')}</Text>
            <TextInput
              style={styles.input}
              placeholder="09:00"
              placeholderTextColor="#666"
              value={startTime}
              onChangeText={setStartTime}
            />
          </View>
          <View style={styles.halfField}>
            <Text style={styles.label}>{t(language, 'closingTime')}</Text>
            <TextInput
              style={styles.input}
              placeholder="22:00"
              placeholderTextColor="#666"
              value={endTime}
              onChangeText={setEndTime}
            />
          </View>
        </View>

        <View style={styles.row}>
          <View style={styles.halfField}>
            <Text style={styles.label}>{t(language, 'totalDeposit')}</Text>
            <TextInput
              style={styles.input}
              placeholder="100"
              placeholderTextColor="#666"
              keyboardType="numeric"
              value={deposit}
              onChangeText={setDeposit}
            />
          </View>
          <View style={styles.halfField}>
            <Text style={styles.label}>{t(language, 'visitReward')}</Text>
            <TextInput
              style={styles.input}
              placeholder="1"
              placeholderTextColor="#666"
              keyboardType="numeric"
              value={reward}
              onChangeText={setReward}
            />
          </View>
        </View>

        <View style={styles.row}>
          <View style={styles.halfField}>
            <Text style={styles.label}>{t(language, 'stampGoal')}</Text>
            <TextInput
              style={styles.input}
              placeholder="5"
              placeholderTextColor="#666"
              keyboardType="numeric"
              value={stampGoal}
              onChangeText={setStampGoal}
            />
          </View>
          <View style={styles.halfField}>
            <Text style={styles.label}>{t(language, 'achievementBonus')}</Text>
            <TextInput
              style={styles.input}
              placeholder="5"
              placeholderTextColor="#666"
              keyboardType="numeric"
              value={stampBonus}
              onChangeText={setStampBonus}
            />
          </View>
        </View>

        <Text style={styles.label}>{t(language, 'revisitCooldown')}</Text>
        <View style={styles.cooldownRow}>
          {COOLDOWN_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[styles.cooldownBtn, cooldown === opt.value && styles.cooldownActive]}
              onPress={() => setCooldown(opt.value)}
            >
              <Text style={[styles.cooldownText, cooldown === opt.value && styles.cooldownTextActive]}>
                {t(language, opt.label)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {!isConnected && (
          <TouchableOpacity style={styles.connectBtn} onPress={() => open()}>
            <Text style={styles.connectBtnText}>{t(language, 'connectWalletFirst')}</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.createBtn, (creating || !isConnected) && styles.createBtnDisabled]}
          onPress={handleCreate}
          disabled={creating || !isConnected}
        >
          <Text style={styles.createBtnText}>
            {creating ? t(language, 'creating') : t(language, 'createSpotBtn')}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  title: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    padding: 16,
    paddingBottom: 8,
  },
  mapContainer: { height: 200, margin: 12, borderRadius: 12, overflow: 'hidden' },
  map: { flex: 1 },
  mapOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
  },
  mapOverlayText: { color: '#aaa', fontSize: 13 },
  form: { paddingHorizontal: 16, paddingBottom: 40 },
  label: { color: '#aaa', fontSize: 14, marginBottom: 6, marginTop: 12 },
  input: {
    backgroundColor: '#1a1a1a',
    color: '#fff',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#333',
  },
  row: { flexDirection: 'row', gap: 12 },
  halfField: { flex: 1 },
  cooldownRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  cooldownBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: '#222',
  },
  cooldownActive: { backgroundColor: '#3b82f6' },
  cooldownText: { color: '#888', fontSize: 13 },
  cooldownTextActive: { color: '#fff' },
  connectBtn: {
    backgroundColor: 'rgba(59,130,246,0.15)',
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#3b82f6',
  },
  connectBtnText: { color: '#3b82f6', fontSize: 15, fontWeight: '600' },
  createBtn: {
    backgroundColor: '#3b82f6',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  createBtnDisabled: { backgroundColor: '#333' },
  createBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
