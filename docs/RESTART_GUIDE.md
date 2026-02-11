# 시스템 재시작 가이드

## 서비스 시작

```bash
./scripts/start.sh          # anvil → deploy → server → client 전체 시작
```

## 서비스 종료

```bash
./scripts/stop.sh            # 전체 종료 (데이터 유지)
```

## 상태 확인

```bash
./scripts/status.sh
```

## 전체 초기화 (데이터 삭제)

```bash
./scripts/reset.sh           # 서비스 종료 + 블록체인·DB·로그 전체 삭제
./scripts/start.sh           # 처음부터 다시 시작
```

## 테스트 순서

1. **점주로 사용** 선택
2. **지갑 연결**
3. **TON 받기** 클릭 → MetaMask 승인 → 100 TON 받음
4. **스팟 만들기** 탭
5. 지도 클릭 → 폼 입력 → **스팟 생성** → MetaMask 승인
6. **내 스팟 관리** 탭 → 생성된 스팟 확인
