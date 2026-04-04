#!/bin/bash
# COS iptables: 80, 443, 8080 포트 허용 (재부팅 시 자동 적용)
iptables -C INPUT -p tcp --dport 80 -j ACCEPT 2>/dev/null || iptables -I INPUT 4 -p tcp --dport 80 -j ACCEPT
iptables -C INPUT -p tcp --dport 443 -j ACCEPT 2>/dev/null || iptables -I INPUT 4 -p tcp --dport 443 -j ACCEPT
iptables -C INPUT -p tcp --dport 8080 -j ACCEPT 2>/dev/null || iptables -I INPUT 4 -p tcp --dport 8080 -j ACCEPT
echo "[startup-script] iptables rules applied"
