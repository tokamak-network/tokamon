# 🔄 시스템 재시작 가이드

## 1️⃣ 터미널 1: Ganache 시작
```bash
npm run ganache
```

**중요**: 이 터미널을 **열어둔 채로** 유지하세요.

---

## 2️⃣ 터미널 2: 컨트랙트 배포
```bash
npm run deploy
```

**예상 출력:**
```
✓ Tokamon 배포 완료: 0x...
✓ Faucet 배포 완료: 0x...
✓ Faucet 초기 잔액: 1000 ETH
```

---

## 3️⃣ 터미널 3: 서버 시작
```bash
npm run server
```

---

## 4️⃣ 터미널 4: 클라이언트 시작
```bash
npm run client
```

---

## 5️⃣ 브라우저
`http://localhost:5173` 접속 후 **Cmd+Shift+R** (강력 새로고침)

---

## 🎯 수정된 사항

### Tokamon.sol
- `deposit()` 함수의 `onlyAdmin` modifier 제거
- 이제 Faucet 컨트랙트가 deposit을 호출할 수 있음

### Faucet 초기 잔액
- 5000 ETH → 1000 ETH로 감소

---

## 🧪 테스트 순서

1. **점주로 사용** 선택
2. **지갑 연결**
3. **TON 받기** 클릭 → MetaMask 승인 → 100 TON 받음
4. **스팟 만들기** 탭
5. 지도 클릭 → 폼 입력 → **스팟 생성** → MetaMask 승인
6. **내 스팟 관리** 탭 → 생성된 스팟 확인

---

이 가이드대로 진행해주세요!
