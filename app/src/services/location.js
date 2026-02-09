import Geolocation from '@react-native-community/geolocation';
import { Platform, PermissionsAndroid } from 'react-native';

Geolocation.setRNConfiguration({
  skipPermissionRequests: false,
  authorizationLevel: 'whenInUse',
  enableBackgroundLocationUpdates: false,
});

if (Platform.OS === 'ios') {
  Geolocation.requestAuthorization();
}

// Fused Location 설정 (GPS + Wi-Fi + 셀타워)
const CONFIG = {
  enableHighAccuracy: true,
  timeout: 15000,
  maximumAge: 5000,
  ...(Platform.OS === 'android' && {
    forceRequestLocation: true,
    showLocationDialog: true,
  }),
};

export function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    Geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          isMocked: position.mocked || false, // Android mock location 감지
        });
      },
      (error) => reject(error),
      CONFIG,
    );
  });
}

export function watchPosition(callback) {
  return Geolocation.watchPosition(
    (position) => {
      callback({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
        isMocked: position.mocked || false,
      });
    },
    (error) => console.warn('위치 오류:', error.message),
    { ...CONFIG, distanceFilter: 10 }, // 10m 이동마다 업데이트
  );
}

export function clearWatch(watchId) {
  Geolocation.clearWatch(watchId);
}
