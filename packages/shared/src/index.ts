// Types
export * from './types/spot';
export * from './types/user';
export * from './types/location';

// Constants
export const CONSTANTS = {
  // 토큰 수집 범위 (미터)
  COLLECTION_RADIUS: 50,
  
  // GPS 정확도 임계값 (미터)
  GPS_ACCURACY_THRESHOLD: 30,
  
  // 걸음 수 감지 임계값
  STEP_THRESHOLD: 1.5,
  
  // 걸음 간격 (밀리초)
  STEP_INTERVAL: 200,
  
  // 기본 목표 걸음 수
  DEFAULT_GOAL_STEPS: 10000,
  
  // 평균 보폭 (미터)
  AVERAGE_STRIDE: 0.7,
  
  // 걸음당 칼로리
  CALORIES_PER_STEP: 0.04,
  
  // 플랫폼 수수료 (10%)
  PLATFORM_FEE: 0.1,
};

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}
