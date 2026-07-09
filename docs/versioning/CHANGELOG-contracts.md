# Changelog — Smart Contracts

All notable changes to the Smart Contracts component.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.0] - 2026-03-04

> 초기 버전 관리 시작. 기존 개발된 모든 기능을 v0.1.0으로 통합.
>
> **배포 네트워크:** Thanos Sepolia (Chain ID: 111551119090)

### Added
- Tokamon.sol — ERC-721 NFT 컨트랙트 (`929ef5b`)
  - Device 기반 클레임 (`5d3dd9b`)
  - ClaimManager 역할 기반 접근 제어 (`e068d9e`)
  - UUPS Proxy 패턴 (`c63fd53`)
  - Claimable Time Windows (`3fdc53a`)
  - Spot 관리 (생성, 편집, 활성/비활성)
  - unlinkTelegram 기능 (`978f7e8`)
  - 선택적 스탬프 목표 + 날짜 검증 (`5aa6780`)
- Faucet.sol — 테스트 TON 배포 (`6ff428d`)
  - 15 TON 지급, 24시간 쿨다운 (`697e290`)
- Native TON (L2 호환) 전환 — ERC20 TON 제거 (`4eaf75e`, `6cb6a4b`)
- Thanos Sepolia 테스트넷 배포 (`ad989e0`)
- Foundry 테스트 스위트 (`a55396f`)

### Security
- 입력 검증 + 이벤트 보안 강화 (`dc65c81`)
- nonReentrant 가드 개선 (`978f7e8`)

---

## [Unreleased]

_다음 릴리스에 포함될 변경사항을 여기에 기록하세요._
