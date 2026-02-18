const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');
const { collectionPath, DEFAULT_NETWORK } = require('../shared/networks');

const serviceAccountPath =
  process.env.SERVICE_ACCOUNT_PATH ||
  path.join(__dirname, 'serviceAccountKey.json');

let db = null;

// 현재 네트워크 ID (NETWORK 환경변수, 기본: local)
const NETWORK_ID = process.env.NETWORK || DEFAULT_NETWORK;

// Firestore 초기화 우선순위:
// 1. 에뮬레이터 (FIRESTORE_EMULATOR_HOST)
// 2. serviceAccountKey.json 파일
// 3. Application Default Credentials (클라우드 환경 IAM)
if (process.env.FIRESTORE_EMULATOR_HOST) {
  // 에뮬레이터 모드: Firestore는 에뮬레이터 사용, FCM은 서비스 계정 키가 있으면 실제 인증 사용
  if (fs.existsSync(serviceAccountPath)) {
    const serviceAccount = require(serviceAccountPath);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log(`[Firebase] Firestore 에뮬레이터 + FCM 인증 (project: ${serviceAccount.project_id})`);
  } else {
    admin.initializeApp({ projectId: 'tokamon-go' });
    console.log(`[Firebase] Firestore 에뮬레이터 (FCM 사용 불가 - serviceAccountKey 없음)`);
  }
  db = admin.firestore();
  console.log(`[Firebase] Firestore 에뮬레이터 연결: ${process.env.FIRESTORE_EMULATOR_HOST}`);
} else if (fs.existsSync(serviceAccountPath)) {
  admin.initializeApp({
    credential: admin.credential.cert(require(serviceAccountPath)),
  });
  db = admin.firestore();
  console.log('[Firebase] Admin SDK 초기화 완료 (serviceAccountKey)');
} else if (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID) {
  admin.initializeApp({
    projectId: process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT,
  });
  db = admin.firestore();
  console.log('[Firebase] Admin SDK 초기화 완료 (Application Default Credentials)');
} else {
  console.warn(
    `[Firebase] serviceAccountKey.json을 찾을 수 없습니다. (${serviceAccountPath})`
  );
  console.warn('[Firebase] 에뮬레이터 사용: FIRESTORE_EMULATOR_HOST=localhost:8080 설정하세요.');
  console.warn('[Firebase] 운영 환경: GOOGLE_APPLICATION_CREDENTIALS 또는 FIREBASE_PROJECT_ID를 설정하세요.');
}

console.log(`[Firebase] 네트워크: ${NETWORK_ID} (Firestore 경로: networks/${NETWORK_ID}/...)`);

// 네트워크별 컬렉션 경로 헬퍼
function col(collection) {
  return collectionPath(NETWORK_ID, collection);
}

async function syncSpotToFirestore(spotId, meta) {
  if (!db) {
    console.log('[Firestore] DB 미연결 - 시뮬레이션:', spotId, meta.name);
    return;
  }
  await db.collection(col('spot_metadata')).doc(String(spotId)).set(meta, {
    merge: true,
  });
  console.log('[Firestore] spot_metadata 업데이트:', spotId, meta.name);
}

async function getTelegramUsernameByHash(hash) {
  if (!db) return null;
  try {
    const doc = await db.collection(col('telegram_hash_map')).doc(hash).get();
    return doc.exists ? doc.data().username : null;
  } catch (e) {
    console.error('[Firestore] telegram_hash_map 조회 실패:', e.message);
    return null;
  }
}

async function saveTelegramHashMap(hash, username) {
  if (!db) return;
  try {
    await db.collection(col('telegram_hash_map')).doc(hash).set({
      username,
      updated_at: new Date().toISOString(),
    }, { merge: true });
  } catch (e) {
    console.error('[Firestore] telegram_hash_map 저장 실패:', e.message);
  }
}

async function saveWalletTelegramLink(walletAddress, telegramHash) {
  if (!db) return;
  try {
    await db.collection(col('telegram_wallet_links')).doc(walletAddress.toLowerCase()).set({
      telegram_hash: telegramHash,
      updated_at: new Date().toISOString(),
    }, { merge: true });
    console.log('[Firestore] telegram_wallet_links 저장:', walletAddress.slice(0, 10) + '...');
  } catch (e) {
    console.error('[Firestore] telegram_wallet_links 저장 실패:', e.message);
  }
}

async function sendPushNotification(fcmToken, title, body, data = {}) {
  if (!admin.apps.length) {
    console.warn('[FCM] Firebase Admin 미초기화 - 푸시 전송 불가');
    return false;
  }
  try {
    const message = {
      token: fcmToken,
      data: Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, String(v)])
      ),
      android: {
        priority: 'high',
        notification: {
          title,
          body,
          channelId: 'tokamon-verify',
        },
      },
      apns: {
        payload: {
          aps: {
            alert: { title, body },
            sound: 'default',
            'content-available': 1,
          },
        },
      },
    };
    const result = await admin.messaging().send(message);
    console.log('[FCM] 푸시 전송 성공');
    return true;
  } catch (e) {
    console.error('[FCM] 푸시 전송 실패:', e.message);
    return false;
  }
}

async function saveTelegramClaimEvent(event) {
  if (!db) return;
  try {
    await db.collection(col('claim_events')).add({
      spot_id: event.spotId,
      telegram_hash: event.telegramHash,
      reward: event.reward,
      bonus: event.bonus,
      stamp: event.stamp,
      created_at: new Date(Number(event.timestamp) * 1000).toISOString(),
    });
  } catch (e) {
    console.error('[Firestore] telegram claim_events 저장 실패:', e.message);
  }
}

// 컨트랙트에서 조회한 실제 잔액을 Firestore에 동기화
async function syncTelegramBalance(telegramHash, balance) {
  if (!db) return;
  try {
    await db.collection(col('telegram_balances')).doc(telegramHash).set({
      balance,
      updated_at: new Date().toISOString(),
    }, { merge: true });
  } catch (e) {
    console.error('[Firestore] telegram_balances 동기화 실패:', e.message);
  }
}

async function saveDeviceClaimEvent(event) {
  if (!db) return;
  try {
    await db.collection(col('device_claim_events')).add({
      spot_id: event.spotId,
      device_hash: event.deviceHash,
      reward: event.reward,
      bonus: event.bonus,
      stamp: event.stamp,
      created_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error('[Firestore] device_claim_events 저장 실패:', e.message);
  }
}

// 컨트랙트에서 조회한 실제 잔액을 Firestore에 동기화
async function syncDeviceBalance(deviceHash, balance) {
  if (!db) return;
  try {
    await db.collection(col('device_balances')).doc(deviceHash).set({
      balance,
      updated_at: new Date().toISOString(),
    }, { merge: true });
  } catch (e) {
    console.error('[Firestore] device_balances 동기화 실패:', e.message);
  }
}

module.exports = {
  db,
  NETWORK_ID,
  col,
  syncSpotToFirestore,
  saveTelegramClaimEvent,
  syncTelegramBalance,
  getTelegramUsernameByHash,
  saveTelegramHashMap,
  saveWalletTelegramLink,
  sendPushNotification,
  saveDeviceClaimEvent,
  syncDeviceBalance,
};
