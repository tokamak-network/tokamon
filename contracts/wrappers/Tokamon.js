const { beginCell, toNano, Address, Cell } = require('@ton/core');

// Op codes
const OP_CREATE_SPOT = 1;
const OP_CLAIM = 2;
const OP_REFUND = 3;

// Response ops
const OP_SPOT_CREATED = 0xf1;
const OP_REWARD_SENT = 0xf2;
const OP_REFUNDED = 0xf3;

function createInitData(adminPubkey) {
  return beginCell()
    .storeBuffer(adminPubkey, 32) // 256-bit public key
    .storeUint(0, 32)            // next_spot_id
    .storeDict(null)             // spots
    .storeDict(null)             // claims
    .endCell();
}

function createSpotMessage(reward, queryId = 0n) {
  return beginCell()
    .storeUint(OP_CREATE_SPOT, 32)
    .storeUint(queryId, 64)
    .storeCoins(reward)
    .endCell();
}

function claimMessage(signature, spotId, claimId, validUntil, queryId = 0n) {
  return beginCell()
    .storeUint(OP_CLAIM, 32)
    .storeUint(queryId, 64)
    .storeBuffer(signature, 64) // 512-bit signature
    .storeUint(spotId, 32)
    .storeBuffer(claimId, 32)
    .storeUint(validUntil, 32)
    .endCell();
}

function refundMessage(spotId, queryId = 0n) {
  return beginCell()
    .storeUint(OP_REFUND, 32)
    .storeUint(queryId, 64)
    .storeUint(spotId, 32)
    .endCell();
}

// 서명할 데이터 셀 생성 (서버에서도 동일하게 구성)
function buildClaimDataCell(spotId, collectorAddress, claimId, validUntil) {
  return beginCell()
    .storeUint(spotId, 32)
    .storeAddress(collectorAddress)
    .storeBuffer(claimId, 32)
    .storeUint(validUntil, 32)
    .endCell();
}

module.exports = {
  OP_CREATE_SPOT, OP_CLAIM, OP_REFUND,
  OP_SPOT_CREATED, OP_REWARD_SENT, OP_REFUNDED,
  createInitData,
  createSpotMessage,
  claimMessage,
  refundMessage,
  buildClaimDataCell,
};
