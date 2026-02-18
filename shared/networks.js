/**
 * 멀티체인 네트워크 레지스트리
 *
 * 모든 네트워크 설정의 단일 진실 소스 (Single Source of Truth).
 * listener-server, functions, client, app 모두 이 파일을 참조합니다.
 *
 * 새 네트워크 추가 시 이 파일만 수정하면 됩니다.
 */

const networks = {
  local: {
    chainId: 1337,
    name: 'Local (Anvil)',
    rpcUrl: 'http://127.0.0.1:8999',
    nativeCurrency: { name: 'TON', symbol: 'TON', decimals: 18 },
    dev: true,
  },
  'thanos-sepolia': {
    chainId: 111551119090,
    name: 'Thanos Sepolia',
    rpcUrl: 'https://rpc.thanos-sepolia.tokamak.network',
    nativeCurrency: { name: 'TON', symbol: 'TON', decimals: 18 },
  },
};

// 네트워크별 컨트랙트 주소. 배포 후 여기에 추가합니다.
// null = 아직 배포되지 않음
const contracts = {
  local: {
    tokamon: null,
    faucet: null,
  },
  'thanos-sepolia': {
    tokamon: "0xA7cDf6657cE30A2316126d8F9952b9A6f17db9b7",
    faucet: "0x049CD8ACdEFD7E72971112048FBF22A0aeFf0547",
  },
};

const DEFAULT_NETWORK = 'thanos-sepolia';

function getNetwork(networkId) {
  const net = networks[networkId];
  if (!net) throw new Error(`Unknown network: ${networkId}. Available: ${Object.keys(networks).join(', ')}`);
  return net;
}

function getContracts(networkId) {
  const c = contracts[networkId];
  if (!c) throw new Error(`No contracts config for network: ${networkId}`);
  return c;
}

function getNetworkByChainId(chainId) {
  for (const [id, net] of Object.entries(networks)) {
    if (net.chainId === chainId) return { id, ...net };
  }
  return null;
}

// Firestore 컬렉션 경로 헬퍼
// 예: collectionPath('local', 'spot_metadata') → 'networks/local/spot_metadata'
function collectionPath(networkId, collection) {
  if (!networks[networkId]) throw new Error(`Unknown network: ${networkId}`);
  return `networks/${networkId}/${collection}`;
}

// 사용 가능한 네트워크 목록 (ID + 메타데이터)
function listNetworks() {
  return Object.entries(networks).map(([id, net]) => ({
    id,
    ...net,
    contracts: contracts[id] || {},
  }));
}

module.exports = {
  networks,
  contracts,
  DEFAULT_NETWORK,
  getNetwork,
  getContracts,
  getNetworkByChainId,
  collectionPath,
  listNetworks,
};
