const crypto = require('crypto');
const { playintegrity } = require('@googleapis/playintegrity');
const appAttest = require('appattest-checker-node');

// ─── Google Play Integrity (Android) ───

const GOOGLE_CLOUD_PROJECT_NUMBER = process.env.GOOGLE_CLOUD_PROJECT_NUMBER;

let playIntegrityClient = null;

function getPlayIntegrityClient() {
  if (!playIntegrityClient) {
    playIntegrityClient = playintegrity({
      version: 'v1',
      auth: new (require('google-auth-library').GoogleAuth)({
        scopes: ['https://www.googleapis.com/auth/playintegrity'],
      }),
    });
  }
  return playIntegrityClient;
}

/**
 * Google Play Integrity 토큰 검증
 * @param {string} token - Play Integrity token from client
 * @param {string} expectedNonce - base64-encoded nonce (requestHash)
 * @returns {Promise<{ valid: boolean, verdict?: object, error?: string }>}
 */
async function verifyPlayIntegrity(token, expectedNonce) {
  if (!GOOGLE_CLOUD_PROJECT_NUMBER) {
    throw new Error('GOOGLE_CLOUD_PROJECT_NUMBER not configured');
  }

  const client = getPlayIntegrityClient();
  const res = await client.v1.decodeIntegrityToken({
    packageName: 'io.tokamak.tokamon',
    requestBody: { integrityToken: token },
  });

  const verdict = res.data?.tokenPayloadExternal;
  if (!verdict) {
    return { valid: false, error: 'Empty verdict' };
  }

  // Nonce 검증
  if (verdict.requestDetails?.nonce !== expectedNonce) {
    return { valid: false, error: 'Nonce mismatch' };
  }

  // 패키지 이름 검증
  if (verdict.appIntegrity?.packageName !== 'io.tokamak.tokamon') {
    return { valid: false, error: 'Package name mismatch' };
  }

  // 앱 무결성: PLAY_RECOGNIZED
  const appRecognition = verdict.appIntegrity?.appRecognitionVerdict;
  if (appRecognition !== 'PLAY_RECOGNIZED') {
    return { valid: false, error: `App not recognized: ${appRecognition}` };
  }

  // 디바이스 무결성: MEETS_DEVICE_INTEGRITY 이상
  const deviceIntegrity = verdict.deviceIntegrity?.deviceRecognitionVerdict || [];
  if (!deviceIntegrity.includes('MEETS_DEVICE_INTEGRITY')) {
    return { valid: false, error: `Device integrity insufficient: ${deviceIntegrity.join(',')}` };
  }

  return { valid: true, verdict };
}

// ─── Apple App Attest (iOS) ───

const IOS_APP_ATTEST_APP_ID = process.env.IOS_APP_ATTEST_APP_ID;
const IS_PROD = process.env.NODE_ENV === 'production';

/**
 * iOS App Attest: 최초 key attestation 검증
 * API: verifyAttestation(appInfo, keyId, challenge, attestation)
 * @param {string} keyId - App Attest key ID
 * @param {string} challenge - base64-encoded challenge (서버가 생성한 원본)
 * @param {string} attestationBase64 - base64-encoded attestation object from client
 * @returns {Promise<{ publicKeyPem: string, receipt: Buffer }>}
 */
async function verifyIosAttestation(keyId, challenge, attestationBase64) {
  if (!IOS_APP_ATTEST_APP_ID) {
    throw new Error('IOS_APP_ATTEST_APP_ID not configured');
  }

  const appInfo = {
    appId: IOS_APP_ATTEST_APP_ID,
    developmentEnv: !IS_PROD,
  };

  const attestation = Buffer.from(attestationBase64, 'base64');
  // challenge: 클라이언트에서 SHA256(challenge)를 clientDataHash로 사용하므로
  // 여기서는 원본 challenge를 그대로 전달 (라이브러리가 내부에서 SHA256 수행)
  const challengeBuffer = Buffer.from(challenge, 'base64');

  const result = await appAttest.verifyAttestation(appInfo, keyId, challengeBuffer, attestation);

  if ('verifyError' in result) {
    throw new Error(`iOS attestation failed: ${result.verifyError} — ${result.errorMessage || ''}`);
  }

  return {
    publicKeyPem: result.publicKeyPem,
    receipt: result.receipt,
  };
}

/**
 * iOS App Attest: per-request assertion 검증
 * API: verifyAssertion(clientDataHash, publicKeyPem, appId, assertion)
 * @param {string} assertionBase64 - base64-encoded assertion
 * @param {string} clientDataHashBase64 - base64-encoded SHA-256 of client data
 * @param {string} publicKeyPem - stored public key PEM
 * @param {number} storedSignCount - last known sign count
 * @returns {Promise<{ valid: boolean, newSignCount: number }>}
 */
async function verifyIosAssertion(assertionBase64, clientDataHashBase64, publicKeyPem, storedSignCount) {
  if (!IOS_APP_ATTEST_APP_ID) {
    throw new Error('IOS_APP_ATTEST_APP_ID not configured');
  }

  const assertion = Buffer.from(assertionBase64, 'base64');
  const clientDataHash = Buffer.from(clientDataHashBase64, 'base64');

  const result = await appAttest.verifyAssertion(clientDataHash, publicKeyPem, IOS_APP_ATTEST_APP_ID, assertion);

  if ('verifyError' in result) {
    throw new Error(`iOS assertion failed: ${result.verifyError} — ${result.errorMessage || ''}`);
  }

  // signCount replay 방지
  if (result.signCount <= storedSignCount) {
    throw new Error(`iOS assertion replay: signCount ${result.signCount} <= stored ${storedSignCount}`);
  }

  return {
    valid: true,
    newSignCount: result.signCount,
  };
}

/**
 * challenge 생성 (iOS attestation flow 용)
 * @returns {string} base64-encoded random challenge
 */
function generateChallenge() {
  return crypto.randomBytes(32).toString('base64');
}

module.exports = {
  verifyPlayIntegrity,
  verifyIosAttestation,
  verifyIosAssertion,
  generateChallenge,
};
