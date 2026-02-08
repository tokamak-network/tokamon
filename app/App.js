import React, { useState } from 'react';
import {
  SafeAreaView, View, Text, TouchableOpacity, Modal, StyleSheet, StatusBar,
} from 'react-native';
import MapScreen from './src/screens/MapScreen';
import CreateSpotScreen from './src/screens/CreateSpotScreen';

// TODO: TON Connect 연동 후 실제 지갑 연결로 교체
const MOCK_WALLET = 'EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c';

export default function App() {
  const [walletAddress, setWalletAddress] = useState(null);
  const [showCreate, setShowCreate] = useState(false);

  // TODO: TON Connect의 sendTransaction으로 교체
  const sendTransaction = async (tx) => {
    console.log('TX 전송:', JSON.stringify(tx));
    // tonConnectUI.sendTransaction(tx);
  };

  // 지갑 미연결 시 연결 화면
  if (!walletAddress) {
    return (
      <SafeAreaView style={styles.loginContainer}>
        <StatusBar barStyle="light-content" />
        <Text style={styles.logo}>Tokamon</Text>
        <Text style={styles.subtitle}>정해진 시간, 정해진 장소에서 TON을 받자</Text>
        <TouchableOpacity
          style={styles.connectBtn}
          onPress={() => {
            // TODO: TON Connect로 실제 지갑 연결
            setWalletAddress(MOCK_WALLET);
          }}
        >
          <Text style={styles.connectBtnText}>TON 지갑 연결</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* 헤더 */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Tokamon</Text>
        <Text style={styles.headerAddress}>
          {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
        </Text>
      </View>

      {/* 지도 */}
      <MapScreen walletAddress={walletAddress} sendTransaction={sendTransaction} />

      {/* 스팟 생성 버튼 */}
      <TouchableOpacity style={styles.fab} onPress={() => setShowCreate(true)}>
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      {/* 스팟 생성 모달 */}
      <Modal visible={showCreate} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <CreateSpotScreen
            walletAddress={walletAddress}
            sendTransaction={sendTransaction}
            onClose={() => setShowCreate(false)}
          />
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  loginContainer: { flex: 1, backgroundColor: '#111', justifyContent: 'center', alignItems: 'center', padding: 20 },
  logo: { color: '#fff', fontSize: 36, fontWeight: '800' },
  subtitle: { color: '#aaa', fontSize: 14, marginTop: 8, marginBottom: 32 },
  connectBtn: { backgroundColor: '#0088CC', paddingHorizontal: 32, paddingVertical: 16, borderRadius: 12 },
  connectBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#111', borderBottomWidth: 1, borderBottomColor: '#222',
  },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  headerAddress: { color: '#aaa', fontSize: 12 },
  fab: {
    position: 'absolute', bottom: 200, right: 20,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#3b82f6', justifyContent: 'center', alignItems: 'center',
    elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4,
  },
  fabText: { color: '#fff', fontSize: 28, fontWeight: '300', marginTop: -2 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.7)' },
});
