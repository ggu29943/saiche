export type DeviceKind = 'keyboard' | 'gamepad' | 'touch';
export interface RawIntent {
  device: DeviceKind;
  steer: number;        // [-1,1] 目标值（键盘为 -1/0/1，手柄、触屏为连续值）
  throttle: number;     // [0,1]
  brake: number;        // [0,1]
  handbrake: number;    // 0 或 1
}
export type ActionEvent = 'shiftUp' | 'shiftDown' | 'camera' | 'reset' | 'pause' | 'ghost';
