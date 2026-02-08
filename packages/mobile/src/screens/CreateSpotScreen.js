// 토큰 스팟 등록 화면
import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import locationService from '../services/locationService';
import tonService from '../services/tonService';

const CreateSpotScreen = ({navigation}) => {
  const [location, setLocation] = useState(null);
  const [spotName, setSpotName] = useState('');
  const [description, setDescription] = useState('');
  const [tokenAmount, setTokenAmount] = useState('');
  const [depositAmount, setDepositAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [balance, setBalance] = useState(0);

  useEffect(() => {
    loadCurrentLocation();
    loadBalance();
  }, []);

  const loadCurrentLocation = async () => {
    try {
      const pos = await locationService.getCurrentPosition();
      setLocation(pos);
    } catch (error) {
      Alert.alert('오류', '위치를 가져올 수 없습니다. GPS를 켜주세요.');
    }
  };

  const loadBalance = async () => {
    const address = tonService.getConnectedAddress();
    if (address) {
      const bal = await tonService.getBalance(address);
      setBalance(bal);
    }
  };

  const validateInputs = () => {
    if (!spotName.trim()) {
      Alert.alert('입력 오류', '스팟 이름을 입력해주세요.');
      return false;
    }
    if (!description.trim()) {
      Alert.alert('입력 오류', '설명을 입력해주세요.');
      return false;
    }
    const token = parseFloat(tokenAmount);
    if (isNaN(token) || token <= 0) {
      Alert.alert('입력 오류', '유효한 토큰 금액을 입력해주세요.');
      return false;
    }
    const deposit = parseFloat(depositAmount);
    if (isNaN(deposit) || deposit <= 0) {
      Alert.alert('입력 오류', '유효한 예치 금액을 입력해주세요.');
      return false;
    }
    if (deposit < token) {
      Alert.alert('입력 오류', '예치 금액은 토큰 금액보다 커야 합니다.');
      return false;
    }
    if (deposit > balance) {
      Alert.alert('잔액 부족', `현재 잔액: ${balance.toFixed(4)} TON`);
      return false;
    }
    return true;
  };

  const handleCreateSpot = async () => {
    if (!validateInputs()) return;
    if (!location) {
      Alert.alert('오류', '위치 정보가 없습니다. 다시 시도해주세요.');
      return;
    }

    Alert.alert(
      '스팟 생성 확인',
      `${spotName}\n` +
        `예치 금액: ${depositAmount} TON\n` +
        `사용자 보상: ${tokenAmount} TON\n` +
        `위치: ${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}\n\n` +
        `스팟을 생성하시겠습니까?`,
      [
        {text: '취소', style: 'cancel'},
        {text: '생성', onPress: createSpot},
      ],
    );
  };

  const createSpot = async () => {
    setLoading(true);
    try {
      // TODO: 백엔드 API 호출로 대체 필요
      // 현재는 시뮬레이션
      
      // 1. TON 전송 (스마트 컨트랙트 주소로)
      const contractAddress = 'EQC...'; // 실제 컨트랙트 주소 필요
      const success = await tonService.sendTransaction(
        contractAddress,
        parseFloat(depositAmount),
        JSON.stringify({
          type: 'create_spot',
          name: spotName,
          description,
          tokenAmount: parseFloat(tokenAmount),
          latitude: location.latitude,
          longitude: location.longitude,
        }),
      );

      if (success) {
        Alert.alert('성공', '토큰 스팟이 생성되었습니다!', [
          {
            text: '확인',
            onPress: () => navigation.goBack(),
          },
        ]);
      } else {
        Alert.alert('실패', '스팟 생성에 실패했습니다. 다시 시도해주세요.');
      }
    } catch (error) {
      console.error('스팟 생성 오류:', error);
      Alert.alert('오류', '스팟 생성 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>토큰 스팟 생성</Text>
        <Text style={styles.subtitle}>
          이 위치에 방문한 사용자들이 토큰을 받을 수 있습니다
        </Text>

        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>현재 잔액</Text>
          <Text style={styles.balanceAmount}>{balance.toFixed(4)} TON</Text>
        </View>

        {location && (
          <View style={styles.locationCard}>
            <Text style={styles.locationLabel}>현재 위치</Text>
            <Text style={styles.locationText}>
              위도: {location.latitude.toFixed(6)}
            </Text>
            <Text style={styles.locationText}>
              경도: {location.longitude.toFixed(6)}
            </Text>
            <TouchableOpacity
              style={styles.refreshButton}
              onPress={loadCurrentLocation}>
              <Text style={styles.refreshButtonText}>위치 새로고침</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.inputContainer}>
          <Text style={styles.label}>스팟 이름 *</Text>
          <TextInput
            style={styles.input}
            placeholder="예: 스타벅스 강남점"
            value={spotName}
            onChangeText={setSpotName}
            maxLength={50}
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>설명 *</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="스팟에 대한 설명을 입력하세요"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
            maxLength={200}
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>사용자당 보상 (TON) *</Text>
          <TextInput
            style={styles.input}
            placeholder="0.1"
            value={tokenAmount}
            onChangeText={setTokenAmount}
            keyboardType="decimal-pad"
          />
          <Text style={styles.hint}>
            각 사용자가 이 스팟에서 받을 토큰 금액
          </Text>
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>총 예치 금액 (TON) *</Text>
          <TextInput
            style={styles.input}
            placeholder="1.0"
            value={depositAmount}
            onChangeText={setDepositAmount}
            keyboardType="decimal-pad"
          />
          <Text style={styles.hint}>
            예상 방문자 수를 고려하여 충분한 금액을 예치하세요
          </Text>
        </View>

        <View style={styles.estimateCard}>
          <Text style={styles.estimateText}>
            예상 방문자 수:{' '}
            {tokenAmount && depositAmount
              ? Math.floor(
                  parseFloat(depositAmount) / parseFloat(tokenAmount || 1),
                ).toString()
              : '0'}
            명
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.createButton, loading && styles.createButtonDisabled]}
          onPress={handleCreateSpot}
          disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.createButtonText}>스팟 생성하기</Text>
          )}
        </TouchableOpacity>

        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>💡 안내</Text>
          <Text style={styles.infoText}>
            • 스팟 생성 시 TON이 스마트 컨트랙트에 예치됩니다
          </Text>
          <Text style={styles.infoText}>
            • 사용자가 50m 이내로 접근 시 자동으로 토큰을 받습니다
          </Text>
          <Text style={styles.infoText}>
            • 남은 토큰은 언제든지 회수할 수 있습니다
          </Text>
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
  },
  balanceCard: {
    backgroundColor: '#1e88e5',
    padding: 20,
    borderRadius: 12,
    marginBottom: 20,
  },
  balanceLabel: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.9,
  },
  balanceAmount: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 5,
  },
  locationCard: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 12,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  locationLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  locationText: {
    fontSize: 13,
    color: '#666',
    marginBottom: 4,
  },
  refreshButton: {
    marginTop: 10,
    alignSelf: 'flex-start',
  },
  refreshButtonText: {
    color: '#1e88e5',
    fontSize: 14,
    fontWeight: '600',
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  hint: {
    fontSize: 12,
    color: '#999',
    marginTop: 5,
  },
  estimateCard: {
    backgroundColor: '#e3f2fd',
    padding: 15,
    borderRadius: 8,
    marginBottom: 20,
  },
  estimateText: {
    fontSize: 16,
    color: '#1976d2',
    fontWeight: '600',
  },
  createButton: {
    backgroundColor: '#4caf50',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 20,
  },
  createButtonDisabled: {
    backgroundColor: '#ccc',
  },
  createButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  infoBox: {
    backgroundColor: '#fff3cd',
    padding: 15,
    borderRadius: 8,
    marginBottom: 20,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#856404',
    marginBottom: 10,
  },
  infoText: {
    fontSize: 13,
    color: '#856404',
    marginBottom: 5,
  },
});

export default CreateSpotScreen;
