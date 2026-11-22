import type { DebugApi } from './debug/debugApi';
import { Title } from './ui/screens/title';
import type { Screen } from './ui/screens/screen';

export class App {
  private screens = new Map<string, Screen>([['title', new Title()]]);
  private current?: Screen;
  private intervals: number[] = [];
  private previous = performance.now();
  private fps = 0;
  constructor(readonly game: HTMLElement, private ui: HTMLElement) {
    this.go('title');
    const pending = () => { throw new Error('not implemented'); };
    const debug: DebugApi = {
      state: () => ({
        screen: this.current!.id, trackId: null, carId: null, speedKmh: 0, rpm: 0,
        gear: 0, pos: [0,0,0], lap: 0, lapTimeMs: 0, lastLapMs: null, bestLapMs: null,
        lapInvalid: false, progressS: 0, fps: this.fps, quality: 'medium',
      }),
      startRace: pending, setInputOverride: pending, skipCountdown: pending,
    };
    window.__apex = debug;
    requestAnimationFrame(this.frame);
  }
  go(id: string) {
    const next = this.screens.get(id);
    if (!next) throw new Error('Unknown screen: ' + id);
    this.current?.unmount();
    this.current = next;
    next.mount(this.ui);
  }
  private frame = (now: number) => {
    const dt = now - this.previous;
    this.previous = now;
    if (dt > 0) {
      this.intervals.push(dt);
      if (this.intervals.length > 60) this.intervals.shift();
      this.fps = 1000 * this.intervals.length / this.intervals.reduce((a,b) => a+b,0);
    }
    requestAnimationFrame(this.frame);
  };
}
