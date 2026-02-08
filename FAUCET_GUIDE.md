# 💰 Faucet 사용 가이드

테스트 TON을 받는 방법입니다.

## 방법 1: 브라우저 콘솔에서 직접 요청

1. 브라우저에서 `http://localhost:5173` 접속
2. F12를 눌러 개발자 도구 열기
3. Console 탭으로 이동
4. 다음 명령어 입력:

```javascript
// 지갑 연결 후 자동으로 내 주소로 100 TON 받기
fetch('http://localhost:3001/api/faucet', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    address: window.ethereum.selectedAddress
  })
})
.then(r => r.json())
.then(data => {
  console.log('✅ Faucet 성공:', data);
  alert(`${data.amount} TON이 지급되었습니다! 현재 잔액: ${data.balance} TON`);
  location.reload(); // 페이지 새로고침
});
```

## 방법 2: curl 명령어로 요청

터미널에서 실행 (지갑 주소를 본인 주소로 변경):

```bash
curl -X POST http://localhost:3001/api/faucet \
  -H 'Content-Type: application/json' \
  -d '{"address": "0x당신의지갑주소"}'
```

## 방법 3: 헤더의 "+ 충전" 버튼 사용

1. 지갑 연결
2. 헤더의 **"+ 충전"** 버튼 클릭
3. 충전할 금액 입력 (예: 100)
4. MetaMask에서 트랜잭션 승인

⚠️ **주의**: 이 방법은 실제 ETH를 사용하여 컨트랙트에 전송합니다. Ganache 로컬 환경이므로 실제 비용은 없습니다.

## API 엔드포인트

### POST /api/faucet
**요청:**
```json
{
  "address": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
}
```

**응답:**
```json
{
  "message": "100 TON이 지급되었습니다!",
  "amount": 100,
  "balance": 100
}
```

### GET /api/faucet/balance?address=0x...
**응답:**
```json
{
  "balance": 100
}
```

## 기본 설정

- **1회 지급량**: 100 TON
- **제한**: 없음 (테스트 환경이므로 무제한 요청 가능)

## Ganache 계정 (테스트용)

Ganache 시작 시 생성되는 기본 계정들을 MetaMask에 import하여 사용할 수 있습니다:

```bash
# Ganache 실행 후 표시되는 Private Key를 복사하여
# MetaMask > Import Account에 붙여넣기
```

각 계정은 기본적으로 10000 ETH를 가지고 있습니다.
