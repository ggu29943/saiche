import type { V3 } from '@/math/vec3';
import type { Q } from '@/math/quat';
export type Axle = 'front' | 'rear';
export interface DiffConfig { type: 'open' | 'lsd'; preloadNm: number; lockRatio: number; lockGain: number; }
export interface SuspensionAxleConfig {
  restLength: number; maxCompression: number; stiffness: number;
  damperBump: number; damperRebound: number; antiRollStiffness: number;
}
export interface PacejkaCoeffs { B: number; C: number; E: number; }
export interface CarConfig {
  id: 'hatch' | 'coupe' | 'rally';
  name: string; description: string;
  mass: number;
  inertia: { x: number; y: number; z: number };     // 车身局部：x=俯仰, y=偏航, z=侧倾
  cgHeight: number;                                  // 静止时质心离地高度
  wheels: { id: 'FL' | 'FR' | 'RL' | 'RR'; axle: Axle; side: 'left' | 'right'; mount: [number, number, number] }[];
  wheel: { radius: number; width: number; inertia: number };
  suspension: { front: SuspensionAxleConfig; rear: SuspensionAxleConfig; bumpStopStiffness: number };
  steering: { maxAngleDeg: number };
  tire: { lon: PacejkaCoeffs; lat: PacejkaCoeffs; mu: number; loadRef: number; loadSensitivity: number;
          relaxLon: number; relaxLat: number; rollingResistance: number };
  engine: { idleRpm: number; redlineRpm: number; limiterRpm: number; launchRpm: number; inertia: number;
            engineBrakeNmPer1000Rpm: number; torqueCurve: [number, number][] };
  gearbox: { ratios: number[]; reverse: number; final: number; efficiency: number; shiftTime: number;
             autoUpRpm: number; autoDownRpm: number; minShiftInterval: number };
  drivetrain: { type: 'FWD' | 'RWD' | 'AWD'; frontSplit: number; diffFront: DiffConfig; diffRear: DiffConfig; diffCenter: DiffConfig };
  brakes: { maxTorque: number; frontBias: number; handbrakeTorque: number };
  aero: { cdA: number; clAFront: number; clARear: number };
  visual: { model: string; paints: string[] };
}

export interface Assists { abs: boolean; tcs: boolean; esc: boolean; autoGear: boolean; }
export interface DriveInput {
  steer: number;      // [-1, 1]，正值=左。已经经过平滑和转向辅助处理
  throttle: number;   // [0, 1]
  brake: number;      // [0, 1]
  handbrake: number;  // [0, 1]
  shift: -1 | 0 | 1;  // 仅手动挡有效；只在按下的那一个物理步为非零
  assists: Assists;
}
export type SurfaceId = 'asphalt' | 'kerb' | 'grass' | 'gravel';
export interface GroundHit { height: number; normal: V3; surface: SurfaceId; }
export type GroundFn = (x: number, z: number) => GroundHit;

export interface WheelState {
  omega: number; kappa: number; beta: number;
  len: number; lenPrev: number; contact: boolean;
  Fz: number; Fx: number; Fy: number;
  steer: number;      // 实际轮转角（rad）
  rot: number;        // 车轮累计转角 [0, 2π)，用于渲染
  surface: SurfaceId;
  absScale: number;
  // 以下只在 contact=true 时有效
  contactPoint: V3; normal: V3; f: V3; l: V3; r: V3; vx: number; vy: number;
}
export interface VehicleState {
  pos: V3; q: Q; vel: V3; angvel: V3;
  wheels: WheelState[];
  gear: number;        // -1=R, 0=N, 1..n
  rpm: number; shiftTimer: number; sinceShift: number; revTimer: number;
  limiterCut: boolean; tcsScale: number; time: number;
}
