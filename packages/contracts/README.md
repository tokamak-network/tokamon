# TON Smart Contracts

Walk to Earn 프로젝트의 TON 블록체인 스마트 컨트랙트입니다.

## 주요 기능

### 1. 스팟 생성 (create_spot)
- 광고주가 TON을 예치하고 토큰 스팟 생성
- 위치 정보 (위도, 경도) 저장
- 방문자당 보상 금액 설정

### 2. 토큰 수집 (collect_token)
- 사용자가 스팟 근처 방문 시 토큰 수집
- 중복 수집 방지
- 자동 토큰 전송

### 3. 스팟 정보 조회 (get_spot_info)
- 스팟 상세 정보 반환
- 남은 토큰량 확인

## 컴파일

```bash
yarn compile
```

## 테스트

```bash
yarn test
```

## 배포

```bash
# 환경 변수 설정
export WALLET_MNEMONIC="your mnemonic words here"

# 테스트넷 배포
yarn deploy
```

## 컨트랙트 구조

```
contract.fc
├── create_spot()      - 스팟 생성
├── collect_token()    - 토큰 수집
├── get_spot_info()    - 스팟 정보 조회
└── get_total_spots()  - 총 스팟 수
```

## 개발 상태

현재는 기본 구조만 구현되어 있습니다. 다음 기능들이 추가로 필요합니다:

- [ ] Dictionary를 이용한 스팟 데이터 저장
- [ ] 토큰 전송 로직
- [ ] 중복 수집 방지 로직
- [ ] 스팟 삭제 및 환불 기능
- [ ] 수수료 징수 기능
- [ ] 테스트 코드 작성
