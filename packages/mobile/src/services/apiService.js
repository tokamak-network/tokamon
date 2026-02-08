// 백엔드 API 통신 서비스
import axios from 'axios';

const API_BASE_URL = 'https://your-backend-api.com/api'; // 실제 백엔드 URL로 변경 필요

class ApiService {
  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  // 인증 토큰 설정
  setAuthToken(token) {
    this.client.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }

  // 토큰 스팟 생성
  async createSpot(spotData) {
    try {
      const response = await this.client.post('/spots', {
        name: spotData.name,
        description: spotData.description,
        latitude: spotData.latitude,
        longitude: spotData.longitude,
        tokenAmount: spotData.tokenAmount,
        depositAmount: spotData.depositAmount,
        creatorAddress: spotData.creatorAddress,
        transactionHash: spotData.transactionHash,
      });
      return {success: true, data: response.data};
    } catch (error) {
      console.error('스팟 생성 API 오류:', error);
      return {success: false, error: error.message};
    }
  }

  // 주변 토큰 스팟 조회
  async getNearbySpots(latitude, longitude, radius = 5000) {
    try {
      const response = await this.client.get('/spots/nearby', {
        params: {latitude, longitude, radius},
      });
      return {success: true, data: response.data};
    } catch (error) {
      console.error('주변 스팟 조회 API 오류:', error);
      return {success: false, error: error.message};
    }
  }

  // 모든 스팟 조회
  async getAllSpots() {
    try {
      const response = await this.client.get('/spots');
      return {success: true, data: response.data};
    } catch (error) {
      console.error('전체 스팟 조회 API 오류:', error);
      return {success: false, error: error.message};
    }
  }

  // 특정 스팟 상세 정보 조회
  async getSpotById(spotId) {
    try {
      const response = await this.client.get(`/spots/${spotId}`);
      return {success: true, data: response.data};
    } catch (error) {
      console.error('스팟 상세 조회 API 오류:', error);
      return {success: false, error: error.message};
    }
  }

  // 토큰 수집 기록
  async collectToken(spotId, userAddress) {
    try {
      const response = await this.client.post('/spots/collect', {
        spotId,
        userAddress,
        timestamp: new Date().toISOString(),
      });
      return {success: true, data: response.data};
    } catch (error) {
      console.error('토큰 수집 API 오류:', error);
      return {success: false, error: error.message};
    }
  }

  // 사용자 수집 이력 조회
  async getUserCollectionHistory(userAddress) {
    try {
      const response = await this.client.get(`/users/${userAddress}/collections`);
      return {success: true, data: response.data};
    } catch (error) {
      console.error('수집 이력 조회 API 오류:', error);
      return {success: false, error: error.message};
    }
  }

  // 사용자가 생성한 스팟 조회
  async getUserCreatedSpots(userAddress) {
    try {
      const response = await this.client.get(`/users/${userAddress}/spots`);
      return {success: true, data: response.data};
    } catch (error) {
      console.error('생성 스팟 조회 API 오류:', error);
      return {success: false, error: error.message};
    }
  }

  // 스팟 남은 토큰 업데이트
  async updateSpotRemainingTokens(spotId, remainingTokens) {
    try {
      const response = await this.client.patch(`/spots/${spotId}`, {
        remainingTokens,
      });
      return {success: true, data: response.data};
    } catch (error) {
      console.error('스팟 업데이트 API 오류:', error);
      return {success: false, error: error.message};
    }
  }

  // 스팟 삭제 (창작자만)
  async deleteSpot(spotId, userAddress) {
    try {
      const response = await this.client.delete(`/spots/${spotId}`, {
        data: {userAddress},
      });
      return {success: true, data: response.data};
    } catch (error) {
      console.error('스팟 삭제 API 오류:', error);
      return {success: false, error: error.message};
    }
  }

  // 통계 정보 조회
  async getStatistics() {
    try {
      const response = await this.client.get('/statistics');
      return {success: true, data: response.data};
    } catch (error) {
      console.error('통계 조회 API 오류:', error);
      return {success: false, error: error.message};
    }
  }

  // 사용자 프로필 정보 조회
  async getUserProfile(userAddress) {
    try {
      const response = await this.client.get(`/users/${userAddress}`);
      return {success: true, data: response.data};
    } catch (error) {
      console.error('프로필 조회 API 오류:', error);
      return {success: false, error: error.message};
    }
  }

  // 사용자 프로필 생성/업데이트
  async updateUserProfile(userAddress, profileData) {
    try {
      const response = await this.client.put(`/users/${userAddress}`, profileData);
      return {success: true, data: response.data};
    } catch (error) {
      console.error('프로필 업데이트 API 오류:', error);
      return {success: false, error: error.message};
    }
  }
}

export default new ApiService();
