import React, { useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity, Alert,
} from 'react-native';
import { getCurrentPosition } from '../services/location';
import { createSpot } from '../services/api';
import { buildCreateSpotTx } from '../services/ton';

export default function CreateSpotScreen({ walletAddress, sendTransaction, onClose }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('18:00');
  const [reward, setReward] = useState('0.1');
  const [total, setTotal] = useState('10');
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) return Alert.alert('오류', '이름을 입력해주세요');
    if (!walletAddress) return Alert.alert('오류', '지갑을 연결해주세요');

    setCreating(true);

    try {
      // 1. 현재 위치 가져오기
      const pos = await getCurrentPosition();

      // 2. 컨트랙트에 TON 예치 TX
      const rewardNano = BigInt(Math.floor(Number(reward) * 1e9));
      const totalNano = BigInt(Math.floor(Number(total) * 1e9));
      const depositAmount = totalNano + BigInt(50000000); // total + 0.05 TON gas

      const tx = buildCreateSpotTx(rewardNano, depositAmount);
      await sendTransaction(tx);

      // 3. 서버에 메타데이터 저장
      // (contract_spot_id는 컨트랙트 이벤트에서 받아와야 하지만 MVP에서는 서버 순번 사용)
      await createSpot({
        name: name.trim(),
        description: description.trim(),
        lat: pos.lat,
        lng: pos.lng,
        start_time: startTime,
        end_time: endTime,
        creator_address: walletAddress,
      });

      Alert.alert('성공', '스팟이 생성되었습니다');
      onClose();
    } catch (e) {
      Alert.alert('오류', e.message || '스팟 생성 실패');
    }

    setCreating(false);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>스팟 만들기</Text>
        <TouchableOpacity onPress={onClose}>
          <Text style={styles.close}>닫기</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.label}>이름</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="강남역 카페" placeholderTextColor="#666" />

      <Text style={styles.label}>설명</Text>
      <TextInput style={styles.input} value={description} onChangeText={setDescription} placeholder="맛있는 커피" placeholderTextColor="#666" />

      <View style={styles.row}>
        <View style={styles.half}>
          <Text style={styles.label}>시작 시간</Text>
          <TextInput style={styles.input} value={startTime} onChangeText={setStartTime} placeholder="09:00" placeholderTextColor="#666" />
        </View>
        <View style={styles.half}>
          <Text style={styles.label}>종료 시간</Text>
          <TextInput style={styles.input} value={endTime} onChangeText={setEndTime} placeholder="18:00" placeholderTextColor="#666" />
        </View>
      </View>

      <View style={styles.row}>
        <View style={styles.half}>
          <Text style={styles.label}>방문 보상 (TON)</Text>
          <TextInput style={styles.input} value={reward} onChangeText={setReward} keyboardType="decimal-pad" placeholderTextColor="#666" />
        </View>
        <View style={styles.half}>
          <Text style={styles.label}>총 예치 (TON)</Text>
          <TextInput style={styles.input} value={total} onChangeText={setTotal} keyboardType="decimal-pad" placeholderTextColor="#666" />
        </View>
      </View>

      <TouchableOpacity style={styles.createBtn} onPress={handleCreate} disabled={creating}>
        <Text style={styles.createBtnText}>
          {creating ? '생성 중...' : `${total} TON 예치 + 스팟 생성`}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#1a1a1a', padding: 20, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { color: '#fff', fontSize: 18, fontWeight: '700' },
  close: { color: '#aaa', fontSize: 14 },
  label: { color: '#aaa', fontSize: 13, marginTop: 12, marginBottom: 4 },
  input: { backgroundColor: '#222', color: '#fff', padding: 12, borderRadius: 8, fontSize: 15, borderWidth: 1, borderColor: '#333' },
  row: { flexDirection: 'row', gap: 12 },
  half: { flex: 1 },
  createBtn: { backgroundColor: '#3b82f6', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 20 },
  createBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
