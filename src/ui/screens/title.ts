import type { Screen } from './screen';
import { strings } from '../strings';

export class Title implements Screen {
  readonly id = 'title';
  private heading = document.createElement('h1');
  mount(root: HTMLElement) {
    this.heading.className = 'screen-enter';
    this.heading.style.cssText = 'height:100%;display:grid;place-items:center;margin:0';
    this.heading.textContent = strings.title;
    root.append(this.heading);
  }
  unmount() { this.heading.remove(); }
}
