import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { t } from '../utils/translations';

export default function StampProgress({ stamps, goal, bonus, language = 'ko' }) {
  const percent = goal > 0 ? Math.min((stamps / goal) * 100, 100) : 0;

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>
          {t(language, 'stampGoalAchievement')} {stamps}/{goal}
        </Text>
        {bonus > 0 && (
          <Text style={styles.bonusLabel}>+{bonus} TON</Text>
        )}
      </View>
      <View style={styles.barBg}>
        <View style={[styles.barFill, { width: `${percent}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  label: {
    color: '#ccc',
    fontSize: 13,
  },
  bonusLabel: {
    color: '#fbbf24',
    fontSize: 12,
    fontWeight: '600',
  },
  barBg: {
    height: 8,
    backgroundColor: '#333',
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    backgroundColor: '#10b981',
    borderRadius: 4,
  },
});
