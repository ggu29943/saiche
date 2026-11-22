import { TrackViewer } from './render/trackViewer';
import { Track } from './track/track';
import { DriveScene } from './game/driveScene';
import { CARS, TRACKS } from './data';
import type { DebugApi } from './debug/debugApi';
import { Title } from './ui/screens/title';
import type { Screen } from './ui/screens/screen';

export class App {
  private drive?: DriveScene;
  private viewer?: TrackViewer;
  private screens = new Map<string, Screen>([['title', new Title()]]);
  private current?: Screen;
  private intervals: number[] = [];
  private previous = performance.now();
  private fps = 0;
  constructor(readonly game: HTMLElement, private ui: HTMLElement) {
    const params = new URLSearchParams(location.search);
    const track = params.get('track') === 'coast' ? TRACKS.coast : TRACKS.valley;
    if (params.get('view') === 'drive') {
      const id = params.get('car');
      const cfg = id === 'coupe' || id === 'rally' ? CARS[id] : CARS.hatch;
      const quality = params.get('q');
      this.drive = new DriveScene(game, new Track(track), cfg,
        quality === 'low' || quality === 'high' || quality === 'medium' ? quality : undefined);
    } else if (params.get('view') === 'track') {
      this.viewer = new TrackViewer(game, new Track(track));
    } else this.go('title');
    const pending = () => { throw new Error('not implemented'); };
    const debug: DebugApi = {
      state: () => ({
        screen: this.current?.id ?? (this.drive ? 'drive' : 'track'),
        trackId: this.drive?.track.data.id ?? this.viewer?.track.data.id ?? null,
        carId: this.drive?.vehicle.cfg.id ?? null,
        speedKmh: this.drive?.vehicle.speedKmh() ?? 0,
        rpm: this.drive?.vehicle.rpm ?? 0, gear: this.drive?.vehicle.gear ?? 0,
        pos: this.drive ? [...this.drive.vehicle.pos] : [0,0,0], lap: 0, lapTimeMs: 0, lastLapMs: null, bestLapMs: null,
        lapInvalid: false, progressS: this.drive?.progressS ?? 0, fps: this.fps, quality: this.drive?.display.quality ?? 'medium',
      }),
      startRace: pending, setInputOverride: input => { if (this.drive) this.drive.override = input; }, skipCountdown: pending,
    };
    window.__apex = debug;
    this.previous = performance.now();
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
    this.drive?.draw(Math.min(dt / 1000, 0.1));
    this.viewer?.draw();
    if (dt > 0) {
      this.intervals.push(dt);
      if (this.intervals.length > 60) this.intervals.shift();
      this.fps = 1000 * this.intervals.length / this.intervals.reduce((a,b) => a+b,0);
    }
    requestAnimationFrame(this.frame);
  };
}
