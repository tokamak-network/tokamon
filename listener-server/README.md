# Listener Server

블록체인 이벤트를 구독하고 Firestore에 메타데이터를 동기화하는 GCE 리스너입니다.

## 설정

1. `.env` 파일 생성 (`.env.example` 참고)
2. **Firestore 사용 시** `serviceAccountKey.json`:
   - [Firebase Console](https://console.firebase.google.com) → 프로젝트 설정 → 서비스 계정 → **새 비공개 키 생성** → JSON 다운로드
   - 이 폴더에 `serviceAccountKey.json`으로 저장하거나, `.env`에 `SERVICE_ACCOUNT_PATH=/경로/파일명.json` 설정
   - 없으면 리스너는 실행되지만 Firestore 쓰기는 하지 않음
3. 외부 체인 사용 시 Alchemy/Infura 등에서 RPC URL 발급 (로컬은 `http://127.0.0.1:8999`)

```bash
cp .env.example .env
# .env 편집 (RPC_URL, CONTRACT_ADDRESS; 로컬 배포 후 주소는 contract-address.json에서 자동 로드)
```

## 로컬 실행

```bash
npm install
npm start
```

## GCE 배포

```bash
# VM에 업로드 후
pm2 start index.js --name listener
pm2 save
pm2 startup
```
