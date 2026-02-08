// 위치 추적 및 토큰 스팟 관리 서비스
import Geolocation from '@react-native-community/geolocation';

class LocationService {
  constructor() {
    this.watchId = null;
    this.currentLocation = null;
  }

  // 현재 위치 가져오기
  getCurrentPosition() {
    return new Promise((resolve, reject) => {
      Geolocation.getCurrentPosition(
        position => {
          this.currentLocation = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
          };
          resolve(this.currentLocation);
        },
        error => reject(error),
        {enableHighAccuracy: true, timeout: 15000, maximumAge: 10000},
      );
    });
  }

  // 실시간 위치 추적 시작
  startWatching(callback) {
    this.watchId = Geolocation.watchPosition(
      position => {
        this.currentLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        };
        callback(this.currentLocation);
      },
      error => console.error('위치 추적 오류:', error),
      {
        enableHighAccuracy: true,
        distanceFilter: 10, // 10m마다 업데이트
        interval: 5000, // 5초마다 체크
      },
    );
  }

  // 위치 추적 중지
  stopWatching() {
    if (this.watchId !== null) {
      Geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }

  // 두 지점 사이의 거리 계산 (Haversine formula)
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // 지구 반지름 (미터)
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // 미터 단위
  }

  // 근처 토큰 스팟 확인
  checkNearbySpots(tokenSpots, radius = 50) {
    if (!this.currentLocation) return [];

    return tokenSpots.filter(spot => {
      const distance = this.calculateDistance(
        this.currentLocation.latitude,
        this.currentLocation.longitude,
        spot.latitude,
        spot.longitude,
      );
      return distance <= radius;
    });
  }

  // 현재 위치 반환
  getLastKnownLocation() {
    return this.currentLocation;
  }
}

export default new LocationService();
