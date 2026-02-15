import React, { useEffect, useRef } from 'react';
import { View, Text, Image, StyleSheet, Animated, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const { width, height } = Dimensions.get('window');

// Floating particle component
function Particle({ delay, startX, startY, size, color, duration }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animate = () => {
      opacity.setValue(0);
      translateY.setValue(0);
      scale.setValue(0.3);

      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.sequence([
            Animated.timing(opacity, { toValue: 0.7, duration: duration * 0.3, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0, duration: duration * 0.7, useNativeDriver: true }),
          ]),
          Animated.timing(translateY, { toValue: -height * 0.4, duration, useNativeDriver: true }),
          Animated.timing(scale, { toValue: 1.2, duration, useNativeDriver: true }),
        ]),
      ]).start(animate);
    };
    animate();
  }, []);

  return (
    <Animated.View
      style={[
        styles.particle,
        {
          left: startX,
          top: startY,
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          opacity,
          transform: [{ translateY }, { scale }],
        },
      ]}
    />
  );
}

const PARTICLES = [
  { delay: 0, startX: width * 0.15, startY: height * 0.7, size: 6, color: '#a78bfa', duration: 3000 },
  { delay: 400, startX: width * 0.75, startY: height * 0.65, size: 4, color: '#ec4899', duration: 3500 },
  { delay: 800, startX: width * 0.4, startY: height * 0.8, size: 8, color: '#fbbf24', duration: 2800 },
  { delay: 200, startX: width * 0.6, startY: height * 0.75, size: 5, color: '#4FC3F7', duration: 3200 },
  { delay: 600, startX: width * 0.25, startY: height * 0.85, size: 3, color: '#10b981', duration: 3600 },
  { delay: 1000, startX: width * 0.85, startY: height * 0.6, size: 5, color: '#a78bfa', duration: 2600 },
  { delay: 300, startX: width * 0.5, startY: height * 0.72, size: 7, color: '#ec4899', duration: 3100 },
  { delay: 700, startX: width * 0.1, startY: height * 0.9, size: 4, color: '#fbbf24', duration: 2900 },
];

export default function IntroScreen({ onFinish }) {
  const logoScale = useRef(new Animated.Value(0.2)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoRotate = useRef(new Animated.Value(-0.05)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const titleTranslateY = useRef(new Animated.Value(20)).current;
  const subtitleOpacity = useRef(new Animated.Value(0)).current;
  const subtitleTranslateY = useRef(new Animated.Value(15)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;
  const fadeOut = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.sequence([
      // Small delay for smooth start
      Animated.delay(200),
      // Glow appears first
      Animated.timing(glowOpacity, {
        toValue: 0.6,
        duration: 500,
        useNativeDriver: true,
      }),
      // Logo springs in with subtle rotation
      Animated.parallel([
        Animated.spring(logoScale, {
          toValue: 1,
          tension: 30,
          friction: 5,
          useNativeDriver: true,
        }),
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.spring(logoRotate, {
          toValue: 0,
          tension: 40,
          friction: 7,
          useNativeDriver: true,
        }),
      ]),
      // Title slides up and fades in
      Animated.parallel([
        Animated.timing(titleOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.spring(titleTranslateY, {
          toValue: 0,
          tension: 50,
          friction: 8,
          useNativeDriver: true,
        }),
      ]),
      // Subtitle slides up
      Animated.parallel([
        Animated.timing(subtitleOpacity, {
          toValue: 1,
          duration: 350,
          useNativeDriver: true,
        }),
        Animated.spring(subtitleTranslateY, {
          toValue: 0,
          tension: 50,
          friction: 8,
          useNativeDriver: true,
        }),
      ]),
      // Tagline fades in
      Animated.timing(taglineOpacity, {
        toValue: 0.5,
        duration: 300,
        useNativeDriver: true,
      }),
      // Hold
      Animated.delay(600),
      // Fade out everything
      Animated.timing(fadeOut, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onFinish();
    });
  }, []);

  const rotate = logoRotate.interpolate({
    inputRange: [-0.05, 0],
    outputRange: ['-3deg', '0deg'],
  });

  return (
    <Animated.View style={[styles.container, { opacity: fadeOut }]}>
      <LinearGradient
        colors={['#0a0a1a', '#0f0f2e', '#1a0a2e', '#0f0f0f']}
        locations={[0, 0.3, 0.7, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* Floating particles */}
      {PARTICLES.map((p, i) => (
        <Particle key={i} {...p} />
      ))}

      {/* Glow behind logo */}
      <Animated.View style={[styles.glowOuter, { opacity: glowOpacity }]}>
        <LinearGradient
          colors={['transparent', 'rgba(167,139,250,0.15)', 'rgba(236,72,153,0.1)', 'transparent']}
          style={styles.glowGradient}
        />
      </Animated.View>

      {/* Logo */}
      <Animated.View
        style={[
          styles.logoContainer,
          {
            opacity: logoOpacity,
            transform: [{ scale: logoScale }, { rotate }],
          },
        ]}
      >
        {/* Logo glow ring */}
        <Animated.View style={[styles.logoGlow, { opacity: glowOpacity }]} />
        <Image
          source={require('../../assets/tokamon-logo.png')}
          style={styles.logo}
          resizeMode="contain"
        />
      </Animated.View>

      {/* Title */}
      <Animated.Text
        style={[
          styles.title,
          {
            opacity: titleOpacity,
            transform: [{ translateY: titleTranslateY }],
          },
        ]}
      >
        Tokamon
      </Animated.Text>

      {/* Subtitle */}
      <Animated.Text
        style={[
          styles.subtitle,
          {
            opacity: subtitleOpacity,
            transform: [{ translateY: subtitleTranslateY }],
          },
        ]}
      >
        Visit stores, earn TON
      </Animated.Text>

      {/* Tagline */}
      <Animated.Text style={[styles.tagline, { opacity: taglineOpacity }]}>
        Powered by Tokamak Network
      </Animated.Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  particle: {
    position: 'absolute',
  },
  glowOuter: {
    position: 'absolute',
    width: width,
    height: width,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowGradient: {
    width: width * 0.8,
    height: width * 0.8,
    borderRadius: width * 0.4,
  },
  logoContainer: {
    width: width * 0.42,
    height: width * 0.42,
    marginBottom: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoGlow: {
    position: 'absolute',
    width: width * 0.5,
    height: width * 0.5,
    borderRadius: width * 0.25,
    backgroundColor: 'rgba(167,139,250,0.12)',
  },
  logo: {
    width: '100%',
    height: '100%',
    backgroundColor: 'transparent',
  },
  title: {
    color: '#fff',
    fontSize: 42,
    fontWeight: '800',
    letterSpacing: 3,
    textShadowColor: 'rgba(167,139,250,0.5)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
  },
  subtitle: {
    color: '#4FC3F7',
    fontSize: 16,
    marginTop: 10,
    fontWeight: '600',
    letterSpacing: 1,
    textShadowColor: 'rgba(79,195,247,0.3)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  tagline: {
    color: '#888',
    fontSize: 12,
    marginTop: 40,
    fontWeight: '400',
    letterSpacing: 0.5,
  },
});
