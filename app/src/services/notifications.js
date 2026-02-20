import { Platform } from 'react-native';
import * as Application from 'expo-application';
import * as SecureStore from 'expo-secure-store';
import messaging from '@react-native-firebase/messaging';

const PUSH_TOKEN_KEY = 'fcm_push_token';
const DEVICE_ID_KEY = 'device_unique_id';

/**
 * 디바이스 고유 ID 조회 (SecureStore 암호화 저장)
 * Android: ANDROID_ID (앱 재설치에도 유지)
 * iOS: identifierForVendor (앱 재설치에도 유지)
 */
export async function getDeviceId() {
  // 캐시된 값이 있으면 재사용
  try {
    const saved = await SecureStore.getItemAsync(DEVICE_ID_KEY);
    if (saved) return saved;
  } catch (_) {}

  let deviceId;
  if (Platform.OS === 'android') {
    deviceId = Application.androidId;
  } else {
    deviceId = await Application.getIosIdForVendorAsync();
  }

  // fallback (에뮬레이터 등) — 랜덤 값
  if (!deviceId) {
    try {
      const randomBytes = new Uint8Array(16);
      crypto.getRandomValues(randomBytes);
      const hex = Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('');
      deviceId = `fallback_${Platform.OS}_${hex}`;
    } catch (_) {
      deviceId = `fallback_${Platform.OS}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    }
  }

  try {
    await SecureStore.setItemAsync(DEVICE_ID_KEY, deviceId);
  } catch (_) {}

  console.log('[Device] ID initialized');
  return deviceId;
}

// expo-notifications 동적 로드 (알림 수신/표시용 — 토큰 발급은 @react-native-firebase/messaging 사용)
let Notifications = null;
try {
  Notifications = require('expo-notifications');
  // 알림 수신 시 앱 내에서 표시
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  // Android 알림 채널 설정 (필수)
  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync('tokamon-verify', {
      name: 'Tokamon 인증',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      sound: 'default',
    });
  }
} catch (_) {
  Notifications = null;
  console.log('[Notifications] expo-notifications 미설치 - 대체 토큰 모드');
}

/**
 * 푸시 알림 권한 요청 + FCM 토큰 발급
 * @react-native-firebase/messaging 사용 (iOS/Android 모두 FCM 토큰 반환)
 */
export async function registerForPushNotifications() {
  try {
    // iOS: 푸시 알림 권한 요청
    if (Platform.OS === 'ios') {
      const authStatus = await messaging().requestPermission();
      const enabled =
        authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
        authStatus === messaging.AuthorizationStatus.PROVISIONAL;

      if (!enabled) {
        console.log('[Notifications] 푸시 알림 권한 거부됨 - 대체 토큰 사용');
        return generateFallbackToken();
      }
    }

    // FCM 토큰 발급 (iOS: APNs → FCM 매핑, Android: FCM 직접)
    const token = await messaging().getToken();
    if (token) {
      await SecureStore.setItemAsync(PUSH_TOKEN_KEY, token);
      console.log('[Notifications] FCM 토큰 발급 완료 (length:', token.length, ')');
      return token;
    }
  } catch (e) {
    console.error('[Notifications] FCM 토큰 발급 실패:', e.message);
  }

  // FCM 실패 시 fallback
  return generateFallbackToken();
}

function generateFallbackToken() {
  let fallbackToken;
  try {
    const randomBytes = new Uint8Array(16);
    crypto.getRandomValues(randomBytes);
    const hex = Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('');
    fallbackToken = `device_${Platform.OS}_${hex}`;
  } catch (_) {
    fallbackToken = `device_${Platform.OS}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }
  try {
    SecureStore.setItemAsync(PUSH_TOKEN_KEY, fallbackToken);
  } catch (_) {}
  console.log('[Notifications] 대체 토큰 사용');
  return fallbackToken;
}

/**
 * 저장된 푸시 토큰 조회
 */
export async function getSavedPushToken() {
  return SecureStore.getItemAsync(PUSH_TOKEN_KEY);
}

/**
 * 알림 수신 리스너 설정
 * @param {Function} onCodeReceived - 인증번호 수신 시 콜백 (code, spotId)
 * @returns {Function} cleanup - 리스너 해제 함수
 */
export function setupNotificationListener(onCodeReceived) {
  const cleanups = [];

  // @react-native-firebase/messaging: 포그라운드 메시지 수신
  const unsubFirebase = messaging().onMessage(async (remoteMessage) => {
    const data = remoteMessage.data;
    if (data?.type === 'verify_code' && data?.code) {
      console.log('[Notifications] 인증번호 수신 (Firebase), spotId:', data.spot_id);
      onCodeReceived(data.code, data.spot_id);
    } else if (data?.type === 'wallet_link_code' && data?.code) {
      console.log('[Notifications] 지갑 인증번호 수신 (Firebase)');
      onCodeReceived(data.code, 'wallet_link');
    }
  });
  cleanups.push(unsubFirebase);

  // expo-notifications: 알림 표시 및 탭 처리 (보조)
  if (Notifications) {
    const foregroundSub = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data;
      if (data?.type === 'verify_code' && data?.code) {
        console.log('[Notifications] 인증번호 수신 (expo), spotId:', data.spot_id);
        onCodeReceived(data.code, data.spot_id);
      } else if (data?.type === 'wallet_link_code' && data?.code) {
        console.log('[Notifications] 지갑 인증번호 수신 (expo)');
        onCodeReceived(data.code, 'wallet_link');
      }
    });

    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      if (data?.type === 'verify_code' && data?.code) {
        onCodeReceived(data.code, data.spot_id);
      } else if (data?.type === 'wallet_link_code' && data?.code) {
        onCodeReceived(data.code, 'wallet_link');
      }
    });

    cleanups.push(() => { foregroundSub.remove(); responseSub.remove(); });
  }

  return () => cleanups.forEach((fn) => typeof fn === 'function' && fn());
}
