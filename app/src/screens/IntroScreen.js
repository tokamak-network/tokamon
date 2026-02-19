import React, { useEffect, useRef } from 'react';
import { View, Text, Image, StyleSheet, Animated, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, LinearGradient as SvgGradient, Stop, Text as SvgText } from 'react-native-svg';

const { width, height } = Dimensions.get('window');

export default function IntroScreen({ onFinish, onReady }) {
  const bgOpacity = useRef(new Animated.Value(0)).current;
  const bgScale = useRef(new Animated.Value(1.1)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const titleTranslateY = useRef(new Animated.Value(30)).current;
  const subtitleOpacity = useRef(new Animated.Value(0)).current;
  const subtitleTranslateY = useRef(new Animated.Value(20)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const fadeOut = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // 네이티브 스플래시 숨기기 (IntroScreen 준비 완료)
    if (onReady) onReady();

    // Background image fade-in with slow zoom
    Animated.parallel([
      Animated.timing(bgOpacity, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.timing(bgScale, { toValue: 1, duration: 3000, useNativeDriver: true }),
    ]).start();

    // Logo + text sequence
    Animated.sequence([
      Animated.delay(400),
      // Bottom overlay
      Animated.timing(overlayOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      // Title
      Animated.parallel([
        Animated.timing(titleOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.spring(titleTranslateY, { toValue: 0, tension: 50, friction: 8, useNativeDriver: true }),
      ]),
      // Subtitle
      Animated.parallel([
        Animated.timing(subtitleOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.spring(subtitleTranslateY, { toValue: 0, tension: 50, friction: 8, useNativeDriver: true }),
      ]),
      // Tagline
      Animated.timing(taglineOpacity, { toValue: 0.6, duration: 300, useNativeDriver: true }),
      // Hold, then fade out
      Animated.delay(1200),
      Animated.timing(fadeOut, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start(() => {
      onFinish();
    });
  }, []);

  return (
    <Animated.View style={[styles.container, { opacity: fadeOut }]}>
      {/* Dark base */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: '#0a0a1a' }]} />

      {/* Full-screen background image with zoom effect */}
      <Animated.Image
        source={require('../../assets/splash-bg.png')}
        style={[
          styles.bgImage,
          {
            opacity: bgOpacity,
            transform: [{ scale: bgScale }],
          },
        ]}
        resizeMode="cover"
      />

      {/* Top gradient overlay for title readability */}
      <Animated.View style={[styles.topOverlay, { opacity: overlayOpacity }]}>
        <LinearGradient
          colors={['rgba(10,10,26,0.92)', 'rgba(10,10,26,0.6)', 'transparent']}
          locations={[0, 0.6, 1]}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      {/* Bottom gradient overlay for text readability */}
      <Animated.View style={[styles.bottomOverlay, { opacity: overlayOpacity }]}>
        <LinearGradient
          colors={['transparent', 'rgba(10,10,26,0.6)', 'rgba(10,10,26,0.92)']}
          locations={[0, 0.4, 1]}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      {/* All text at top */}
      <View style={styles.textContainer}>
        <Animated.View
          style={{
            opacity: titleOpacity,
            transform: [{ translateY: titleTranslateY }],
          }}
        >
          <Svg height="52" width="250">
            <Defs>
              <SvgGradient id="titleGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <Stop offset="0%" stopColor="#a78bfa" />
                <Stop offset="50%" stopColor="#ec4899" />
                <Stop offset="100%" stopColor="#fbbf24" />
              </SvgGradient>
            </Defs>
            <SvgText
              fill="url(#titleGrad)"
              fontSize="42"
              fontWeight="800"
              letterSpacing={3}
              x="125"
              y="42"
              textAnchor="middle"
            >
              Tokamon
            </SvgText>
          </Svg>
        </Animated.View>

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

      </View>

      {/* Tagline at bottom */}
      <Animated.Text style={[styles.tagline, { opacity: taglineOpacity }]}>
        Powered by Tokamak Network
      </Animated.Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  bgImage: {
    ...StyleSheet.absoluteFillObject,
    width: width,
    height: height,
  },
  topOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: height * 0.2,
  },
  textContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: height * 0.1,
    alignItems: 'center',
  },
  subtitle: {
    color: '#4FC3F7',
    fontSize: 16,
    marginTop: 10,
    fontWeight: '600',
    letterSpacing: 1,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  tagline: {
    position: 'absolute',
    bottom: height * 0.12,
    alignSelf: 'center',
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 10,
  },
});
