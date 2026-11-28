import { RaceRenderer } from './render/renderer';
import { buildTrackScene } from './render/trackScene';
import { TrackViewer } from './render/trackViewer';
import { Track } from './track/track';
import { AssetManager } from './assets/assetManager';
import { CarView } from './render/carView';
import type { CarConfig } from './physics/types';
import { AutoQuality, initialQuality, type Quality } from './render/quality';
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
  private display?: RaceRenderer;
  private generation = 0;
  private readonly coarse = matchMedia('(pointer: coarse)').matches;
  private readonly forced?: Quality;
  private sampler?: AutoQuality;
  private readonly cycleLimit: number;
  private switches = 0;
  private cycleTimer?: number;
  private reported = false;
  private screens = new Map<string, Screen>([['title', new Title()]]);
  private current?: Screen;
  private readonly stats?: StatsPanel;
  private readonly intervals: number[] = [];
  private previous = performance.now();
  private previousRender?: number;
  private stepsSinceRender = 0;
  private fps = 0;
  constructor(readonly game: HTMLElement, private ui: HTMLElement) {
    const params = new URLSearchParams(location.search);
    const track = params.get('track') === 'coast' ? TRACKS.coast : TRACKS.valley;
    const q = params.get('q');
    this.forced = q === 'low' || q === 'medium' || q === 'high' ? q : undefined;
    const cycles = Number(params.get('cycle'));
    this.cycleLimit = Number.isSafeInteger(cycles) && cycles > 0 ? cycles : 0;
    if (params.get('view') === 'drive') {
      const id = params.get('car');
      const cfg = id === 'coupe' || id === 'rally' ? CARS[id] : CARS.hatch;
      const paintIndex = Number(params.get('paint') ?? DEFAULT_SETTINGS.paint[cfg.id]);
      void this.openTrack(new Track(track), { cfg, paintIndex });
    } else if (params.get('view') === 'track') {
      void this.openTrack(new Track(track));
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
  private unloadTrack() {
    ++this.generation;
    this.stepsSinceRender = 0;
    window.clearTimeout(this.cycleTimer);
    this.cycleTimer = undefined;
    this.sampler = undefined;
    this.reported = false;
    this.display?.setScene();
    this.drive?.dispose();
    this.viewer?.dispose();
    this.drive = undefined;
    this.viewer = undefined;
  }

  private async openTrack(track: Track, selection?: { cfg: CarConfig; paintIndex: number }) {
    this.unloadTrack();
    this.current?.unmount();
    this.current = undefined;
    const generation = this.generation;
    const display = this.display ??= new RaceRenderer(this.game, this.forced ?? initialQuality(this.coarse), !this.forced);
    display.renderer.domElement.hidden = false;
    const assets = new AssetManager(import.meta.env.BASE_URL + 'assets/');
    const [level, car] = await Promise.all([
      buildTrackScene(track, display, assets), selection && CarView.load(selection.cfg, track.data.id, assets),
    ]);
    if (car && selection) {
      car.setPaintEnvironment(level.scene);
      car.setPaint(selection.paintIndex);
      level.scene.add(car.carRoot);
    }
    if (this.generation === generation) await display.prepareScene(level.scene);
    if (this.generation !== generation) {
      level.dispose();
      return;
    }
    if (car) {
      this.drive = new DriveScene(display, track, car, level);
      if (!this.forced) this.sampler = new AutoQuality(this.coarse);
    } else this.viewer = new TrackViewer(display, track, level);
    this.previous = performance.now();
    this.previousRender = undefined;
    this.intervals.length = 0;
    this.fps = 0;
  }

  private cycleTrack() {
    const drive = this.drive;
    if (!drive || !this.cycleLimit || this.reported || !drive.display.renderer.domElement.dataset.ready) return;
    this.reported = true;
    console.info('[cycle]', this.switches, drive.track.data.id, { ...drive.display.renderer.info.memory });
    if (this.switches >= this.cycleLimit) return;
    this.cycleTimer = window.setTimeout(() => {
      this.switches++;
      const next = drive.track.data.id === 'valley' ? TRACKS.coast : TRACKS.valley;
      void this.openTrack(new Track(next), { cfg: drive.vehicle.cfg, paintIndex: drive.car.selectedPaint });
    }, 3000);
  }

  go(id: string) {
    const next = this.screens.get(id);
    if (!next) throw new Error('Unknown screen: ' + id);
    this.unloadTrack();
    if (this.display) this.display.renderer.domElement.hidden = true;
    this.current?.unmount();
    this.current = next;
    next.mount(this.ui);
  }
  private frame = (now: number) => {
    const dt = Math.max(0, now - this.previous);
    this.previous = now;
    const display = this.display;
    const render = display?.renderer.info.render;
    const lastFrame = render?.frame;
    this.stepsSinceRender += this.drive?.draw(Math.min(dt / 1000, 0.1)) ?? 0;
    this.viewer?.draw(dt / 1000);

    // CPU physics also runs between GPU frames. Report all steps for the last frame actually drawn.
    if (render && (this.drive || this.viewer) && render.frame !== lastFrame) {
      this.recordFrame(now);
      this.stats?.update(this.fps, display.quality, render.calls, render.triangles, this.stepsSinceRender);
      this.stepsSinceRender = 0;
    } else if (!this.drive && !this.viewer) {
      this.stats?.update(0, display?.quality ?? 'medium', 0, 0, 0);
    }
    this.cycleTrack();
    requestAnimationFrame(this.frame);
  };

  private recordFrame(now: number) {
    const dt = now - (this.previousRender ?? now);
    this.previousRender = now;
    if (this.drive) {
      const next = this.sampler?.sample(dt, this.drive.display.quality);
      if (next) this.drive.setQuality(next);
    }
    if (dt > 0) {
      this.intervals.push(dt);
      if (this.intervals.length > 60) this.intervals.shift();
      this.fps = 1000 * this.intervals.length / this.intervals.reduce((sum, interval) => sum + interval, 0);
    }
  }
}
