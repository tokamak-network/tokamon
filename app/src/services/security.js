import { Platform } from 'react-native';

let JailMonkey = null;
try {
  JailMonkey = require('jail-monkey');
} catch (e) {
  // jail-monkey가 설치되지 않은 경우 무시
}

// 보안 체크 결과
export function getSecurityStatus() {
  const result = {
    isRooted: false,
    isMockLocationEnabled: false,
    isDebugMode: __DEV__,
    safe: true,
    warnings: [],
  };

  if (!JailMonkey) {
    return result;
  }

  // 루팅/탈옥 감지
  if (typeof JailMonkey.isJailBroken === 'function' && JailMonkey.isJailBroken()) {
    result.isRooted = true;
    result.safe = false;
    result.warnings.push('루팅/탈옥된 기기입니다');
  }

  // Android: Mock Location 감지
  if (Platform.OS === 'android' && JailMonkey.isMockLocationEnabled?.()) {
    result.isMockLocationEnabled = true;
    result.safe = false;
    result.warnings.push('가짜 GPS 앱이 감지되었습니다');
  }

  return result;
}

// 위치 데이터의 mock 여부 확인
export function isLocationMocked(position) {
  return position.isMocked === true;
}
