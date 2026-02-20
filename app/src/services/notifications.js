import { Platform } from 'react-native';
import * as Application from 'expo-application';
import * as SecureStore from 'expo-secure-store';

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

// expo-notifications 동적 로드 (설치되지 않은 환경에서도 앱 동작 보장)
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
 * 푸시 알림 권한 요청 + FCM 토큰 발급 (SecureStore 암호화 저장)
 */
export async function registerForPushNotifications() {
  // FCM 토큰은 앱 재설치 시 무효화되지만 iOS Keychain(SecureStore)에는 남아있을 수 있음
  // → 항상 새로 발급받되, 실패 시에만 캐시된 값 사용
  // 대체 토큰(device_*)이면서 Notifications 사용 가능 시에도 재발급 시도

  // expo-notifications가 있으면 FCM 토큰 시도
  if (Notifications) {
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus === 'granted') {
        // FCM 네이티브 토큰 사용 (서버에서 admin.messaging().send() 직접 전송)
        const tokenData = await Notifications.getDevicePushTokenAsync();
        const token = tokenData.data;
        await SecureStore.setItemAsync(PUSH_TOKEN_KEY, token);
        console.log('[Notifications] FCM 토큰 발급 완료');
        return token;
      }

      console.log('[Notifications] 푸시 알림 권한 거부됨 - 대체 토큰 사용');
    } catch (e) {
      console.error('[Notifications] 토큰 발급 실패:', e.message);
    }
  }

  // 권한 거부, FCM 미지원, 또는 expo-notifications 미설치 시 디바이스 ID 대체
  const randomBytes = new Uint8Array(16);
  crypto.getRandomValues(randomBytes);
  const hex = Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('');
  const fallbackToken = `device_${Platform.OS}_${hex}`;
  try {
    await SecureStore.setItemAsync(PUSH_TOKEN_KEY, fallbackToken);
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
  if (!Notifications) {
    return () => {}; // no-op cleanup
  }

  // 앱이 포그라운드일 때 알림 수신
  const foregroundSub = Notifications.addNotificationReceivedListener((notification) => {
    const data = notification.request.content.data;
    if (data?.type === 'verify_code' && data?.code) {
      console.log('[Notifications] 인증번호 수신, spotId:', data.spot_id);
      onCodeReceived(data.code, data.spot_id);
    } else if (data?.type === 'wallet_link_code' && data?.code) {
      console.log('[Notifications] 지갑 인증번호 수신');
      onCodeReceived(data.code, 'wallet_link');
    }
  });

  // 알림을 탭했을 때
  const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data;
    if (data?.type === 'verify_code' && data?.code) {
      onCodeReceived(data.code, data.spot_id);
    } else if (data?.type === 'wallet_link_code' && data?.code) {
      onCodeReceived(data.code, 'wallet_link');
    }
  });

  return () => {
    foregroundSub.remove();
    responseSub.remove();
  };
}
