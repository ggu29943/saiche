import { KeyboardInput } from './keyboard';
import type { ActionEvent, DeviceKind, RawIntent } from './types';

export class InputManager {
  private readonly keyboard: KeyboardInput;

  constructor(target: Window = window) {
    this.keyboard = new KeyboardInput(target);
  }

  get activeDevice(): DeviceKind {
    return 'keyboard';
  }

  poll(): void {
    // 键盘状态由 DOM 事件驱动。
  }

  intent(): RawIntent {
    return this.keyboard.intent();
  }

  consumeEvents(): ActionEvent[] {
    return this.keyboard.consumeEvents();
  }

  dispose(): void {
    this.keyboard.dispose();
  }
}
