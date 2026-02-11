# 텔레그램 클레임 시스템

## 개요

Tokamon은 텔레그램 username을 통해 TON을 발급하고, 나중에 지갑으로 클레임할 수 있는 시스템을 제공합니다.

## 핵심 개념

### 1. 텔레그램 해시
- 텔레그램 username (`@zena_tokamak`)을 SHA256으로 해시화
- 서버: `hashTelegramId(username)` → hex 문자열 (예: `"0370e0d2..."`)
- 컨트랙트: `bytes32` 형식 (예: `0x0370e0d2...`)

### 2. 식별자 통일
- 모든 클레임은 **텔레그램 해시**로만 식별
- 지갑 주소 기반 클레임 없음
- 중복 방지, 스탬프, 쿨다운 모두 텔레그램 해시 기반

## 컨트랙트 스토리지

### 텔레그램 관련 스토리지
```solidity
// 텔레그램 해시별 TON 잔액 (컨트랙트 내부 보관)
mapping(bytes32 => uint256) public telegramBalances;

// 텔레그램 해시별 스탬프 카운트
mapping(bytes32 => mapping(uint256 => uint256)) public telegramStampCount;

// 텔레그램 해시별 쿨다운
mapping(bytes32 => mapping(uint256 => uint256)) public telegramLastClaimTime;

// 텔레그램 해시 <-> 지갑 주소 매핑
mapping(bytes32 => address) public telegramToWallet;
mapping(address => bytes32) public walletToTelegram;
```

### 스팟 생성용 스토리지
```solidity
// 매장 관리자가 스팟 생성 시 사용하는 내부 잔액
mapping(address => uint256) public balances;
```

## 클레임 플로우

### 케이스 1: 지갑 연결 전 발급
```
1. 키오스크에서 @zena_tokamak 입력
2. username → 텔레그램 해시 계산
3. claimToTelegram(spotId, telegramHash) 호출
4. telegramBalances[해시] += 보상액
5. telegramStampCount[해시][spotId] 증가
6. telegramLastClaimTime[해시][spotId] 기록
```

**특징:**
- 지갑 연결 없이도 발급 가능
- `telegramBalances`에 임시 보관
- 쿨다운/스탬프 관리 정상 작동

### 케이스 2: 지갑 연결
```
1. 텔레그램 봇에서 /link 명령
2. linkTelegramToWallet(해시, 지갑주소) 호출
3. 양방향 매핑 설정:
   - telegramToWallet[해시] = 지갑주소
   - walletToTelegram[지갑주소] = 해시
4. 잔액은 그대로 유지 (이전 안함)
```

**특징:**
- 매핑만 설정, 잔액 이전 없음
- 클레임 권한 부여

### 케이스 3: 지갑으로 클레임
```
1. "지갑으로 클레임" 버튼 클릭
2. claimTelegramToWallet() 호출
3. walletToTelegram[msg.sender]로 해시 조회
4. 해시가 있으면 클레임 권한 확인
5. telegramBalances[해시]에서 잔액 조회
6. 실제 ETH/TON을 msg.sender로 전송
7. telegramBalances[해시] = 0
```

**특징:**
- 연결된 지갑만 클레임 가능
- 실제 토큰이 지갑으로 이동
- 컨트랙트 잔액 소진

### 케이스 4: 지갑 연결 후 추가 발급
```
1. 지갑 연결 완료 상태
2. 키오스크에서 @zena_tokamak 입력
3. claimToTelegram(spotId, telegramHash) 호출
4. telegramBalances[해시] += 보상액
5. 여전히 컨트랙트에 보관
```

**특징:**
- 지갑 연결 여부와 무관하게 항상 `telegramBalances`에 적립
- 원할 때 `claimTelegramToWallet()` 호출하여 인출

## 중복 방지 로직

### 중복 불허 스팟 (allowDuplicateClaims = false)
```solidity
function claimToTelegram(uint256 spotId, bytes32 telegramHash) external {
    Spot storage spot = spots[spotId];
    
    if (!spot.allowDuplicateClaims) {
        require(
            block.timestamp >= telegramLastClaimTime[telegramHash][spotId] + spot.cooldown,
            "cooldown not elapsed"
        );
    }
    
    // 보상 지급
    telegramBalances[telegramHash] += payout;
    telegramLastClaimTime[telegramHash][spotId] = block.timestamp;
}
```

**핵심:**
- 텔레그램 해시로만 식별
- 같은 해시로는 쿨다운 시간 내 재클레임 불가
- 지갑 주소 변경해도 우회 불가능

## 서버-컨트랙트 해시 처리

### 서버 (utils.js)
```javascript
function hashTelegramId(username) {
  const cleaned = username.replace('@', '').toLowerCase().trim();
  const salt = process.env.TELEGRAM_HASH_SALT || 'tokamon-telegram-2024';
  return crypto.createHash('sha256').update(salt + cleaned).digest('hex');
  // 반환: "0370e0d200015e26..." (64자 hex 문자열)
}
```

### 서버 → 컨트랙트 호출 (blockchain.js)
```javascript
async function claimToTelegram(spotId, telegramHash) {
  const tx = await contract.claimToTelegram(spotId, '0x' + telegramHash);
  // "0x" 접두사 추가하여 bytes32 형식으로 변환
}
```

### 컨트랙트 → 서버 반환 (blockchain.js)
```javascript
async function getWalletLinkedTelegram(walletAddress) {
  const telegramHash = await contract.getWalletLinkedTelegram(toAddr(walletAddress));
  return telegramHash.slice(2); // "0x" 제거하여 반환
}
```

### 클라이언트
```javascript
// 컨트랙트에서 조회
const hash = await getWalletLinkedTelegram(account);
// 반환: "0x0370e0d2..." (컨트랙트 직접 조회)

// 서버로 전송 시 정규화
const normalizedHash = hash.toLowerCase().replace('0x', '');
```

## 주요 함수

### 컨트랙트 함수

#### claimToTelegram (매장 관리자만 호출)
```solidity
function claimToTelegram(uint256 spotId, bytes32 telegramHash) external
```
- 스팟 소유자만 호출 가능
- 텔레그램 해시로 TON 발급
- `telegramBalances[해시]`에 적립

#### linkTelegramToWallet (admin만 호출)
```solidity
function linkTelegramToWallet(bytes32 telegramHash, address wallet) external onlyAdmin
```
- 텔레그램 해시 ↔ 지갑 주소 매핑
- 잔액 이전 없음 (권한만 부여)

#### claimTelegramToWallet (사용자 호출)
```solidity
function claimTelegramToWallet() external
```
- 연결된 텔레그램 잔액을 지갑으로 인출
- `msg.sender`가 연결된 해시 조회
- 실제 ETH/TON 전송

#### getTelegramBalance
```solidity
function getTelegramBalance(bytes32 telegramHash) external view returns (uint256)
```
- 텔레그램 해시의 현재 잔액 조회

#### getWalletLinkedTelegram
```solidity
function getWalletLinkedTelegram(address wallet) external view returns (bytes32)
```
- 지갑 주소에 연결된 텔레그램 해시 조회

## 보안 고려사항

### 1. 중복 클레임 방지
- 텔레그램 해시로만 식별
- 지갑 주소 변경으로 우회 불가능
- `allowDuplicateClaims` 설정 준수

### 2. 권한 관리
- `claimToTelegram`: 스팟 소유자만 호출 가능
- `linkTelegramToWallet`: admin만 호출 가능
- `claimTelegramToWallet`: 연결된 지갑만 인출 가능

### 3. 잔액 보호
- `telegramBalances`는 컨트랙트 내부 장부
- 실제 ETH는 컨트랙트 보유
- 클레임 시에만 실제 전송

## 예시 시나리오

### 시나리오: 신규 사용자
```
1. [고객] 매장 방문
2. [키오스크] @newuser 입력
3. [컨트랙트] telegramBalances[해시(newuser)] += 0.5 TON
4. [고객] 텔레그램 알림 수신: "0.5 TON 적립!"
5. [고객] 나중에 /link 명령으로 지갑 연결
6. [고객] 앱에서 "지갑으로 클레임" 버튼
7. [컨트랙트] 0.5 TON을 연결된 지갑으로 전송
```

### 시나리오: 기존 사용자 (지갑 연결 완료)
```
1. [고객] 다른 매장 방문
2. [키오스크] @newuser 입력
3. [컨트랙트] telegramBalances[해시(newuser)] += 1.0 TON
4. [고객] 텔레그램 알림 수신: "1.0 TON 적립! 총 1.0 TON"
5. [고객] 원할 때 앱에서 "지갑으로 클레임"
6. [컨트랙트] 1.0 TON을 지갑으로 전송
```

### 시나리오: 중복 방지 테스트
```
1. [고객] 스팟 A 방문 (중복 불허, 쿨다운 24시간)
2. [키오스크] @user 입력 → 성공
3. [고객] 10분 후 다시 방문
4. [키오스크] @user 입력 → 실패 ("cooldown not elapsed")
5. [고객] 25시간 후 다시 방문
6. [키오스크] @user 입력 → 성공
```

## 마이그레이션 가이드

### 기존 시스템에서 변경사항

#### 제거된 기능
- ❌ 핸드폰 번호 해시 기반 클레임
- ❌ 지갑 주소 기반 직접 클레임
- ❌ `/link` 시 자동 잔액 이전

#### 추가된 기능
- ✅ `claimTelegramToWallet()` 함수
- ✅ 수동 클레임 프로세스

#### 변경 없음
- ✅ 텔레그램 해시 기반 발급
- ✅ 스탬프 시스템
- ✅ 쿨다운 시스템
