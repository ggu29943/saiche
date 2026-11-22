export interface DebugApi {
  state(): {
    screen: string;                 // 当前界面 id，见 07 §7.1
    trackId: string | null; carId: string | null;
    speedKmh: number; rpm: number; gear: number;
    pos: [number, number, number];
    lap: number; lapTimeMs: number; lastLapMs: number | null; bestLapMs: number | null;
    lapInvalid: boolean; progressS: number;
    fps: number; quality: 'low' | 'medium' | 'high';
  };
  startRace(trackId: 'valley' | 'coast', carId: 'hatch' | 'coupe' | 'rally'): Promise<void>; // 跳过菜单直接进入倒计时
  setInputOverride(inp: { steer: number; throttle: number; brake: number; handbrake: number } | null): void; // 非 null 时替代真实输入
  skipCountdown(): void;
}
declare global { interface Window { __apex: DebugApi; } }
