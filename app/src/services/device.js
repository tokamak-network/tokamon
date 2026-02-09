import DeviceInfo from 'react-native-device-info';

let cachedDeviceId = null;

export async function getDeviceId() {
  if (cachedDeviceId) return cachedDeviceId;
  const androidId = await DeviceInfo.getAndroidId();
  if (!androidId || androidId === 'unknown') {
    throw new Error('기기 ID를 가져올 수 없습니다');
  }
  cachedDeviceId = androidId;
  return androidId;
}
