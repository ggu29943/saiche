import type { ActionEvent, RawIntent } from './types';

const throttleKeys = ['KeyW', 'ArrowUp'];
const brakeKeys = ['KeyS', 'ArrowDown'];
const leftKeys = ['KeyA', 'ArrowLeft'];
const rightKeys = ['KeyD', 'ArrowRight'];
const handbrakeKey = 'Space';

const actions = new Map<string, ActionEvent>([
  ['KeyE', 'shiftUp'],
  ['KeyQ', 'shiftDown'],
  ['KeyC', 'camera'],
  ['KeyR', 'reset'],
  ['Escape', 'pause'],
  ['KeyP', 'pause'],
  ['KeyG', 'ghost'],
]);

const drivingKeys = new Set([...throttleKeys, ...brakeKeys, ...leftKeys, ...rightKeys, handbrakeKey]);

export class KeyboardInput {
  private readonly pressed = new Set<string>();
  private events: ActionEvent[] = [];

  constructor(private readonly target: Window = window) {
    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
    target.addEventListener('blur', this.clear);
  }

  intent(): RawIntent {
    return {
      device: 'keyboard',
      steer: this.axis(leftKeys) - this.axis(rightKeys),
      throttle: this.axis(throttleKeys),
      brake: this.axis(brakeKeys),
      handbrake: this.pressed.has(handbrakeKey) ? 1 : 0,
    };
  }

  consumeEvents(): ActionEvent[] {
    const events = this.events;
    this.events = [];
    return events;
  }

  dispose(): void {
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
    this.target.removeEventListener('blur', this.clear);
    this.clear();
  }

  private axis(keys: string[]): number {
    return keys.some(code => this.pressed.has(code)) ? 1 : 0;
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    const action = actions.get(event.code);
    const driving = drivingKeys.has(event.code);
    if (!action && !driving) return;

    event.preventDefault();
    if (driving) this.pressed.add(event.code);
    if (action && !event.repeat) this.events.push(action);
  };

  private onKeyUp = (event: KeyboardEvent): void => {
    this.pressed.delete(event.code);
  };

  private clear = (): void => {
    this.pressed.clear();
    // 规格未指定：失焦时丢弃尚未消费的事件，避免恢复焦点后误触发。
    this.events = [];
  };
}
