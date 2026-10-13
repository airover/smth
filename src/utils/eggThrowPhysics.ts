export type EggPoint = {x: number; y: number};

export const EGG_GRAVITY = 2000; // React Native 布局点 / 秒²
export const EGG_IMPACT_LIFETIME = 1.8;

export const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export type EggFlight = {
  origin: EggPoint;
  target: EggPoint;
  vx: number;
  vy: number;
  duration: number;
  impactVelocity: EggPoint;
};

export const createEggFlight = (origin: EggPoint, width: number, height: number): EggFlight => {
  const target = {
    x: width / 2,
    y: clamp(origin.y - 220, Math.min(150, height * 0.28), height * 0.44),
  };
  // 由最高点反推初速度和飞行时间，整段使用同一个重力加速度。
  const upperY = Math.min(origin.y, target.y);
  const apexY = upperY - clamp(upperY - 32, 8, 72);
  const riseTime = Math.sqrt(2 * (origin.y - apexY) / EGG_GRAVITY);
  const fallTime = Math.sqrt(2 * (target.y - apexY) / EGG_GRAVITY);
  const duration = riseTime + fallTime;
  const vx = (target.x - origin.x) / duration;
  const vy = -EGG_GRAVITY * riseTime;
  return {
    origin,
    target,
    vx,
    vy,
    duration,
    impactVelocity: {x: vx, y: vy + EGG_GRAVITY * duration},
  };
};

export const eggFlightPosition = (flight: EggFlight, seconds: number): EggPoint => {
  const t = clamp(seconds, 0, flight.duration);
  return {
    x: flight.origin.x + flight.vx * t,
    y: flight.origin.y + flight.vy * t + 0.5 * EGG_GRAVITY * t * t,
  };
};

export type EggFragment = {
  kind: 'yolk' | 'white' | 'shell';
  vx: number;
  vy: number;
  gravity: number;
  drag: number;
  size: number;
  spin: number;
  angle: number;
  lifetime: number;
};

// 线性阻力的解析解：刚炸开时速度最大，之后逐渐减速并受重力向下运动。
// 避免“先飞到一个点、停住、再开始往下掉”的分段动画。
export const eggFragmentPosition = (fragment: EggFragment, seconds: number): EggPoint => {
  const t = Math.max(0, seconds);
  const travel = -Math.expm1(-fragment.drag * t) / fragment.drag;
  const terminalSpeed = fragment.gravity / fragment.drag;
  return {
    x: fragment.vx * travel,
    y: (fragment.vy - terminalSpeed) * travel + terminalSpeed * t,
  };
};

// 速度是位置解析解的导数，用于让蛋液朝向和拉伸始终跟随真实运动方向。
export const eggFragmentVelocity = (fragment: EggFragment, seconds: number): EggPoint => {
  const decay = Math.exp(-fragment.drag * Math.max(0, seconds));
  const terminalSpeed = fragment.gravity / fragment.drag;
  return {
    x: fragment.vx * decay,
    y: (fragment.vy - terminalSpeed) * decay + terminalSpeed,
  };
};

export const createEggFragments = (flight: EggFlight, random = Math.random): EggFragment[] => {
  const energy = clamp(Math.hypot(flight.impactVelocity.x, flight.impactVelocity.y) / 540, 0.8, 1.3);
  return Array.from({length: 36}, (_, index) => {
    const kind = index < 8 ? 'yolk' : index < 28 ? 'white' : 'shell';
    const localIndex = kind === 'yolk' ? index : kind === 'white' ? index - 8 : index - 28;
    const count = kind === 'white' ? 20 : 8;
    const angle = (localIndex + random() * 0.75) * Math.PI * 2 / count;
    const speed = (kind === 'yolk' ? 220 + random() * 170 : 430 + random() * 310) * energy;
    const shell = kind === 'shell';
    return {
      kind,
      vx: Math.cos(angle) * speed * (shell ? 0.55 : 1) + flight.impactVelocity.x * 0.16,
      // 正面撞在屏幕上，蛋液沿屏幕平面各向同性地溅开；碎壳主要向下掉落。
      vy: Math.sin(angle) * speed * (shell ? 0.45 : 1)
        + (shell ? -150 : flight.impactVelocity.y * 0.1),
      // 蛋液受到较大的黏滞阻力；碎壳保留更多惯性，迅速落下。
      gravity: shell ? 1250 : 340,
      drag: shell ? 0.65 + random() * 0.5 : 5 + random() * 2,
      // 前两片是大块蛋壳，其余是细碎渣。
      size: shell ? (localIndex < 2 ? 18 + random() * 6 : 6 + random() * 6) : kind === 'yolk' ? 9 + random() * 8 : 4 + random() * 7,
      spin: (random() - 0.5) * 1100,
      angle: angle * 180 / Math.PI,
      lifetime: shell ? 0.65 + random() * 0.3 : 0.95 + random() * 0.4,
    };
  });
};

export type EggDrip = {
  x: number; // 相对撞击点的水平偏移
  y: number; // 起流位置相对撞击点的垂直偏移
  width: number;
  length: number;
  delay: number;
  duration: number;
};

// 蛋清沿屏幕往下流：起步慢（黏滞），随后越流越快，总长度有限。
export const createEggDrips = (random = Math.random): EggDrip[] => {
  const count = 3 + Math.floor(random() * 2);
  return Array.from({length: count}, (_, index) => ({
    x: ((index + 0.5) / count - 0.5) * 70 + (random() - 0.5) * 14,
    y: 14 + random() * 14,
    width: 5 + random() * 4,
    length: 22 + random() * 36,
    delay: 0.15 + random() * 0.3,
    duration: 0.9 + random() * 0.4,
  }));
};

export const eggDripProgress = (seconds: number, drip: EggDrip): number => {
  const p = clamp((seconds - drip.delay) / drip.duration, 0, 1);
  return p * p * (1.6 - 0.6 * p);
};
