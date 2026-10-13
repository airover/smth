import React from 'react';
import {Animated, Text} from 'react-native';
import {act, create, ReactTestRenderer} from 'react-test-renderer';
import EggThrowEffect from '../EggThrowEffect';
import * as physics from '../../utils/eggThrowPhysics';
import {impactMedium} from '../../utils/haptics';

jest.mock('react-native-svg', () => ({
  __esModule: true,
  default: 'Svg',
  Defs: 'Defs',
  LinearGradient: 'LinearGradient',
  Path: 'Path',
  Stop: 'Stop',
}));
jest.mock('../../utils/haptics', () => ({impactMedium: jest.fn()}));

describe('EggThrowEffect startup', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('starts flight on the first commit, before preparing fragments, and keeps the same clock', () => {
    const animation = {start: jest.fn(), stop: jest.fn(), reset: jest.fn()};
    const timing = jest.spyOn(Animated, 'timing').mockReturnValue(animation);
    const prepareFragments = jest.spyOn(physics, 'createEggFragments');

    act(() => {
      renderer = create(<EggThrowEffect origin={{x: 280, y: 600}} />);
    });

    // 未等待任何布局事件或计时器，第一轮提交就启动飞行。
    expect(animation.start).toHaveBeenCalledTimes(1);
    expect(timing.mock.calls[0][1].useNativeDriver).toBe(true);
    expect(timing.mock.calls[0][1].delay || 0).toBe(0);
    expect(prepareFragments).not.toHaveBeenCalled();
    expect(renderer!.root.findByType(Text).props.children).toBe('🥚');

    act(() => jest.advanceTimersByTime(64));
    expect(prepareFragments).toHaveBeenCalledTimes(1);
    // 添加撞击节点不能将飞行进度重置为零。
    expect(animation.start).toHaveBeenCalledTimes(1);
    expect(timing).toHaveBeenCalledTimes(1);
  });

  it('cancels preparation and impact feedback when closed during takeoff', () => {
    const animation = {start: jest.fn(), stop: jest.fn(), reset: jest.fn()};
    jest.spyOn(Animated, 'timing').mockReturnValue(animation);
    const prepareFragments = jest.spyOn(physics, 'createEggFragments');

    act(() => {
      renderer = create(<EggThrowEffect origin={{x: 280, y: 600}} />);
    });
    act(() => renderer?.unmount());
    renderer = undefined;
    act(() => jest.advanceTimersByTime(3000));

    expect(animation.stop).toHaveBeenCalledTimes(1);
    expect(prepareFragments).not.toHaveBeenCalled();
    expect(impactMedium).not.toHaveBeenCalled();
  });
});
