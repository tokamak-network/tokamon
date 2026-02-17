import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
} from 'react-native';
import { getAllNetworks, getSelectedNetwork, setSelectedNetwork } from '../utils/networkStore';

export default function NetworkSelector({ currentNetworkId, onNetworkChange }) {
  const [showMenu, setShowMenu] = useState(false);
  const networks = getAllNetworks();
  const current = networks.find((n) => n.id === currentNetworkId) || networks[0];

  const handleSelect = async (networkId) => {
    setShowMenu(false);
    if (networkId === currentNetworkId) return;
    await setSelectedNetwork(networkId);
    onNetworkChange?.(networkId);
  };

  return (
    <View style={styles.wrapper}>
      <TouchableOpacity
        style={styles.badge}
        onPress={() => setShowMenu(true)}
        activeOpacity={0.7}
      >
        <View style={styles.dot} />
        <Text style={styles.badgeText} numberOfLines={1}>{current.name}</Text>
        <Text style={styles.arrow}>▼</Text>
      </TouchableOpacity>

      <Modal
        visible={showMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMenu(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setShowMenu(false)}>
          <View style={styles.menu}>
            <Text style={styles.menuTitle}>Multiverse</Text>
            {networks.map((net) => {
              const isActive = net.id === currentNetworkId;
              return (
                <TouchableOpacity
                  key={net.id}
                  style={[styles.menuItem, isActive && styles.menuItemActive]}
                  onPress={() => handleSelect(net.id)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.menuDot, isActive ? styles.menuDotActive : styles.menuDotInactive]} />
                  <View style={styles.menuItemInfo}>
                    <Text style={[styles.menuItemName, isActive && styles.menuItemNameActive]}>
                      {net.name}
                    </Text>
                    <Text style={styles.menuItemChain}>Chain {net.chainId}</Text>
                  </View>
                  {isActive && <Text style={styles.check}>✓</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {},
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(17,17,34,0.9)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(79,195,247,0.3)',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#4FC3F7',
  },
  badgeText: {
    color: '#4FC3F7',
    fontSize: 12,
    fontWeight: '700',
    maxWidth: 120,
  },
  arrow: {
    color: '#4FC3F7',
    fontSize: 8,
    marginLeft: 2,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menu: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 16,
    minWidth: 260,
    maxWidth: 320,
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.15)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 20,
  },
  menuTitle: {
    color: '#888',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
    textAlign: 'center',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginBottom: 4,
  },
  menuItemActive: {
    backgroundColor: 'rgba(16,185,129,0.1)',
  },
  menuDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  menuDotActive: {
    backgroundColor: '#10b981',
  },
  menuDotInactive: {
    backgroundColor: '#555',
  },
  menuItemInfo: {
    flex: 1,
  },
  menuItemName: {
    color: '#ccc',
    fontSize: 15,
    fontWeight: '600',
  },
  menuItemNameActive: {
    color: '#10b981',
    fontWeight: '700',
  },
  menuItemChain: {
    color: '#666',
    fontSize: 11,
    marginTop: 2,
  },
  check: {
    color: '#10b981',
    fontSize: 16,
    fontWeight: '800',
  },
});
