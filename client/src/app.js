import { hasMetaMask, connectWallet, getConnectedAddress, onAccountChange } from './wallet.js';
import {
  initFaucet,
  requestEth,
} from './faucet.js';
import {
  initTokamon,
  getBalance,
  getSpot,
  getNextSpotId,
  getStampInfo,
  claimSelf,
} from './tokamon.js';

function formatAddress(address) {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function fromWei(wei) {
  return Number(wei || 0n) / 1e18;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function renderApp() {
  const appEl = document.getElementById('app');

  const render = async (address = null) => {
    const resolvedAddress = address ?? await getConnectedAddress();
    let config = {};

    if (resolvedAddress && window.ethereum) {
      try {
        const configRes = await fetch('/contract-address.json');
        config = configRes.ok ? await configRes.json() : {};
        const provider = new (await import('ethers')).BrowserProvider(window.ethereum);

        if (config.faucet) initFaucet(config.faucet, provider);
        if (config.tokamon || config.address) initTokamon(config.tokamon || config.address, provider);
      } catch {
        // 컨트랙트 주소 없음
      }
    }

    let faucetHtml = '';
    let tokamonHtml = '';

    if (resolvedAddress && config.faucet) {
      try {
        faucetHtml = `
          <section class="card">
            <h2>🧪 Faucet</h2>
            <div class="faucet-buttons">
              <button id="faucet-eth" class="btn">TON 받기</button>
            </div>
          </section>
        `;
      } catch {}
    }

    if (resolvedAddress && (config.tokamon || config.address)) {
      try {
        const balance = await getBalance(resolvedAddress);
        const nextId = await getNextSpotId();
        const spots = [];
        for (let i = 0; i < Number(nextId); i++) {
          const s = await getSpot(i);
          if (s && Number(s.reward) > 0) {
            const stampInfo = await getStampInfo(i, resolvedAddress);
            spots.push({
              id: i,
              name: s.name || `Spot ${i}`,
              reward: s.reward,
              remaining: s.remaining,
              stamps: stampInfo.stamps,
              goal: stampInfo.goal,
              cooldownRemaining: stampInfo.cooldownRemaining,
            });
          }
        }
        const spotsList = spots
          .map(
            (s) => `
            <div class="spot-item" data-spot-id="${s.id}">
              <div class="spot-info">
                <strong>${escapeHtml(s.name)}</strong>
                <span>리워드 ${fromWei(s.reward).toFixed(2)} TON · 잔여 ${fromWei(s.remaining).toFixed(2)}</span>
                <span>스탬프 ${s.stamps}/${s.goal}</span>
              </div>
              <button class="btn btn-sm claim-btn" data-spot-id="${s.id}">클레임</button>
            </div>
          `
          )
          .join('');
        tokamonHtml = `
          <section class="card">
            <h2>🎯 Tokamon</h2>
            <p class="balance">내 TON 잔액: <strong>${fromWei(balance).toFixed(2)} TON</strong></p>
            <div class="spots-list">${spotsList || '<p>스팟이 없습니다.</p>'}</div>
          </section>
        `;
      } catch (e) {
        tokamonHtml = `
          <section class="card">
            <h2>🎯 Tokamon</h2>
            <p class="muted">컨트랙트 연결 실패. contract-address.json을 확인하세요.</p>
          </section>
        `;
      }
    }

    appEl.innerHTML = `
      <div class="container">
        <header class="header">
          <h1>🔥 Firebase 웹 서비스</h1>
          <div class="wallet-section">
            ${resolvedAddress ? `
              <p class="wallet-address">${formatAddress(resolvedAddress)}</p>
              <span class="connected-badge">연동됨</span>
            ` : `
              <button id="connect-wallet" class="btn">🦊 MetaMask 연동</button>
            `}
          </div>
        </header>
        <main class="main">
          <section class="card">
            <h2>시작 준비 완료</h2>
            <p>Firebase가 연결되었습니다. MetaMask 지갑과 연동하여 컨트랙트를 호출하세요.</p>
          </section>
          ${faucetHtml}
          ${tokamonHtml}
        </main>
      </div>
    `;

    if (!resolvedAddress) {
      document.getElementById('connect-wallet')?.addEventListener('click', async function () {
        this.disabled = true;
        this.textContent = '연결 중...';
        try {
          await connectWallet();
          render(await getConnectedAddress());
        } catch (err) {
          alert(err.message);
        }
        this.disabled = false;
        this.textContent = '🦊 MetaMask 연동';
      });
    } else {
      const provider = new (await import('ethers')).BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();

      document.getElementById('faucet-eth')?.addEventListener('click', async function () {
        this.disabled = true;
        try {
          await requestEth(signer);
          alert('TON을 받았습니다.');
          render(resolvedAddress);
        } catch (err) {
          alert(err.message || '요청 실패');
        }
        this.disabled = false;
      });

      document.querySelectorAll('.claim-btn').forEach((btn) => {
        btn.addEventListener('click', async function () {
          const spotId = Number(this.dataset.spotId);
          this.disabled = true;
          try {
            await claimSelf(signer, spotId);
            alert('클레임 완료!');
            render(resolvedAddress);
          } catch (err) {
            alert(err.message || '클레임 실패');
          }
          this.disabled = false;
        });
      });
    }
  };

  render();
  onAccountChange((addr) => render(addr));
}
