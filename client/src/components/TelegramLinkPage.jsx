import React, { useState, useEffect } from 'react';
import { getSelectedNetwork } from '../networkStore';

const API = '';

function withNetwork(url) {
  const networkId = getSelectedNetwork();
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}network=${networkId}`;
}

export default function TelegramLinkPage() {
    const [loading, setLoading] = useState(true);
    const [tokenValid, setTokenValid] = useState(false);
    const [telegramUsername, setTelegramUsername] = useState('');
    const [walletAddress, setWalletAddress] = useState('');
    const [message, setMessage] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);
    
    // URL에서 토큰 가져오기
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    
    // 토큰 검증
    useEffect(() => {
        if (!token) {
            setMessage('유효하지 않은 링크입니다');
            setLoading(false);
            return;
        }
        
        fetch(withNetwork(`${API}/api/telegram/verify-token`), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token }),
        })
            .then(res => res.json())
            .then(data => {
                if (data.valid) {
                    setTokenValid(true);
                    setTelegramUsername(data.telegram_username);
                } else {
                    setMessage(data.error || '유효하지 않은 토큰입니다');
                }
            })
            .catch(() => {
                setMessage('서버 연결 실패');
            })
            .finally(() => {
                setLoading(false);
            });
    }, [token]);
    
    // 지갑 주소 입력 처리
    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!walletAddress.trim()) {
            setMessage('지갑 주소를 입력해주세요');
            return;
        }
        
        if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
            setMessage('올바른 이더리움 주소가 아닙니다');
            return;
        }
        
        setSubmitting(true);
        setMessage('');
        
        try {
            const res = await fetch(withNetwork(`${API}/api/telegram/link-wallet`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    token,
                    wallet_address: walletAddress,
                }),
            });
            
            const data = await res.json();
            
            if (res.ok) {
                setSuccess(true);
                setMessage(`지갑 연결 완료! ${data.transferred_amount.toFixed(2)} TON이 지갑으로 이전되었습니다.`);
            } else {
                setMessage(data.error || '지갑 연결 실패');
            }
        } catch (err) {
            setMessage('서버 연결 실패');
        } finally {
            setSubmitting(false);
        }
    };
    
    if (loading) {
        return (
            <div className="telegram-link-page">
                <div className="loading">로딩 중...</div>
            </div>
        );
    }
    
    if (!tokenValid) {
        return (
            <div className="telegram-link-page">
                <div className="error-box">
                    <h2>링크 오류</h2>
                    <p>{message}</p>
                    <p>텔레그램 봇(@tokamon_bot)에서 /link를 다시 시도해주세요.</p>
                </div>
            </div>
        );
    }
    
    if (success) {
        return (
            <div className="telegram-link-page">
                <div className="success-box">
                    <h2>연결 완료!</h2>
                    <p>{message}</p>
                    <p>텔레그램으로 돌아가서 확인해주세요.</p>
                    <button onClick={() => window.location.href = '/'}>
                        Tokamon 홈으로
                    </button>
                </div>
            </div>
        );
    }
    
    return (
        <div className="telegram-link-page">
            <div className="link-form">
                <h2>지갑 연결</h2>
                <p>텔레그램 @{telegramUsername}와 연결할 지갑 주소를 입력하세요</p>
                
                <form onSubmit={handleSubmit}>
                    <label>지갑 주소</label>
                    <input
                        type="text"
                        placeholder="0x1234567890abcdef..."
                        value={walletAddress}
                        onChange={(e) => setWalletAddress(e.target.value)}
                        disabled={submitting}
                    />
                    
                    {message && (
                        <div className={`message ${message.includes('실패') || message.includes('에러') ? 'error' : 'info'}`}>
                            {message}
                        </div>
                    )}
                    
                    <button type="submit" className="primary" disabled={submitting}>
                        {submitting ? '처리 중...' : '지갑 연결'}
                    </button>
                </form>
                
                <div className="info-box">
                    <h3>안내</h3>
                    <ul>
                        <li>MetaMask 등에서 지갑 주소를 복사하여 붙여넣으세요</li>
                        <li>연결하면 텔레그램 잔액이 자동으로 지갑으로 이전됩니다</li>
                        <li>이후 지갑으로 Tokamon 웹을 이용할 수 있습니다</li>
                    </ul>
                </div>
            </div>
        </div>
    );
}
