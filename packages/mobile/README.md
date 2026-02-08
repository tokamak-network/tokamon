# 만보기 앱 - TON 토큰 보상 기능

걸음 수를 측정하고, 특정 위치에 방문하면 TON 토큰을 받을 수 있는 Web3 만보기 애플리케이션입니다.

## 주요 기능

### 1. 걸음 수 측정
- 가속도계 센서를 이용한 실시간 걸음 수 카운팅
- 목표 설정 (5,000 ~ 15,000 걸음)
- 걸음 수 기반 거리 및 칼로리 계산

### 2. 위치 기반 토큰 보상 시스템
- **토큰 스팟 생성**: 가게/광고주가 TON을 예치하고 위치에 보상 스팟 등록
- **자동 토큰 수집**: 사용자가 50m 이내로 접근 시 자동으로 토큰 획득
- **지도 뷰**: 근처 토큰 스팟을 지도에서 확인

### 3. TON 블록체인 통합
- TON 지갑 연동
- 실시간 잔액 조회
- 토큰 전송 기능

## 기술 스택

- **프레임워크**: React Native 0.73
- **블록체인**: TON (The Open Network)
- **지도**: React Native Maps (Google Maps)
- **센서**: React Native Sensors
- **위치**: React Native Geolocation

## 설치 방법

### 사전 요구사항

1. Node.js 18 이상
2. React Native 개발 환경 설정
   - [React Native 환경 설정 가이드](https://reactnative.dev/docs/environment-setup)
3. Android Studio (안드로이드용) 또는 Xcode (iOS용)
4. Google Maps API Key

### 설치 단계

1. 저장소 클론 및 의존성 설치:

```bash
cd pedometer-app
npm install
```

2. Google Maps API Key 설정:

**Android**: `android/app/src/main/AndroidManifest.xml`
```xml
<meta-data
  android:name="com.google.android.geo.API_KEY"
  android:value="YOUR_GOOGLE_MAPS_API_KEY"/>
```

**iOS**: `ios/PedometerApp/AppDelegate.m`에 추가:
```objc
#import <GoogleMaps/GoogleMaps.h>

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  [GMSServices provideAPIKey:@"YOUR_GOOGLE_MAPS_API_KEY"];
  // ...
}
```

3. 네이티브 의존성 설치:

**iOS**:
```bash
cd ios
pod install
cd ..
```

**Android**: 추가 설정 불필요

## 실행 방법

### 안드로이드

```bash
npm run android
```

또는

```bash
npx react-native run-android
```

### iOS

```bash
npm run ios
```

또는

```bash
npx react-native run-ios
```

## 프로젝트 구조

```
pedometer-app/
├── src/
│   ├── screens/
│   │   ├── CreateSpotScreen.js    # 토큰 스팟 생성 화면
│   │   └── MapScreen.js           # 지도 및 스팟 표시
│   └── services/
│       ├── tonService.js          # TON 블록체인 연동
│       ├── locationService.js     # GPS 위치 추적
│       └── apiService.js          # 백엔드 API 통신
├── App.js                         # 메인 만보기 화면
├── android/                       # 안드로이드 네이티브 코드
├── ios/                          # iOS 네이티브 코드
└── package.json
```

## 작동 원리

### 걸음 수 측정

1. 가속도계 센서가 100ms마다 X, Y, Z 축의 움직임 감지
2. 이전 값과 비교하여 변화량 계산
3. 임계값(1.5) 초과 시 걸음으로 인식
4. 200ms 간격으로 중복 카운트 방지

### 토큰 스팟 시스템

1. **스팟 생성**:
   - 광고주가 현재 위치에 토큰 스팟 생성
   - TON을 스마트 컨트랙트에 예치
   - 사용자당 보상 금액 설정

2. **토큰 수집**:
   - 사용자가 스팟 50m 이내 접근
   - 자동으로 토큰 수집 알림
   - 스마트 컨트랙트에서 사용자 지갑으로 전송

3. **지도 표시**:
   - 초록색: 활성 스팟 (토큰 남음)
   - 회색: 수집 완료
   - 빨간색: 토큰 소진

## 백엔드 API

현재 프론트엔드만 구현되어 있습니다. 백엔드는 다음 엔드포인트를 제공해야 합니다:

- `POST /api/spots` - 새 스팟 생성
- `GET /api/spots/nearby` - 주변 스팟 조회
- `POST /api/spots/collect` - 토큰 수집 기록
- `GET /api/users/:address/collections` - 사용자 수집 이력

**백엔드 구현 예시**: Node.js + Express + MongoDB + TON SDK

## 환경 설정

`src/services/apiService.js`에서 백엔드 API URL 변경:

```javascript
const API_BASE_URL = 'https://your-backend-api.com/api';
```

## 주의사항

1. **Google Maps API Key**: 실제 API 키를 발급받아 설정해야 합니다
2. **TON Testnet**: 개발 중에는 Testnet 사용을 권장합니다
3. **위치 권한**: 앱 실행 시 위치 권한을 허용해야 합니다
4. **백엔드 필요**: 실제 운영을 위해서는 백엔드 서버 구축이 필요합니다

## 향후 개발 계획

- [ ] TON 스마트 컨트랙트 개발
- [ ] 백엔드 API 서버 구축
- [ ] 사용자 프로필 및 통계 기능
- [ ] 리더보드 시스템
- [ ] 푸시 알림 (근처 스팟 알림)
- [ ] 배경에서 위치 추적
- [ ] NFT 배지 시스템

## 라이선스

MIT License

## 기여

이슈 및 풀 리퀘스트를 환영합니다!
