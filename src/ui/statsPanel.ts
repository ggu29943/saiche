import type { Quality } from '@/render/materials';
import { strings } from './strings';

export class StatsPanel {
  private readonly values: HTMLElement[];

  constructor(root: HTMLElement) {
    const panel = document.createElement('dl');
    panel.className = 'panel stats-panel';
    panel.setAttribute('aria-label', strings.stats.label);
    this.values = strings.stats.metrics.map(label => {
      const term = document.createElement('dt');
      term.textContent = label;
      const value = document.createElement('dd');
      panel.append(term, value);
      return value;
    });
    root.append(panel);
  }

  update(fps: number, quality: Quality, calls: number, triangles: number, steps: number) {
    const values = [fps.toFixed(1), quality, String(calls), String(triangles), String(steps)];
    this.values.forEach((field, index) => {
      if (field.textContent !== values[index]) field.textContent = values[index];
    });
  }
}
