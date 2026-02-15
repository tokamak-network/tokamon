import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { t } from '../utils/translations';

export default function StampProgress({ stamps, goal, bonus, language = 'ko' }) {
  const percent = goal > 0 ? Math.min((stamps / goal) * 100, 100) : 0;
  const isComplete = stamps >= goal;

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <View style={styles.labelLeft}>
          <Text style={styles.stampIcon}>{isComplete ? '🎉' : '⭐'}</Text>
          <Text style={[styles.label, isComplete && styles.labelComplete]}>
            {t(language, 'stampGoalAchievement')} {stamps}/{goal}
          </Text>
        </View>
        {bonus > 0 && (
          <View style={styles.bonusBadge}>
            <Text style={styles.bonusText}>+{bonus} TON</Text>
          </View>
        )}
      </View>
      <View style={styles.barBg}>
        <View style={[styles.barFill, { width: `${percent}%` }, isComplete && styles.barComplete]} />
        {/* Stamp dots */}
        {goal <= 10 && Array.from({ length: goal }, (_, i) => (
          <View
            key={i}
            style={[
              styles.stampDot,
              { left: `${((i + 1) / goal) * 100}%` },
              i < stamps && styles.stampDotFilled,
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 10,
    padding: 12,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  labelLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stampIcon: {
    fontSize: 14,
  },
  label: {
    color: '#ccc',
    fontSize: 13,
    fontWeight: '500',
  },
  labelComplete: {
    color: '#10b981',
    fontWeight: '700',
  },
  bonusBadge: {
    backgroundColor: 'rgba(251,191,36,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.3)',
  },
  bonusText: {
    color: '#fbbf24',
    fontSize: 12,
    fontWeight: '700',
  },
  barBg: {
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 4,
    overflow: 'hidden',
    position: 'relative',
  },
  barFill: {
    height: '100%',
    backgroundColor: '#4FC3F7',
    borderRadius: 4,
  },
  barComplete: {
    backgroundColor: '#10b981',
  },
  stampDot: {
    position: 'absolute',
    top: 1,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginLeft: -3,
  },
  stampDotFilled: {
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
});
