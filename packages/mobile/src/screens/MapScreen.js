// 토큰 스팟 지도 화면
import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Modal,
} from 'react-native';
import MapView, {Marker, Circle, PROVIDER_GOOGLE} from 'react-native-maps';
import locationService from '../services/locationService';

const MapScreen = ({navigation}) => {
  const [currentLocation, setCurrentLocation] = useState(null);
  const [tokenSpots, setTokenSpots] = useState([]);
  const [selectedSpot, setSelectedSpot] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [collectedSpots, setCollectedSpots] = useState(new Set());

  useEffect(() => {
    initializeLocation();
    loadTokenSpots();

    // 실시간 위치 추적 시작
    locationService.startWatching(position => {
      setCurrentLocation(position);
      checkNearbySpots(position);
    });

    return () => {
      locationService.stopWatching();
    };
  }, []);

  const initializeLocation = async () => {
    try {
      const position = await locationService.getCurrentPosition();
      setCurrentLocation(position);
    } catch (error) {
      Alert.alert('오류', '위치 정보를 가져올 수 없습니다.');
    }
  };

  const loadTokenSpots = async () => {
    // TODO: 실제로는 백엔드 API에서 가져와야 함
    // 데모용 더미 데이터
    const dummySpots = [
      {
        id: '1',
        name: '스타벅스 강남점',
        description: '커피 한 잔의 여유',
        latitude: 37.498095,
        longitude: 127.027610,
        tokenAmount: 0.1,
        remainingTokens: 5.0,
        createdBy: 'EQA...',
      },
      {
        id: '2',
        name: '코엑스몰',
        description: '쇼핑과 함께 토큰도!',
        latitude: 37.512942,
        longitude: 127.058678,
        tokenAmount: 0.2,
        remainingTokens: 10.0,
        createdBy: 'EQB...',
      },
      {
        id: '3',
        name: '한강공원 잠원지구',
        description: '산책하며 토큰 받아가세요',
        latitude: 37.525304,
        longitude: 127.013281,
        tokenAmount: 0.15,
        remainingTokens: 3.0,
        createdBy: 'EQC...',
      },
    ];
    setTokenSpots(dummySpots);
  };

  const checkNearbySpots = position => {
    const nearbySpots = locationService.checkNearbySpots(tokenSpots, 50);
    
    nearbySpots.forEach(spot => {
      if (!collectedSpots.has(spot.id)) {
        collectToken(spot);
      }
    });
  };

  const collectToken = spot => {
    Alert.alert(
      '토큰 발견!',
      `${spot.name}에서 ${spot.tokenAmount} TON을 발견했습니다!\n수집하시겠습니까?`,
      [
        {text: '취소', style: 'cancel'},
        {
          text: '수집',
          onPress: async () => {
            // TODO: 실제 토큰 전송 로직
            setCollectedSpots(prev => new Set([...prev, spot.id]));
            Alert.alert('성공', `${spot.tokenAmount} TON을 받았습니다!`);
          },
        },
      ],
    );
  };

  const onMarkerPress = spot => {
    setSelectedSpot(spot);
    setModalVisible(true);
  };

  const getMarkerColor = spot => {
    if (collectedSpots.has(spot.id)) return '#999'; // 이미 수집
    if (spot.remainingTokens <= 0) return '#f44336'; // 소진됨
    return '#4caf50'; // 활성
  };

  return (
    <View style={styles.container}>
      {currentLocation && (
        <MapView
          provider={PROVIDER_GOOGLE}
          style={styles.map}
          initialRegion={{
            latitude: currentLocation.latitude,
            longitude: currentLocation.longitude,
            latitudeDelta: 0.05,
            longitudeDelta: 0.05,
          }}
          showsUserLocation
          showsMyLocationButton>
          {tokenSpots.map(spot => (
            <React.Fragment key={spot.id}>
              <Marker
                coordinate={{
                  latitude: spot.latitude,
                  longitude: spot.longitude,
                }}
                title={spot.name}
                description={`${spot.tokenAmount} TON`}
                pinColor={getMarkerColor(spot)}
                onPress={() => onMarkerPress(spot)}
              />
              <Circle
                center={{
                  latitude: spot.latitude,
                  longitude: spot.longitude,
                }}
                radius={50}
                strokeColor="rgba(30, 136, 229, 0.5)"
                fillColor="rgba(30, 136, 229, 0.1)"
              />
            </React.Fragment>
          ))}
        </MapView>
      )}

      <TouchableOpacity
        style={styles.createButton}
        onPress={() => navigation.navigate('CreateSpot')}>
        <Text style={styles.createButtonText}>+ 스팟 생성</Text>
      </TouchableOpacity>

      <View style={styles.legendContainer}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, {backgroundColor: '#4caf50'}]} />
          <Text style={styles.legendText}>활성 스팟</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, {backgroundColor: '#999'}]} />
          <Text style={styles.legendText}>수집 완료</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, {backgroundColor: '#f44336'}]} />
          <Text style={styles.legendText}>소진됨</Text>
        </View>
      </View>

      {/* 스팟 정보 모달 */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {selectedSpot && (
              <>
                <Text style={styles.modalTitle}>{selectedSpot.name}</Text>
                <Text style={styles.modalDescription}>
                  {selectedSpot.description}
                </Text>
                
                <View style={styles.modalInfoRow}>
                  <Text style={styles.modalLabel}>보상:</Text>
                  <Text style={styles.modalValue}>
                    {selectedSpot.tokenAmount} TON
                  </Text>
                </View>
                
                <View style={styles.modalInfoRow}>
                  <Text style={styles.modalLabel}>남은 토큰:</Text>
                  <Text style={styles.modalValue}>
                    {selectedSpot.remainingTokens} TON
                  </Text>
                </View>

                <View style={styles.modalInfoRow}>
                  <Text style={styles.modalLabel}>상태:</Text>
                  <Text
                    style={[
                      styles.modalValue,
                      {
                        color: collectedSpots.has(selectedSpot.id)
                          ? '#999'
                          : selectedSpot.remainingTokens > 0
                          ? '#4caf50'
                          : '#f44336',
                      },
                    ]}>
                    {collectedSpots.has(selectedSpot.id)
                      ? '수집 완료'
                      : selectedSpot.remainingTokens > 0
                      ? '활성'
                      : '소진됨'}
                  </Text>
                </View>

                {currentLocation && (
                  <View style={styles.modalInfoRow}>
                    <Text style={styles.modalLabel}>거리:</Text>
                    <Text style={styles.modalValue}>
                      {locationService
                        .calculateDistance(
                          currentLocation.latitude,
                          currentLocation.longitude,
                          selectedSpot.latitude,
                          selectedSpot.longitude,
                        )
                        .toFixed(0)}
                      m
                    </Text>
                  </View>
                )}

                <TouchableOpacity
                  style={styles.modalCloseButton}
                  onPress={() => setModalVisible(false)}>
                  <Text style={styles.modalCloseButtonText}>닫기</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  createButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    backgroundColor: '#1e88e5',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 25,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  legendContainer: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  legendText: {
    fontSize: 13,
    color: '#333',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 25,
    minHeight: 300,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  modalDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
  },
  modalInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  modalLabel: {
    fontSize: 16,
    color: '#666',
  },
  modalValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  modalCloseButton: {
    marginTop: 20,
    backgroundColor: '#1e88e5',
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalCloseButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default MapScreen;
