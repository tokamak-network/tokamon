import React, { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, Easing, Image,
} from 'react-native';
import { t } from '../translations';

const tokamonChar = require('../assets/tokamon-char.png');

// 떠다니는 토카몬 캐릭터 컴포넌트
function FloatingCharacter() {
  const floatY = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const rotate = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // 위아래 떠다니기
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatY, {
          toValue: -12,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(floatY, {
          toValue: 0,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    ).start();

    // 살짝 크기 변화 (숨쉬기 효과)
    Animated.loop(
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.05,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    ).start();

    // 좌우로 살짝 흔들기
    Animated.loop(
      Animated.sequence([
        Animated.timing(rotate, {
          toValue: 1,
          duration: 3000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(rotate, {
          toValue: -1,
          duration: 3000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, [floatY, scale, rotate]);

  const rotateInterpolate = rotate.interpolate({
    inputRange: [-1, 1],
    outputRange: ['-5deg', '5deg'],
  });

  return (
    <Animated.View
      style={[
        styles.characterContainer,
        {
          transform: [
            { translateY: floatY },
            { scale },
            { rotate: rotateInterpolate },
          ],
        },
      ]}
    >
      {/* 그림자 */}
      <View style={styles.characterShadow} />
      {/* 토카몬 캐릭터 이미지 */}
      <Image source={tokamonChar} style={styles.characterImage} resizeMode="contain" />
      {/* 반짝이 이펙트 */}
      <Text style={styles.sparkle1}>✨</Text>
      <Text style={styles.sparkle2}>⭐</Text>
    </Animated.View>
  );
}

// 색상 사이클 + 글로우 효과만 (움직임 없음)
function AnimatedTitle() {
  const colorAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const titleScale = useRef(new Animated.Value(0.3)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // 등장 애니메이션 (처음 한 번만)
    Animated.parallel([
      Animated.spring(titleScale, {
        toValue: 1,
        tension: 40,
        friction: 5,
        useNativeDriver: false,
      }),
      Animated.timing(titleOpacity, {
        toValue: 1,
        duration: 600,
        useNativeDriver: false,
      }),
    ]).start();

    // 색상 그라데이션 사이클 (보라 → 핑크 → 골드 → 보라)
    Animated.loop(
      Animated.timing(colorAnim, {
        toValue: 3,
        duration: 3000,
        easing: Easing.linear,
        useNativeDriver: false,
      }),
    ).start();

    // 글로우 반짝이
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
        Animated.timing(glowAnim, {
          toValue: 0,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
      ]),
    ).start();
  }, [colorAnim, glowAnim, titleScale, titleOpacity]);

  const titleColor = colorAnim.interpolate({
    inputRange: [0, 1, 2, 3],
    outputRange: ['#a78bfa', '#ec4899', '#fbbf24', '#a78bfa'],
  });

  const glowOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.15, 0.7],
  });

  const glowColor = colorAnim.interpolate({
    inputRange: [0, 1, 2, 3],
    outputRange: ['rgba(167,139,250,0.5)', 'rgba(236,72,153,0.5)', 'rgba(251,191,36,0.5)', 'rgba(167,139,250,0.5)'],
  });

  const shadowColor = colorAnim.interpolate({
    inputRange: [0, 1, 2, 3],
    outputRange: ['#a78bfa', '#ec4899', '#fbbf24', '#a78bfa'],
  });

  return (
    <Animated.View
      style={{
        transform: [{ scale: titleScale }],
        opacity: titleOpacity,
      }}
    >
      <View style={styles.titleWrapper}>
        <Animated.View style={[styles.titleGlowBg, { opacity: glowOpacity, backgroundColor: glowColor }]} />
        <Animated.Text style={[styles.title, { color: titleColor }]}>
          Tokamon
        </Animated.Text>
        <Animated.Text style={[styles.titleShadow, { color: shadowColor }]}>
          Tokamon
        </Animated.Text>
      </View>
    </Animated.View>
  );
}

export default function RoleSelectScreen({ onSelect, language }) {
  const btnAnim1 = useRef(new Animated.Value(50)).current;
  const btnAnim2 = useRef(new Animated.Value(50)).current;
  const btnAnim3 = useRef(new Animated.Value(50)).current;
  const btnOpacity1 = useRef(new Animated.Value(0)).current;
  const btnOpacity2 = useRef(new Animated.Value(0)).current;
  const btnOpacity3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // 버튼 순차 등장 애니메이션
    const animations = [
      { y: btnAnim1, o: btnOpacity1, delay: 400 },
      { y: btnAnim2, o: btnOpacity2, delay: 550 },
      { y: btnAnim3, o: btnOpacity3, delay: 700 },
    ];

    animations.forEach(({ y, o, delay }) => {
      setTimeout(() => {
        Animated.parallel([
          Animated.spring(y, {
            toValue: 0,
            tension: 50,
            friction: 8,
            useNativeDriver: true,
          }),
          Animated.timing(o, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
        ]).start();
      }, delay);
    });
  }, [btnAnim1, btnAnim2, btnAnim3, btnOpacity1, btnOpacity2, btnOpacity3]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <FloatingCharacter />
        <AnimatedTitle />
        <Text style={styles.subtitle}>{t(language, 'roleSelectSubtitle')}</Text>
      </View>

      <View style={styles.buttons}>
        <Animated.View style={{ transform: [{ translateY: btnAnim1 }], opacity: btnOpacity1 }}>
          <TouchableOpacity
            style={[styles.roleBtn, styles.customerBtn]}
            onPress={() => onSelect('customer')}
            activeOpacity={0.7}
          >
            <Text style={styles.roleIcon}>🚶</Text>
            <View style={styles.roleBtnContent}>
              <Text style={styles.roleLabel}>{t(language, 'customer')}</Text>
              <Text style={styles.roleDesc}>{t(language, 'customerDesc')}</Text>
            </View>
            <Text style={styles.arrow}>→</Text>
          </TouchableOpacity>
        </Animated.View>

        <Animated.View style={{ transform: [{ translateY: btnAnim2 }], opacity: btnOpacity2 }}>
          <TouchableOpacity
            style={[styles.roleBtn, styles.storeBtn]}
            onPress={() => onSelect('store')}
            activeOpacity={0.7}
          >
            <Text style={styles.roleIcon}>📱</Text>
            <View style={styles.roleBtnContent}>
              <Text style={styles.roleLabel}>{t(language, 'storeKiosk')}</Text>
              <Text style={styles.roleDesc}>{t(language, 'storeKioskDesc')}</Text>
            </View>
            <Text style={styles.arrow}>→</Text>
          </TouchableOpacity>
        </Animated.View>

        <Animated.View style={{ transform: [{ translateY: btnAnim3 }], opacity: btnOpacity3 }}>
          <TouchableOpacity
            style={[styles.roleBtn, styles.ownerBtn]}
            onPress={() => onSelect('owner')}
            activeOpacity={0.7}
          >
            <Text style={styles.roleIcon}>🏪</Text>
            <View style={styles.roleBtnContent}>
              <Text style={styles.roleLabel}>{t(language, 'owner')}</Text>
              <Text style={styles.roleDesc}>{t(language, 'ownerDesc')}</Text>
            </View>
            <Text style={styles.arrow}>→</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  // 캐릭터
  characterContainer: {
    alignItems: 'center',
    marginBottom: 8,
  },
  characterImage: {
    width: 140,
    height: 160,
  },
  characterShadow: {
    position: 'absolute',
    bottom: -10,
    width: 80,
    height: 16,
    backgroundColor: 'rgba(59,130,246,0.15)',
    borderRadius: 25,
  },
  sparkle1: {
    position: 'absolute',
    top: 0,
    right: -10,
    fontSize: 16,
  },
  sparkle2: {
    position: 'absolute',
    top: 20,
    left: -8,
    fontSize: 12,
  },
  // 타이틀
  titleWrapper: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 40,
    fontWeight: '800',
    letterSpacing: 2,
    zIndex: 2,
  },
  titleShadow: {
    position: 'absolute',
    fontSize: 40,
    fontWeight: '800',
    letterSpacing: 2,
    opacity: 0.15,
    top: 2,
    zIndex: 1,
  },
  titleGlowBg: {
    position: 'absolute',
    width: 200,
    height: 40,
    borderRadius: 20,
    zIndex: 0,
  },
  subtitle: {
    color: '#aaa',
    fontSize: 16,
    marginTop: 8,
  },
  // 버튼
  buttons: {
    gap: 16,
  },
  roleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
  },
  customerBtn: {
    backgroundColor: 'rgba(59,130,246,0.1)',
    borderColor: 'rgba(59,130,246,0.3)',
  },
  storeBtn: {
    backgroundColor: 'rgba(168,85,247,0.1)',
    borderColor: 'rgba(168,85,247,0.3)',
  },
  ownerBtn: {
    backgroundColor: 'rgba(34,197,94,0.1)',
    borderColor: 'rgba(34,197,94,0.3)',
  },
  roleIcon: {
    fontSize: 32,
    marginRight: 16,
  },
  roleBtnContent: {
    flex: 1,
  },
  roleLabel: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  roleDesc: {
    color: '#888',
    fontSize: 13,
    marginTop: 2,
  },
  arrow: {
    color: '#666',
    fontSize: 20,
  },
});
