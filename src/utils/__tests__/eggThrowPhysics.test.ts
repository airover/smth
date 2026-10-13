import {
  createEggDrips,
  createEggFlight,
  createEggFragments,
  EGG_GRAVITY,
  eggDripProgress,
  eggFlightPosition,
  eggFragmentPosition,
  eggFragmentVelocity,
} from '../eggThrowPhysics';

describe('egg throw physics', () => {
  it.each([
    [320, 568, 220, 90],
    [393, 852, 280, 420],
    [430, 932, 310, 810],
    [852, 393, 700, 85],
    [1024, 1366, 900, 1100],
  ])('lands in the visible horizontal center (%d × %d, button %d,%d)', (width, height, x, y) => {
    const flight = createEggFlight({x, y}, width, height);
    const end = eggFlightPosition(flight, flight.duration);
    expect(eggFlightPosition(flight, 0)).toEqual({x, y});
    expect(end.x).toBeCloseTo(width / 2, 8);
    expect(end.y).toBeCloseTo(flight.target.y, 8);
    expect(flight.impactVelocity.y).toBeGreaterThan(0);
    for (let step = 0; step <= 100; step++) {
      const point = eggFlightPosition(flight, flight.duration * step / 100);
      expect(point.y).toBeGreaterThanOrEqual(31.99);
      expect(point.y).toBeLessThan(height);
    }
  });

  it('keeps constant gravity through the apex and accelerates into impact', () => {
    const flight = createEggFlight({x: 280, y: 600}, 393, 852);
    const apexTime = -flight.vy / EGG_GRAVITY;
    const dt = 0.001;
    for (const t of [apexTime - 0.05, apexTime, apexTime + 0.05]) {
      const before = eggFlightPosition(flight, t - dt);
      const current = eggFlightPosition(flight, t);
      const after = eggFlightPosition(flight, t + dt);
      expect((after.y - 2 * current.y + before.y) / (dt * dt)).toBeCloseTo(EGG_GRAVITY, 3);
      expect((after.x - before.x) / (2 * dt)).toBeCloseTo(flight.vx, 6);
    }
    const last = eggFlightPosition(flight, flight.duration);
    const recent = eggFlightPosition(flight, flight.duration - 0.05);
    const earlier = eggFlightPosition(flight, flight.duration - 0.1);
    expect(last.y - recent.y).toBeGreaterThan(recent.y - earlier.y);
  });

  it('launches fragments at their initial velocity and continuously loses horizontal speed to drag', () => {
    const flight = createEggFlight({x: 280, y: 600}, 393, 852);
    const fragments = createEggFragments(flight, () => 0.5);
    for (const fragment of fragments) {
      const origin = eggFragmentPosition(fragment, 0);
      expect(origin.x).toBeCloseTo(0, 10);
      expect(origin.y).toBeCloseTo(0, 10);
      const start = eggFragmentPosition(fragment, 0.000001);
      expect(start.x / 0.000001).toBeCloseTo(fragment.vx, 2);
      expect(start.y / 0.000001).toBeCloseTo(fragment.vy, 2);
      const a = eggFragmentPosition(fragment, 0.05);
      const b = eggFragmentPosition(fragment, 0.1);
      const c = eggFragmentPosition(fragment, 0.15);
      expect(Math.abs(c.x - b.x)).toBeLessThan(Math.abs(b.x - a.x));
      const end = eggFragmentPosition(fragment, fragment.lifetime);
      expect(Number.isFinite(end.x) && Number.isFinite(end.y)).toBe(true);
      if (fragment.kind === 'shell') {
        const previous = eggFragmentPosition(fragment, fragment.lifetime - 0.05);
        expect(end.y).toBeGreaterThan(previous.y);
      }
    }
  });

  it('reports fragment velocity as the derivative of its position', () => {
    const flight = createEggFlight({x: 280, y: 600}, 393, 852);
    const dt = 0.0001;
    for (const fragment of createEggFragments(flight, () => 0.3)) {
      for (const t of [0, 0.1, 0.4]) {
        const before = eggFragmentPosition(fragment, t);
        const after = eggFragmentPosition(fragment, t + dt);
        const velocity = eggFragmentVelocity(fragment, t + dt / 2);
        expect((after.x - before.x) / dt).toBeCloseTo(velocity.x, 1);
        expect((after.y - before.y) / dt).toBeCloseTo(velocity.y, 1);
      }
    }
  });

  it('drips start slowly, only move forward and stop at full length', () => {
    for (const drip of createEggDrips(() => 0.5)) {
      expect(eggDripProgress(drip.delay, drip)).toBe(0);
      expect(eggDripProgress(drip.delay + drip.duration, drip)).toBeCloseTo(1, 10);
      expect(eggDripProgress(drip.delay + drip.duration + 1, drip)).toBeCloseTo(1, 10);
      let previous = 0;
      for (let step = 1; step <= 20; step++) {
        const current = eggDripProgress(drip.delay + drip.duration * step / 20, drip);
        expect(current).toBeGreaterThanOrEqual(previous);
        previous = current;
      }
      const early = eggDripProgress(drip.delay + drip.duration * 0.1, drip);
      const late = eggDripProgress(drip.delay + drip.duration * 0.6, drip)
        - eggDripProgress(drip.delay + drip.duration * 0.5, drip);
      expect(early).toBeLessThan(late);
    }
  });
});
