// TON 블록체인 연동 서비스
import {Address, TonClient, WalletContractV4, internal} from 'ton';
import {mnemonicToPrivateKey} from 'ton-crypto';

class TonService {
  constructor() {
    this.client = null;
    this.wallet = null;
    this.address = null;
  }

  // TON 클라이언트 초기화
  async initialize(network = 'testnet') {
    try {
      const endpoint = network === 'mainnet' 
        ? 'https://toncenter.com/api/v2/jsonRPC'
        : 'https://testnet.toncenter.com/api/v2/jsonRPC';
      
      this.client = new TonClient({endpoint});
      return true;
    } catch (error) {
      console.error('TON 클라이언트 초기화 실패:', error);
      return false;
    }
  }

  // 지갑 연결
  async connectWallet(mnemonic) {
    try {
      const keyPair = await mnemonicToPrivateKey(mnemonic.split(' '));
      this.wallet = WalletContractV4.create({
        workchain: 0,
        publicKey: keyPair.publicKey,
      });
      this.address = this.wallet.address.toString();
      return this.address;
    } catch (error) {
      console.error('지갑 연결 실패:', error);
      return null;
    }
  }

  // 잔액 조회
  async getBalance(address) {
    try {
      if (!this.client) await this.initialize();
      const balance = await this.client.getBalance(Address.parse(address));
      return balance / 1000000000; // nanoTON to TON
    } catch (error) {
      console.error('잔액 조회 실패:', error);
      return 0;
    }
  }

  // TON 전송
  async sendTransaction(toAddress, amount, message = '') {
    try {
      if (!this.wallet) {
        throw new Error('지갑이 연결되지 않았습니다');
      }

      const seqno = await this.wallet.getSeqno(this.client);
      const transfer = this.wallet.createTransfer({
        seqno,
        secretKey: this.wallet.secretKey,
        messages: [
          internal({
            to: toAddress,
            value: amount * 1000000000, // TON to nanoTON
            body: message,
          }),
        ],
      });

      await this.client.sendExternalMessage(this.wallet, transfer);
      return true;
    } catch (error) {
      console.error('전송 실패:', error);
      return false;
    }
  }

  // 주소 유효성 검증
  isValidAddress(address) {
    try {
      Address.parse(address);
      return true;
    } catch {
      return false;
    }
  }

  // 연결된 지갑 주소 가져오기
  getConnectedAddress() {
    return this.address;
  }
}

export default new TonService();
