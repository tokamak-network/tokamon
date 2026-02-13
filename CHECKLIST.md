# Tokamon 체크리스트

## 1. 매장 키오스크 (Store Kiosk)

### 기본 기능
- [ ] MetaMask 지갑 연결
- [ ] 지갑 연결 해제
- [ ] 점주 지갑으로 생성한 스팟만 표시
- [ ] 스팟 선택

### 톤 받기 기능
- [ ] 텔레그램 username 입력 (@자동 추가)
- [ ] 잔액 확인 (컨트랙트에서 직접 조회)
- [ ] 검증 단계
  - [ ] 거리 확인 (매장 위치 기준)
  - [ ] 영업 시간 확인
  - [ ] **쿨다운 확인 (allow_duplicate_claims가 false인 경우만)**
  - [ ] 스팟 잔액 확인
- [ ] MetaMask 트랜잭션 서명
- [ ] 컨트랙트 claimToTelegram() 호출
- [ ] 성공 후 잔액 조회 및 표시
- [ ] 텔레그램 알림 전송

### 중복 발행 테스트
- [ ] allow_duplicate_claims = true인 스팟에서 같은 username으로 연속 클레임 가능
- [ ] allow_duplicate_claims = false인 스팟에서 쿨다운 중 에러 표시

---

## 2. 지도 (Map)

### 지도 표시
- [ ] OpenStreetMap 타일 로드
- [ ] 서울 시청 중심 (37.5665, 126.978)
- [ ] 사용자 위치 표시 (파란 점)
- [ ] 사용자 주변 50m 반경 원 표시

### 스팟 마커
- [ ] 활성 스팟 (토카막 심볼 - 파랑 테두리)
- [ ] 비활성 스팟 (빨강 테두리, 시간 밖)
- [ ] 소진 스팟 (회색, TON 소진)
- [ ] 스팟 클릭 시 정보 표시

### 스팟 생성 모드
- [ ] 지도 클릭으로 위치 선택
- [ ] 주황색 핀 표시
- [ ] 50m 반경 점선 원 표시

---

## 3. 스팟 생성 (Create Spot)

### 기본 정보
- [ ] 매장 이름 입력
- [ ] 매장 설명 입력
- [ ] 영업 시작/종료 시간 설정
- [ ] 지도에서 위치 선택

### 보상 설정
- [ ] 총 예치 금액 (최소 10 TON)
- [ ] 방문 보상 금액
- [ ] 잔액 확인 (부족 시 에러)

### 스탬프 설정
- [ ] 스탬프 목표 횟수
- [ ] 달성 보너스 금액
- [ ] 쿨다운 선택 (1시간/6시간/12시간/24시간)

### **중복 발행 설정**
- [ ] "같은 ID로 중복 톤 발행 허용" 체크박스
- [ ] 체크 시 쿨다운 무시 안내 표시

### 비용 계산
- [ ] 총 지급 가능 방문 횟수
- [ ] 단골 1명 비용
- [ ] 육성 가능 단골 수

### 트랜잭션
- [ ] createSpotSelf() 호출 (allowDuplicateClaims 파라미터 포함)
- [ ] MetaMask 서명
- [ ] 서버에 메타데이터 등록
- [ ] 스팟 ID 반환

---

## 4. 점주 대시보드 (Owner Dashboard)

### 스팟 목록
- [ ] 내 지갑으로 생성한 스팟만 표시
- [ ] 스팟별 상태 (활성/비활성/소진)
- [ ] 남은 TON / 보상 / 남은 횟수 표시
- [ ] 영업 시간 표시
- [ ] 쿨다운 표시 (시간/분/초)
- [ ] **중복 발행 상태 표시 (허용/불허)**
- [ ] 스탬프 정보 표시

### TON 재예치
- [ ] 재예치할 금액 입력
- [ ] 잔액 확인
- [ ] redepositSelf() 호출
- [ ] MetaMask 서명
- [ ] 스팟 목록 새로고침

### 쿨다운 변경
- [ ] 쿨다운 시간 입력 (초 단위)
- [ ] 안내 메시지 (1시간=3600, 1일=86400)
- [ ] updateCooldown() 호출
- [ ] MetaMask 서명
- [ ] 변경 완료 알림

### **중복 발행 설정 변경**
- [ ] "중복 발행 설정" 버튼 클릭
- [ ] 현재 상태 확인 (활성화/비활성화)
- [ ] updateAllowDuplicateClaims() 호출
- [ ] MetaMask 서명
- [ ] 변경 완료 알림
- [ ] 스팟 목록 새로고침

---

## 5. 스팟 정보 (Spot Info)

### 기본 정보
- [ ] 스팟 이름 / 설명
- [ ] 보상 금액 / 남은 잔액
- [ ] 영업 시간 / 쿨다운
- [ ] 스탬프 목표 / 보너스

### 클레임 기능
- [ ] 거리 확인 (50m 이내)
- [ ] 시간 확인 (영업 시간 내)
- [ ] 쿨다운 확인
- [ ] 지갑 연결 확인
- [ ] claim() 호출
- [ ] MetaMask 서명
- [ ] 성공 메시지 / 에러 메시지

---

## 6. 스팟 목록 (Spot List)

### 목록 표시
- [ ] 모든 스팟 로드
- [ ] 거리 계산 및 표시
- [ ] 상태 표시 (활성/비활성/소진)
- [ ] 쿨다운 표시 (남은 시간)
- [ ] 스탬프 진행 상황 표시
- [ ] 스팟 선택

---

## 7. 히스토리 (History)

### 클레임 히스토리
- [ ] 사용자의 클레임 기록 로드
- [ ] 스팟 이름 / 보상 / 보너스 표시
- [ ] 클레임 시간 표시
- [ ] 스탬프 카운트 표시
- [ ] 최신순 정렬

---

## 8. 텔레그램 연동

### 텔레그램 봇
- [ ] 봇 초기화
- [ ] /start 명령어
- [ ] /link 명령어 (지갑 연결)
- [ ] /balance 명령어 (잔액 조회)
- [ ] /withdraw 명령어 (출금)

### 텔레그램 링크 페이지
- [ ] URL 파라미터에서 텔레그램 username 추출
- [ ] 지갑 주소 입력
- [ ] 연결 요청
- [ ] 서버 검증
- [ ] 컨트랙트 linkTelegramToWallet() 호출
- [ ] 기존 잔액 이전
- [ ] 성공/실패 메시지

---

## 9. 컨트랙트 (Tokamon.sol)

### 스팟 관리
- [ ] createSpot() - admin이 생성
- [ ] createSpotSelf() - 점주가 직접 생성 (allowDuplicateClaims 포함)
- [ ] redeposit() - admin이 재예치
- [ ] redepositSelf() - 점주가 직접 재예치
- [ ] updateCooldown() - 쿨다운 변경
- [ ] **updateAllowDuplicateClaims() - 중복 발행 설정 변경**
- [ ] getSpotCore() - 스팟 정보 조회 (allowDuplicateClaims 포함)

### 클레임
- [ ] claim() - 일반 클레임 (admin)
- [ ] claimToPhone() - 핸드폰으로 클레임
- [ ] **claimToTelegram() - 텔레그램으로 클레임 (allowDuplicateClaims 체크)**

### 텔레그램 기능
- [ ] getTelegramBalance() - 잔액 조회
- [ ] getTelegramStampInfo() - 스탬프/쿨다운 정보
- [ ] linkTelegramToWallet() - 지갑 연결
- [ ] getTelegramLinkedWallet() - 연결된 지갑 조회

### 이벤트
- [ ] SpotCreated
- [ ] Claimed
- [ ] TelegramClaimed
- [ ] CooldownUpdated
- [ ] **AllowDuplicateClaimsUpdated**
- [ ] TelegramLinked

---

## 10. 서버 (Backend)

### 블록체인 연동
- [ ] 컨트랙트 초기화
- [ ] ABI 로드 (contracts/out/Tokamon.sol/Tokamon.json)
- [ ] 메타데이터 로드/저장
- [ ] getSpot() - **allow_duplicate_claims 포함**

### API 엔드포인트

#### 스팟
- [ ] GET /api/spots - 전체 스팟 조회
- [ ] POST /api/spots - 스팟 생성
- [ ] POST /api/spots/metadata - 메타데이터 등록
- [ ] POST /api/spots/:id/redeposit - 재예치
- [ ] **POST /api/spots/:id/allow-duplicate-claims - 중복 발행 설정**

#### 텔레그램
- [ ] POST /api/telegram/balance - 잔액 조회
- [ ] POST /api/telegram/stamp-info - 스탬프 정보
- [ ] **POST /api/telegram/validate-claim - 클레임 검증 (allow_duplicate_claims 체크)**
- [ ] POST /api/telegram/notify-claim - 알림 전송
- [ ] POST /api/telegram/link - 지갑 연결

---

## 11. 중복 발행 허용 전체 흐름 체크

### 스팟 생성 시
1. [ ] 클라이언트: CreateSpot.jsx에서 체크박스 선택
2. [ ] 클라이언트: form.allow_duplicate_claims 값 전달
3. [ ] 클라이언트: contract.js createSpotSelf() 호출
4. [ ] 컨트랙트: createSpotSelf() 파라미터 수신
5. [ ] 컨트랙트: spot.allowDuplicateClaims 설정
6. [ ] 서버: 메타데이터 등록

### 스팟 조회 시
1. [ ] 컨트랙트: getSpotCore() 호출
2. [ ] 컨트랙트: allowDuplicateClaims 반환 (7번째 값)
3. [ ] 서버: blockchain.js getSpot()에서 allow_duplicate_claims 파싱
4. [ ] API: allow_duplicate_claims 필드 포함하여 반환
5. [ ] 클라이언트: 스팟 목록/대시보드에 표시

### 톤 받기 시
1. [ ] 클라이언트: StoreKiosk.jsx에서 validate-claim API 호출
2. [ ] 서버: telegram.js에서 spot.allow_duplicate_claims 확인
3. [ ] 서버: allow_duplicate_claims가 false인 경우만 쿨다운 체크
4. [ ] 서버: 검증 통과 응답
5. [ ] 클라이언트: claimToTelegram() 호출
6. [ ] 컨트랙트: spot.allowDuplicateClaims 확인
7. [ ] 컨트랙트: allowDuplicateClaims가 false인 경우만 쿨다운 require
8. [ ] 컨트랙트: 톤 전송 및 상태 업데이트

### 설정 변경 시
1. [ ] 클라이언트: OwnerDashboard.jsx "중복 발행 설정" 클릭
2. [ ] 클라이언트: updateAllowDuplicateClaims() 호출
3. [ ] 컨트랙트: spot.allowDuplicateClaims 업데이트
4. [ ] 컨트랙트: AllowDuplicateClaimsUpdated 이벤트 발생
5. [ ] 클라이언트: 스팟 목록 새로고침
6. [ ] 화면: 변경된 상태 표시

---

## 12. 디버깅 체크리스트

### 중복 발행이 안될 때
- [ ] 컨트랙트에서 allowDuplicateClaims 값 확인
  ```bash
  node -e "..." # 위에서 사용한 스크립트
  ```
- [ ] 서버 API 응답에서 allow_duplicate_claims 확인
  ```bash
  curl http://localhost:3001/api/spots | jq '.[0].allow_duplicate_claims'
  ```
- [ ] 서버 로그 확인
  ```bash
  tail -f server/server.log
  ```
- [ ] 브라우저 개발자 도구 네트워크 탭 확인
- [ ] 브라우저 콘솔 에러 확인

### ABI 동기화 확인
- [ ] contracts/solidity/Tokamon.json 최신 컴파일
- [ ] contracts/out/Tokamon.sol/Tokamon.json 복사 확인
- [ ] client/public/Tokamon.json 복사 확인
- [ ] 서버 재시작
- [ ] 클라이언트 새로고침

### 컨트랙트 재배포 후
- [ ] 옵티마이저 활성화 확인 (compile.js)
- [ ] 컨트랙트 주소 업데이트 (contract-address.json)
- [ ] 메타데이터 삭제 (spot-metadata.json)
- [ ] 서버/클라이언트 재시작

---

## 테스트 시나리오

### 시나리오 1: 중복 발행 허용 스팟
1. [ ] 스팟 생성 (중복 발행 허용 체크)
2. [ ] 텔레그램 username으로 톤 받기
3. [ ] 같은 username으로 즉시 다시 받기 (성공해야 함)
4. [ ] 여러 번 연속 받기 (모두 성공해야 함)

### 시나리오 2: 중복 발행 불허 스팟
1. [ ] 스팟 생성 (중복 발행 허용 체크 안 함)
2. [ ] 텔레그램 username으로 톤 받기
3. [ ] 같은 username으로 즉시 다시 시도 (쿨다운 에러)
4. [ ] 쿨다운 시간 경과 후 다시 시도 (성공)

### 시나리오 3: 설정 변경
1. [ ] 중복 불허 스팟 생성
2. [ ] 톤 받기 후 쿨다운 에러 확인
3. [ ] 점주 대시보드에서 중복 발행 활성화
4. [ ] 같은 username으로 즉시 받기 (성공)
5. [ ] 중복 발행 비활성화
6. [ ] 같은 username으로 즉시 시도 (쿨다운 에러)

