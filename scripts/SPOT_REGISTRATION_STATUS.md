# 스팟 등록 현황

## 등록 순서 및 상태

| 순서 | 파일 | 개수 | 상태 | spotId 범위 | 비고 |
|------|------|------|------|-------------|------|
| 0 | spots-daechi.json | 15 | 완료 | 4~18 | 시범 등록 |
| 1 | spots-kr.json | 253 | 완료 | 19~273 | 한글 description 16개 수정 필요 |
| 2 | spots-us.json | 372 | 완료 | 274~646 | 372/372 완료 |
| 3 | spots-sg.json | 218 | 완료 | 647~864 | 218/218 완료 |
| 4 | spots-gb.json | 180 | 완료 | 865~1044 | 180/180 완료 |
| 5 | spots-jp.json | 30 | 대기 | | |
| 6 | spots-fr.json | 36 | 대기 | | |
| 7 | spots-th.json | 113 | 대기 | | |

## 미완료 작업

- [ ] KR spots-kr.json #5,#9,#12,#14,#19,#24,#27,#29,#33,#34,#36,#43,#45,#49,#50,#51 — 한글 description을 영문으로 updateSpot 필요
- [ ] KR #0 (spotId 19) — description "Starbucks Coffee" 수정 필요

## 설정

- 네트워크: thanos-sepolia
- 컨트랙트: 0xA7cDf6657cE30A2316126d8F9952b9A6f17db9b7
- deposit: 50 TON / spot
- reward: 0.5 TON / claim
- cooldown: 72000s (20h)
- stampGoal: 5, stampBonus: 2 TON
- 지갑: 0x95B54F84e5f58C9bEd45DCf3B791Fe1851a7cB6A
