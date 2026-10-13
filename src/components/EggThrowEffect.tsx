import React, {useLayoutEffect, useMemo, useRef, useState} from 'react';
import {Animated, Easing, StyleSheet, Text, useWindowDimensions, View} from 'react-native';
import Svg, {Defs, G, LinearGradient, Path, Stop} from 'react-native-svg';
import {impactMedium} from '../utils/haptics';
import {
  clamp,
  createEggDrips,
  createEggFlight,
  createEggFragments,
  EGG_IMPACT_LIFETIME,
  eggDripProgress,
  eggFlightPosition,
  eggFragmentPosition,
  eggFragmentVelocity,
  EggPoint,
  EggFlight,
} from '../utils/eggThrowPhysics';

const EGG_SIZE = 42;
const SPLAT_WIDTH = 156;
const SPLAT_HEIGHT = 116;
const WHITE_PATH = 'M50 42 C39 35 20 13 16 19 C12 25 38 40 32 49 C24 54 4 50 3 56 C2 63 32 60 37 70 C40 81 20 92 27 96 C34 99 45 77 57 85 C63 92 58 113 64 114 C73 115 65 88 81 91 C96 89 106 115 113 109 C119 103 99 86 112 79 C124 73 151 91 155 83 C159 75 130 70 124 62 C131 54 155 47 151 40 C146 35 125 52 116 44 C107 34 130 15 123 11 C115 7 104 37 93 32 C84 28 89 7 81 6 C73 5 79 32 68 35 C58 38 46 14 41 20 C36 26 58 39 50 42Z';
const YOLK_PATH = 'M58 48 C48 38 43 45 48 53 C36 59 45 67 57 66 C53 77 62 84 72 74 C79 87 92 85 94 72 C107 81 117 71 103 64 C121 55 107 44 98 50 C99 37 82 35 77 46 C68 37 56 37 58 48Z';
const SHELL_SHAPES = [
  'M2 13 Q1 3 12 2 L18 7 13 9 14 14 8 12 5 17Z',
  'M2 4 Q13 0 18 10 L14 17 11 12 6 14 7 9Z',
  'M3 2 Q19 3 17 16 L12 13 8 17 7 11 2 9Z',
  'M1 9 Q6 0 17 4 L15 9 18 13 12 12 7 17 6 11Z',
];

// 飞行已在原生线程开始后，再准备撞击节点，避免它们阻塞起飞首帧。
const IMPACT_PREPARE_DELAY_MS = 64;

// 将解析轨迹采样给原生插值节点。中途不回到 JS 切换动画，撞击与飞溅共用同一时钟。
const sampleMotion = <K extends string>(
  start: number,
  duration: number,
  sample: (t: number) => Record<K, number>,
) => {
  const count = Math.ceil(duration * 60);
  const offsets = Array.from({length: count + 1}, (_, index) => duration * index / count);
  const inputRange = offsets.map(t => start + t);
  const samples = offsets.map(sample);
  if (start > 0) {
    inputRange.unshift(0);
    samples.unshift(samples[0]);
  }
  const values = {} as Record<K, number[]>;
  (Object.keys(samples[0]) as K[]).forEach(key => {
    values[key] = samples.map(item => item[key]);
  });
  return {inputRange, values};
};

const EggImpact: React.FC<{flight: EggFlight; timeline: Animated.Value}> = ({flight, timeline}) => {
  const fragments = useMemo(() => createEggFragments(flight), [flight]);
  // 每次抛掷都会重新挂载撞击层，随机流痕与蛋渍旋转/镜像，避免每个鸡蛋都一模一样。
  const [drips] = useState(() => createEggDrips());
  const [splatVariant] = useState(() => ({
    rotate: `${(Math.random() - 0.5) * 50}deg`,
    mirror: Math.random() < 0.5 ? -1 : 1,
  }));
  const motion = useMemo(() => {
    const impact = flight.duration;
    const interpolate = (inputRange: number[], outputRange: number[]) =>
      timeline.interpolate({inputRange, outputRange, extrapolate: 'clamp'});
    const splatOpacity = interpolate(
      [0, impact, impact + 0.012, impact + EGG_IMPACT_LIFETIME - 0.45, impact + EGG_IMPACT_LIFETIME],
      [0, 0, 1, 1, 0],
    );
    return {
      splatOpacity,
      // 液体正面拍开：快速铺开、略微过冲后回弹，形状随即固定在屏幕上。
      splatScale: interpolate(
        [0, impact, impact + 0.035, impact + 0.09, impact + 0.16, impact + 0.26],
        [0, 0, 0.9, 1.1, 0.96, 1],
      ),
      drips: drips.map(drip => {
        const path = sampleMotion(impact, EGG_IMPACT_LIFETIME, t => ({p: eggDripProgress(t, drip)}));
        return {
          stretch: interpolate(path.inputRange, path.values.p),
          head: interpolate(path.inputRange, path.values.p.map(p => p * drip.length)),
        };
      }),
      fragments: fragments.map(fragment => {
        const shell = fragment.kind === 'shell';
        let previousAngle: number | undefined;
        const path = sampleMotion(impact, fragment.lifetime, t => {
          const point = eggFragmentPosition(fragment, t);
          const velocity = eggFragmentVelocity(fragment, t);
          // 朝向跟随真实速度，并展开角度避免跨越 ±180° 时绕远路旋转。
          let angle = Math.atan2(velocity.y, velocity.x) * 180 / Math.PI;
          if (previousAngle !== undefined) {
            while (angle - previousAngle > 180) angle -= 360;
            while (angle - previousAngle < -180) angle += 360;
          }
          previousAngle = angle;
          const speed = Math.hypot(velocity.x, velocity.y);
          return {x: point.x, y: point.y, angle, stretch: 1 + clamp(speed / 320, 0, 1.8)};
        });
        return {
          x: interpolate(path.inputRange, path.values.x),
          y: interpolate(path.inputRange, path.values.y),
          opacity: interpolate(
            [0, impact, impact + 0.008, impact + fragment.lifetime * 0.65, impact + fragment.lifetime],
            [0, 0, shell ? 1 : fragment.kind === 'yolk' ? 0.96 : 0.85, shell ? 1 : 0.75, 0],
          ),
          rotation: shell
            ? timeline.interpolate({
              inputRange: [impact, impact + fragment.lifetime],
              outputRange: [`${fragment.angle}deg`, `${fragment.angle + fragment.spin * fragment.lifetime}deg`],
              extrapolate: 'clamp',
            })
            : timeline.interpolate({
              inputRange: path.inputRange,
              outputRange: path.values.angle.map(angle => `${angle}deg`),
              extrapolate: 'clamp',
            }),
          flip: timeline.interpolate({
            inputRange: [impact, impact + fragment.lifetime],
            outputRange: ['0deg', `${fragment.spin * 0.7}deg`],
            extrapolate: 'clamp',
          }),
          stretch: interpolate(path.inputRange, path.values.stretch),
        };
      }),
    };
  }, [drips, flight, fragments, timeline]);

  return (
    <>
      <Animated.View style={[styles.splat, {
        left: flight.target.x - SPLAT_WIDTH / 2,
        top: flight.target.y - SPLAT_HEIGHT / 2,
        opacity: motion.splatOpacity,
        transform: [{rotate: splatVariant.rotate}, {scaleX: splatVariant.mirror}, {scale: motion.splatScale}],
      }]}>
        <Svg width={SPLAT_WIDTH} height={SPLAT_HEIGHT} viewBox="0 0 160 120">
          <Defs>
            <LinearGradient id="eggWhite" x1="0%" y1="0%" x2="80%" y2="100%">
              <Stop offset="0" stopColor="#FFFEED" stopOpacity="0.9" />
              <Stop offset="1" stopColor="#F2E5B4" stopOpacity="0.55" />
            </LinearGradient>
            <LinearGradient id="eggYolk" x1="20%" y1="0%" x2="70%" y2="100%">
              <Stop offset="0" stopColor="#FFDC57" />
              <Stop offset="0.65" stopColor="#FFB41F" />
              <Stop offset="1" stopColor="#DF8510" />
            </LinearGradient>
          </Defs>
          {/* 偏移的淡阴影给蛋液厚度，也让蛋清在浅色背景上可见。 */}
          <G x={1.2} y={2.4} opacity={0.16}>
            <Path d={WHITE_PATH} fill="#6B5520" />
            <Path d={YOLK_PATH} fill="#6B3A00" />
          </G>
          <Path d={WHITE_PATH} fill="url(#eggWhite)" stroke="#D9C68E" strokeOpacity="0.6" strokeWidth="0.8" />
          <Path d={YOLK_PATH} fill="url(#eggYolk)" />
          <Path d="M56 52 Q66 43 76 50 M85 48 Q94 45 97 54" fill="none" stroke="#FFF0AC" strokeWidth="3" strokeLinecap="round" opacity="0.65" />
          <Path d="M40 57 Q26 53 18 56 M108 67 Q125 72 137 78" fill="none" stroke="#FFFFFF" strokeWidth="1.5" opacity="0.45" />
        </Svg>
      </Animated.View>

      {/* 流痕不随蛋渍旋转，始终沿重力方向向下。 */}
      {drips.map((drip, index) => {
        const animation = motion.drips[index];
        const headSize = drip.width * 1.4;
        return (
          <Animated.View key={`drip-${index}`} style={[styles.drip, {
            left: flight.target.x + drip.x - headSize / 2,
            top: flight.target.y + drip.y,
            width: headSize,
            height: drip.length + headSize,
            opacity: motion.splatOpacity,
          }]}>
            <Animated.View style={[styles.dripStem, {
              width: drip.width,
              height: drip.length,
              borderRadius: drip.width / 2,
              transform: [{scaleY: animation.stretch}],
            }]} />
            <Animated.View style={[styles.dripHead, {
              width: headSize,
              height: headSize,
              borderRadius: headSize / 2,
              top: -headSize / 2,
              transform: [{translateY: animation.head}],
            }]} />
          </Animated.View>
        );
      })}

      {fragments.map((fragment, index) => {
        const animation = motion.fragments[index];
        const shell = fragment.kind === 'shell';
        return (
          <Animated.View key={index} style={[styles.fragment, {
            left: flight.target.x - fragment.size / 2,
            top: flight.target.y - fragment.size / 2,
            width: fragment.size,
            height: fragment.size,
            opacity: animation.opacity,
            transform: [{translateX: animation.x}, {translateY: animation.y}],
          }]}>
            <Animated.View style={[styles.fragmentBody, {
              transform: shell
                ? [{perspective: 300}, {rotate: animation.rotation}, {rotateX: animation.flip}]
                : [{rotate: animation.rotation}, {scaleX: animation.stretch}],
            }]}>
              {shell ? (
                <Svg width="100%" height="100%" viewBox="0 0 20 20">
                  <Path d={SHELL_SHAPES[index % SHELL_SHAPES.length]} fill="#FFF9E9" stroke="#C5B698" strokeWidth="0.7" />
                  <Path d="M5 6 Q10 3 14 7" fill="none" stroke="#FFFFFF" strokeWidth="1.3" />
                </Svg>
              ) : (
                <View style={[styles.drop, fragment.kind === 'yolk' ? styles.yolkDrop : styles.whiteDrop]} />
              )}
            </Animated.View>
          </Animated.View>
        );
      })}
    </>
  );
};

const EggThrowEffect: React.FC<{origin: EggPoint}> = ({origin}) => {
  const {width, height} = useWindowDimensions();
  const timeline = useRef(new Animated.Value(0)).current;
  const [impactReady, setImpactReady] = useState(false);
  const [finished, setFinished] = useState(false);
  // 透明 Modal 覆盖当前窗口，直接使用按钮窗口坐标，无需再等待动画层测量。
  const flight = useMemo(() => createEggFlight(origin, width, height), [origin, width, height]);
  const motion = useMemo(() => {
    const impact = flight.duration;
    const curve = sampleMotion(0, impact, t => eggFlightPosition(flight, t));
    const interpolate = (inputRange: number[], outputRange: number[]) =>
      timeline.interpolate({inputRange, outputRange, extrapolate: 'clamp'});
    return {
      x: interpolate(curve.inputRange, curve.values.x),
      y: interpolate(curve.inputRange, curve.values.y),
      opacity: interpolate([0, impact, impact + 0.025], [1, 1, 0]),
      rotation: timeline.interpolate({
        inputRange: [0, impact],
        outputRange: ['-25deg', `${-25 - impact * 430}deg`],
        extrapolate: 'clamp',
      }),
      scaleX: interpolate([0, impact, impact + 0.022], [1, 0.92, 1.25]),
      scaleY: interpolate([0, impact, impact + 0.022], [1, 0.92, 0.5]),
    };
  }, [flight, timeline]);

  useLayoutEffect(() => {
    setFinished(false);
    setImpactReady(false);
    timeline.setValue(0);
    const duration = flight.duration + EGG_IMPACT_LIFETIME;
    const animation = Animated.timing(timeline, {
      toValue: duration,
      duration: duration * 1000,
      easing: Easing.linear,
      useNativeDriver: true,
      isInteraction: false,
    });
    animation.start(result => {
      if (result.finished) setFinished(true);
    });
    const prepareTimer = setTimeout(() => setImpactReady(true), IMPACT_PREPARE_DELAY_MS);
    const impactTimer = setTimeout(impactMedium, flight.duration * 1000);
    return () => {
      clearTimeout(prepareTimer);
      clearTimeout(impactTimer);
      animation.stop();
    };
  }, [flight, timeline]);

  return (
    <View pointerEvents="none" style={styles.overlay}>
      {!finished && (
        <>
          <Animated.View style={[styles.eggPosition, {
            opacity: motion.opacity,
            transform: [{translateX: motion.x}, {translateY: motion.y}],
          }]}>
            <Animated.View style={{transform: [
              {scaleX: motion.scaleX}, {scaleY: motion.scaleY}, {rotate: motion.rotation},
            ]}}>
              <Text allowFontScaling={false} style={styles.egg}>🥚</Text>
            </Animated.View>
          </Animated.View>
          {impactReady && <EggImpact flight={flight} timeline={timeline} />}
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {...StyleSheet.absoluteFillObject, zIndex: 10000, elevation: 10000},
  eggPosition: {position: 'absolute', left: -EGG_SIZE / 2, top: -EGG_SIZE / 2},
  egg: {width: EGG_SIZE, height: EGG_SIZE, fontSize: 36, lineHeight: EGG_SIZE, textAlign: 'center', includeFontPadding: false},
  splat: {position: 'absolute', width: SPLAT_WIDTH, height: SPLAT_HEIGHT},
  drip: {position: 'absolute', alignItems: 'center'},
  dripStem: {transformOrigin: 'top', backgroundColor: 'rgba(255, 248, 214, 0.85)', borderWidth: 0.5, borderColor: 'rgba(170, 140, 70, 0.3)'},
  dripHead: {position: 'absolute', backgroundColor: 'rgba(255, 246, 205, 0.92)', borderWidth: 0.5, borderColor: 'rgba(170, 140, 70, 0.35)'},
  fragment: {position: 'absolute'},
  fragmentBody: {width: '100%', height: '100%', justifyContent: 'center'},
  drop: {width: '100%', height: '68%', borderRadius: 20, borderWidth: 0.5},
  yolkDrop: {backgroundColor: '#FFBC27', borderColor: '#FFE485'},
  whiteDrop: {backgroundColor: '#FFF9D8', borderColor: 'rgba(170, 140, 70, 0.4)'},
});

export default EggThrowEffect;
