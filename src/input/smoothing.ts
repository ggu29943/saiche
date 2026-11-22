import { PHYSICS_DT } from '@/config/constants';
import { clamp } from '@/math/scalar';
import type { RawIntent } from './types';

function moveToward(current: number, target: number, maxChange: number): number {
  return current + clamp(target - current, -maxChange, maxChange);
}

export class InputSmoothing {
  private steer = 0;
  private throttle = 0;
  private brake = 0;

  step(intent: RawIntent, dt = PHYSICS_DT): RawIntent {
    if (intent.device === 'gamepad') {
      // 规格未指定：切回键盘或触屏时，从最后输出的手柄位置开始平滑。
      this.steer = intent.steer;
      this.throttle = intent.throttle;
      this.brake = intent.brake;
      return intent;
    }

    // 从中位起转和继续同向打舵都使用较慢速率。
    const turningFurther = this.steer * intent.steer >= 0 && Math.abs(intent.steer) > Math.abs(this.steer);
    const steerRate = turningFurther ? 2.2 : 5;
    const throttleRate = intent.throttle > this.throttle ? 4 : 6;
    const brakeRate = intent.brake > this.brake ? 5 : 8;

    this.steer = moveToward(this.steer, intent.steer, steerRate * dt);
    this.throttle = moveToward(this.throttle, intent.throttle, throttleRate * dt);
    this.brake = moveToward(this.brake, intent.brake, brakeRate * dt);
    return { ...intent, steer: this.steer, throttle: this.throttle, brake: this.brake };
  }
}
