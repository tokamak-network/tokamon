import { beginCell } from '@ton/core';

const CONTRACT_ADDRESS = 'EQ...'; // 배포 후 설정

// 스팟 생성 TX (컨트랙트에 TON 예치)
export function buildCreateSpotTx(reward, depositAmount) {
  const body = beginCell()
    .storeUint(1, 32)      // op: create_spot
    .storeUint(0, 64)      // query_id
    .storeCoins(reward)
    .endCell();

  return {
    validUntil: Math.floor(Date.now() / 1000) + 600,
    messages: [{
      address: CONTRACT_ADDRESS,
      amount: String(depositAmount),
      payload: body.toBoc().toString('base64'),
    }],
  };
}

// 클레임 TX (서버에서 받은 서명으로 컨트랙트에서 직접 클레임)
export function buildClaimTx(signatureHex, spotId, claimIdHex, validUntil) {
  const signature = Buffer.from(signatureHex, 'hex');
  const claimId = Buffer.from(claimIdHex, 'hex');

  const body = beginCell()
    .storeUint(2, 32)      // op: claim
    .storeUint(0, 64)      // query_id
    .storeBuffer(signature, 64)
    .storeUint(spotId, 32)
    .storeBuffer(claimId, 32)
    .storeUint(validUntil, 32)
    .endCell();

  return {
    validUntil: Math.floor(Date.now() / 1000) + 600,
    messages: [{
      address: CONTRACT_ADDRESS,
      amount: '50000000', // 0.05 TON for gas
      payload: body.toBoc().toString('base64'),
    }],
  };
}

// 환불 TX
export function buildRefundTx(spotId) {
  const body = beginCell()
    .storeUint(3, 32)      // op: refund
    .storeUint(0, 64)      // query_id
    .storeUint(spotId, 32)
    .endCell();

  return {
    validUntil: Math.floor(Date.now() / 1000) + 600,
    messages: [{
      address: CONTRACT_ADDRESS,
      amount: '50000000',
      payload: body.toBoc().toString('base64'),
    }],
  };
}
