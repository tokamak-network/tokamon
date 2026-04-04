#!/bin/bash
# COS iptables: 80, 443 포트 허용 (재부팅 시 자동 적용)
# 8080은 nginx 리버스 프록시를 통해서만 접근 (TLS 우회 방지)
iptables -C INPUT -p tcp --dport 80 -j ACCEPT 2>/dev/null || iptables -A INPUT -p tcp --dport 80 -j ACCEPT
iptables -C INPUT -p tcp --dport 443 -j ACCEPT 2>/dev/null || iptables -A INPUT -p tcp --dport 443 -j ACCEPT
echo "[startup-script] iptables rules applied"
