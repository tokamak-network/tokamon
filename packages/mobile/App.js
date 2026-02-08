import React, {useState, useEffect} from 'react';
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  StatusBar,
  TouchableOpacity,
  Alert,
  Platform,
} from 'react-native';
import {accelerometer, setUpdateIntervalForType, SensorTypes} from 'react-native-sensors';

const App = () => {
  const [steps, setSteps] = useState(0);
  const [goalSteps, setGoalSteps] = useState(10000);
  const [isTracking, setIsTracking] = useState(false);
  const [lastAcceleration, setLastAcceleration] = useState({x: 0, y: 0, z: 0});

  // 걸음 감지를 위한 가속도계 임계값
  const THRESHOLD = 1.5;
  const TIME_BETWEEN_STEPS = 200; // 밀리초
  let lastStepTime = 0;

  useEffect(() => {
    // 가속도계 업데이트 간격 설정 (밀리초)
    setUpdateIntervalForType(SensorTypes.accelerometer, 100);

    let subscription;

    if (isTracking) {
      subscription = accelerometer.subscribe(({x, y, z}) => {
        // 이전 가속도 값과의 차이 계산
        const deltaX = Math.abs(x - lastAcceleration.x);
        const deltaY = Math.abs(y - lastAcceleration.y);
        const deltaZ = Math.abs(z - lastAcceleration.z);

        const totalDelta = deltaX + deltaY + deltaZ;

        // 걸음 감지: 가속도 변화가 임계값을 넘고, 충분한 시간이 지났을 때
        const currentTime = Date.now();
        if (totalDelta > THRESHOLD && currentTime - lastStepTime > TIME_BETWEEN_STEPS) {
          setSteps(prevSteps => prevSteps + 1);
          lastStepTime = currentTime;
        }

        setLastAcceleration({x, y, z});
      });
    }

    return () => {
      if (subscription) {
        subscription.unsubscribe();
      }
    };
  }, [isTracking, lastAcceleration]);

  const startTracking = () => {
    setIsTracking(true);
    Alert.alert('시작', '걸음 수 측정을 시작합니다!');
  };

  const stopTracking = () => {
    setIsTracking(false);
    Alert.alert('중지', '걸음 수 측정을 중지했습니다.');
  };

  const resetSteps = () => {
    Alert.alert(
      '초기화',
      '걸음 수를 초기화하시겠습니까?',
      [
        {text: '취소', style: 'cancel'},
        {
          text: '확인',
          onPress: () => {
            setSteps(0);
            setIsTracking(false);
          },
        },
      ],
    );
  };

  const changeGoal = () => {
    const goals = [5000, 8000, 10000, 12000, 15000];
    const currentIndex = goals.indexOf(goalSteps);
    const nextIndex = (currentIndex + 1) % goals.length;
    setGoalSteps(goals[nextIndex]);
  };

  const progress = Math.min((steps / goalSteps) * 100, 100);
  const distance = ((steps * 0.7) / 1000).toFixed(2); // 평균 보폭 70cm 가정
  const calories = (steps * 0.04).toFixed(0); // 걸음당 약 0.04 칼로리 소모

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1e88e5" />
      <View style={styles.header}>
        <Text style={styles.headerText}>만보기</Text>
      </View>

      <View style={styles.mainContent}>
        <View style={styles.progressCircle}>
          <View style={styles.progressInner}>
            <Text style={styles.stepsText}>{steps}</Text>
            <Text style={styles.stepsLabel}>걸음</Text>
            <Text style={styles.goalText}>목표: {goalSteps}</Text>
          </View>
        </View>

        <View style={styles.progressBarContainer}>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, {width: `${progress}%`}]} />
          </View>
          <Text style={styles.progressText}>{progress.toFixed(0)}% 달성</Text>
        </View>

        <View style={styles.statsContainer}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{distance}</Text>
            <Text style={styles.statLabel}>km</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{calories}</Text>
            <Text style={styles.statLabel}>칼로리</Text>
          </View>
        </View>

        <View style={styles.buttonContainer}>
          {!isTracking ? (
            <TouchableOpacity style={styles.startButton} onPress={startTracking}>
              <Text style={styles.buttonText}>시작</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.stopButton} onPress={stopTracking}>
              <Text style={styles.buttonText}>중지</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.resetButton} onPress={resetSteps}>
            <Text style={styles.buttonText}>초기화</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.goalButton} onPress={changeGoal}>
            <Text style={styles.buttonText}>목표 변경</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.statusContainer}>
          <Text style={styles.statusText}>
            {isTracking ? '측정 중...' : '측정 중지'}
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#1e88e5',
    padding: 20,
    alignItems: 'center',
  },
  headerText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  mainContent: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 40,
    paddingHorizontal: 20,
  },
  progressCircle: {
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
    marginBottom: 30,
  },
  progressInner: {
    alignItems: 'center',
  },
  stepsText: {
    fontSize: 56,
    fontWeight: 'bold',
    color: '#1e88e5',
  },
  stepsLabel: {
    fontSize: 18,
    color: '#666',
    marginTop: 5,
  },
  goalText: {
    fontSize: 14,
    color: '#999',
    marginTop: 10,
  },
  progressBarContainer: {
    width: '100%',
    marginBottom: 30,
  },
  progressBar: {
    width: '100%',
    height: 12,
    backgroundColor: '#e0e0e0',
    borderRadius: 6,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4caf50',
    borderRadius: 6,
  },
  progressText: {
    textAlign: 'center',
    marginTop: 8,
    fontSize: 14,
    color: '#666',
    fontWeight: '600',
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginBottom: 30,
  },
  statBox: {
    backgroundColor: '#ffffff',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    minWidth: 120,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1e88e5',
  },
  statLabel: {
    fontSize: 14,
    color: '#666',
    marginTop: 5,
  },
  buttonContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
    width: '100%',
    marginBottom: 20,
  },
  startButton: {
    backgroundColor: '#4caf50',
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 25,
    minWidth: 100,
    alignItems: 'center',
  },
  stopButton: {
    backgroundColor: '#f44336',
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 25,
    minWidth: 100,
    alignItems: 'center',
  },
  resetButton: {
    backgroundColor: '#ff9800',
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 25,
    minWidth: 100,
    alignItems: 'center',
  },
  goalButton: {
    backgroundColor: '#9c27b0',
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 25,
    minWidth: 100,
    alignItems: 'center',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  statusContainer: {
    marginTop: 10,
  },
  statusText: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
  },
});

export default App;
