import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal,
} from 'react-native';
import { t } from '../translations';

export default function SettingsScreen({ visible, onClose, language, onLanguageChange }) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.modal} onStartShouldSetResponder={() => true}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>{t(language, 'settings')}</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.closeBtn}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* 언어 설정 */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t(language, 'languageSettings')}</Text>
            <View style={styles.langRow}>
              <TouchableOpacity
                style={[styles.langBtn, language === 'ko' && styles.langActive]}
                onPress={() => onLanguageChange('ko')}
              >
                <Text style={[styles.langText, language === 'ko' && styles.langTextActive]}>
                  한국어
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.langBtn, language === 'en' && styles.langActive]}
                onPress={() => onLanguageChange('en')}
              >
                <Text style={[styles.langText, language === 'en' && styles.langTextActive]}>
                  English
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* 정보 */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t(language, 'information')}</Text>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>{t(language, 'version')}</Text>
              <Text style={styles.infoValue}>1.0.0</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>{t(language, 'network')}</Text>
              <Text style={styles.infoValue}>Tokamak Network</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modal: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    width: '100%',
    maxWidth: 400,
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '700' },
  closeBtn: { color: '#888', fontSize: 20, padding: 4 },
  section: { marginBottom: 24 },
  sectionTitle: { color: '#fff', fontSize: 16, fontWeight: '600', marginBottom: 12 },
  langRow: { flexDirection: 'row', gap: 12 },
  langBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#2a2a2a',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#3a3a3a',
  },
  langActive: {
    backgroundColor: 'rgba(59,130,246,0.2)',
    borderColor: '#3b82f6',
  },
  langText: { color: '#888', fontSize: 15, fontWeight: '600' },
  langTextActive: { color: '#3b82f6' },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  infoLabel: { color: '#888', fontSize: 14 },
  infoValue: { color: '#ddd', fontSize: 14 },
});
