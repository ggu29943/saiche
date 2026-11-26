import { RaceRenderer } from './render/renderer';
import { buildTrackScene } from './render/trackScene';
import { TrackViewer } from './render/trackViewer';
import { Track } from './track/track';
import { AssetManager } from './assets/assetManager';
import { CarView } from './render/carView';
import type { CarConfig } from './physics/types';
import type { Quality } from './render/materials';
import { DEFAULT_SETTINGS } from './game/settings';
import { DriveScene } from './game/driveScene';
import { CARS, TRACKS } from './data';
import type { DebugApi } from './debug/debugApi';
import { Title } from './ui/screens/title';
import type { Screen } from './ui/screens/screen';
import { StatsPanel } from './ui/statsPanel';

export class App {
  private drive?: DriveScene;
  private viewer?: TrackViewer;
  private screens = new Map<string, Screen>([['title', new Title()]]);
  private current?: Screen;
  private readonly stats?: StatsPanel;
  private readonly intervals: number[] = [];
  private previous = performance.now();
  private previousRender?: number;
  private fps = 0;
  constructor(readonly game: HTMLElement, private ui: HTMLElement) {
    const params = new URLSearchParams(location.search);
    const track = params.get('track') === 'coast' ? TRACKS.coast : TRACKS.valley;
    if (params.get('view') === 'drive') {
      const id = params.get('car');
      const cfg = id === 'coupe' || id === 'rally' ? CARS[id] : CARS.hatch;
      const quality = params.get('q');
      const paintIndex = Number(params.get('paint') ?? DEFAULT_SETTINGS.paint[cfg.id]);
      void this.openDrive(new Track(track), cfg, paintIndex,
        quality === 'low' || quality === 'high' || quality === 'medium' ? quality : undefined);
    } else if (params.get('view') === 'track') {
      void this.openViewer(new Track(track));
    } else this.go('title');
    if (params.get('stats') === '1') this.stats = new StatsPanel(ui);
    const pending = () => { throw new Error('not implemented'); };
    const debug: DebugApi = {
      state: () => ({
        screen: this.current?.id ?? (this.drive ? 'drive' : this.viewer ? 'track' : 'loading'),
        trackId: this.drive?.track.data.id ?? this.viewer?.track.data.id ?? null,
        carId: this.drive?.vehicle.cfg.id ?? null,
        carModel: this.drive?.car.source ?? null, paint: this.drive?.car.selectedPaint ?? null,
        speedKmh: this.drive?.vehicle.speedKmh() ?? 0,
        rpm: this.drive?.vehicle.rpm ?? 0, gear: this.drive?.vehicle.gear ?? 0,
        pos: this.drive ? [...this.drive.vehicle.pos] : [0,0,0], lap: 0, lapTimeMs: 0, lastLapMs: null, bestLapMs: null,
        lapInvalid: this.drive?.lapInvalid ?? false, progressS: this.drive?.progressS ?? 0, fps: this.fps, quality: this.display?.quality ?? 'medium',
      }),
      setPaint: index => this.drive?.car.setPaint(index),
      startRace: pending, setInputOverride: input => { if (this.drive) this.drive.override = input; }, skipCountdown: pending,
    };
    window.__apex = debug;
    this.previous = performance.now();
    requestAnimationFrame(this.frame);
  }
  private async openViewer(track: Track) {
    const display = new RaceRenderer(this.game, 'medium');
    const assets = new AssetManager(import.meta.env.BASE_URL + 'assets/');
    this.viewer = new TrackViewer(display, track, await buildTrackScene(track, display, assets));
  }

  private async openDrive(track: Track, cfg: CarConfig, paintIndex: number, quality?: Quality) {
    const assets = new AssetManager(import.meta.env.BASE_URL + 'assets/');
    const display = new RaceRenderer(this.game, quality, true);
    const [car, level] = await Promise.all([CarView.load(cfg, track.data.id, assets), buildTrackScene(track, display, assets)]);
    car.setPaint(paintIndex);
    this.drive = new DriveScene(display, track, car, level);
    this.previous = performance.now();
    this.previousRender = undefined;
    this.intervals.length = 0;
    this.fps = 0;
  }

  private get display() { return this.drive?.display ?? this.viewer?.display; }

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
    const display = this.display;
    const render = display?.renderer.info.render;
    const lastFrame = render?.frame;
    const steps = this.drive?.draw(Math.min(dt / 1000, 0.1)) ?? 0;
    this.viewer?.draw();

    // 规格未指定：渲染器跳过提交时，FPS 只记录实际绘制的帧。
    if (!render || render.frame !== lastFrame) this.recordFrame(now);
    this.stats?.update(this.fps, display?.quality ?? 'medium', render?.calls ?? 0, render?.triangles ?? 0, steps);
    requestAnimationFrame(this.frame);
  };

  private recordFrame(now: number) {
    const dt = now - (this.previousRender ?? now);
    this.previousRender = now;
    if (dt > 0) {
      this.intervals.push(dt);
      if (this.intervals.length > 60) this.intervals.shift();
      this.fps = 1000 * this.intervals.length / this.intervals.reduce((sum, interval) => sum + interval, 0);
    }
  }
}
