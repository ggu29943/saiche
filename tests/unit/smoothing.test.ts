import { expect, test } from 'vitest';
import { PHYSICS_DT } from '@/config/constants';
import { InputSmoothing } from '@/input/smoothing';
import type { RawIntent } from '@/input/types';

const idle: RawIntent = { device: 'keyboard', steer: 0, throttle: 0, brake: 0, handbrake: 0 };

test('keyboard steering reaches full lock and returns to center at the specified rates', () => {
  const smoothing = new InputSmoothing();
  const timeToSteer = (target: number) => {
    const intent = { ...idle, steer: target };
    for (let steps = 1; steps <= 240; steps++) {
      if (smoothing.step(intent, PHYSICS_DT).steer === target) return steps * PHYSICS_DT;
    }
    throw new Error('Steering did not reach the target');
  };

  expect(Math.abs(timeToSteer(1) - 0.4545)).toBeLessThanOrEqual(PHYSICS_DT);
  expect(Math.abs(timeToSteer(0) - 0.2)).toBeLessThanOrEqual(PHYSICS_DT);
});

test('touch pedals use their ramp rates, with immediate handbrake and gamepad values', () => {
  const smoothing = new InputSmoothing();
  const touch: RawIntent = { device: 'touch', steer: 0, throttle: 1, brake: 1, handbrake: 1 };
  const pressed = smoothing.step(touch, 0.1);
  expect(pressed).toEqual({ ...touch, throttle: 0.4, brake: 0.5 });
  const released = smoothing.step({ ...idle, device: 'touch' }, 0.025);
  expect(released.throttle).toBeCloseTo(0.25);
  expect(released.brake).toBeCloseTo(0.3);
  expect(released.handbrake).toBe(0);

  const gamepad: RawIntent = { device: 'gamepad', steer: -0.75, throttle: 0.8, brake: 0.2, handbrake: 1 };
  expect(smoothing.step(gamepad, PHYSICS_DT)).toEqual(gamepad);
});
