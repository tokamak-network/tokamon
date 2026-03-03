import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { Buffer } from 'buffer';
import { getListenerUrl } from '../utils/networkStore';

const ATTEST_KEY_ID_STORE = 'tokamon_attest_key_id';
const GOOGLE_CLOUD_PROJECT_NUMBER = process.env.EXPO_PUBLIC_GOOGLE_CLOUD_PROJECT_NUMBER;

let AppIntegrity = null;
let androidProviderReady = false;
let initPromise = null;

/**
 * 앱 시작 시 attestation 초기화
 * - Android: Play Integrity provider 준비
 * - iOS: 특별한 초기화 불필요 (요청 시 lazy init)
 */
export async function initAttestation() {
  if (initPromise) return initPromise;
  initPromise = _doInit();
  return initPromise;
}

async function _doInit() {
  try {
    AppIntegrity = require('@expo/app-integrity');
  } catch (e) {
    console.warn('[Attestation] @expo/app-integrity not available:', e.message);
    return;
  }

  if (Platform.OS === 'android' && GOOGLE_CLOUD_PROJECT_NUMBER) {
    try {
      await AppIntegrity.prepareIntegrityTokenProviderAsync(GOOGLE_CLOUD_PROJECT_NUMBER);
      androidProviderReady = true;
      console.log('[Attestation] Android Play Integrity provider ready');
    } catch (e) {
      console.warn('[Attestation] Android provider init failed:', e.message);
    }
  }
}

/**
 * 디바이스 API 요청에 포함할 attestation 헤더 반환
 * 실패 시 빈 객체 반환 (서버가 REQUIRE_ATTESTATION=false이면 통과)
 */
export async function getAttestationHeaders(deviceId, requestBody) {
  if (!AppIntegrity) return {};

  try {
    if (Platform.OS === 'android') {
      return await _getAndroidHeaders(requestBody);
    } else if (Platform.OS === 'ios') {
      return await _getIosHeaders(deviceId, requestBody);
    }
  } catch (e) {
    console.warn('[Attestation] Failed to get headers:', e.message);
  }
  return {};
}

/**
 * 서버에서 ATTEST_REQUIRED 응답을 받았을 때 iOS key 초기화 후 재시도
 */
export async function resetAttestation() {
  if (Platform.OS === 'ios') {
    await SecureStore.deleteItemAsync(ATTEST_KEY_ID_STORE);
    console.log('[Attestation] iOS key reset — will re-attest on next request');
  }
}

// ─── Android ───

async function _getAndroidHeaders(requestBody) {
  if (!androidProviderReady) return {};

  // requestHash = body의 JSON을 SHA-256 해싱 (base64url)
  const bodyStr = JSON.stringify(requestBody || {});
  const requestHash = await _sha256Base64(bodyStr);

  const token = await AppIntegrity.requestIntegrityCheckAsync(requestHash);
  return {
    'x-attestation-platform': 'android',
    'x-attestation-token': token,
    'x-attestation-nonce': requestHash,
  };
}

// ─── iOS ───

async function _getIosHeaders(deviceId, requestBody) {
  // App Attest 미지원 디바이스 체크
  if (!AppIntegrity.isSupported) return {};

  let keyId = await SecureStore.getItemAsync(ATTEST_KEY_ID_STORE);

  // 키가 없으면 attestation flow 실행
  if (!keyId) {
    keyId = await _performIosAttestation(deviceId);
    if (!keyId) return {}; // attestation 실패
  }

  // clientDataHash = body의 JSON을 SHA-256 해싱 (base64)
  const bodyStr = JSON.stringify(requestBody || {});
  const clientDataHash = await _sha256Base64(bodyStr);

  const assertion = await AppIntegrity.generateAssertionAsync(keyId, clientDataHash);

  return {
    'x-attestation-platform': 'ios',
    'x-attestation-token': assertion,
    'x-attestation-key-id': keyId,
    'x-attestation-client-data': clientDataHash,
  };
}

/**
 * iOS App Attest: 최초 key 생성 + attestation + 서버 등록
 * @returns {string|null} keyId or null on failure
 */
async function _performIosAttestation(deviceId) {
  try {
    // 1. 서버에서 challenge 요청
    const challengeRes = await fetch(`${getListenerUrl()}/api/device/attest-challenge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const { challenge_id, challenge } = await challengeRes.json();

    // 2. Secure Enclave에서 key 생성
    const keyId = await AppIntegrity.generateKeyAsync();

    // 3. Apple에 key attestation 요청
    const attestation = await AppIntegrity.attestKeyAsync(keyId, challenge);

    // 4. 서버에 등록
    const registerRes = await fetch(`${getListenerUrl()}/api/device/attest-register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        device_id: deviceId,
        key_id: keyId,
        attestation,
        challenge_id,
      }),
    });

    const registerData = await registerRes.json();
    if (!registerData.attested) {
      throw new Error('Server rejected attestation');
    }

    // 5. keyId 저장
    await SecureStore.setItemAsync(ATTEST_KEY_ID_STORE, keyId);
    console.log('[Attestation] iOS key registered successfully');
    return keyId;
  } catch (e) {
    console.warn('[Attestation] iOS attestation flow failed:', e.message);
    return null;
  }
}

// ─── Utils ───

async function _sha256Base64(str) {
  // React Native에서 crypto API 사용: expo-crypto 없이 JS 구현
  // 가벼운 해시를 위해 SubtleCrypto (react-native-get-random-values polyfill 포함)
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Buffer.from(hashBuffer).toString('base64');
}
