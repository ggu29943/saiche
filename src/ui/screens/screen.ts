export interface Screen {
  id: string;
  mount(root: HTMLElement): void;   // 创建 DOM
  unmount(): void;                  // 移除 DOM、解绑事件
  onAction?(a: 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back'): void; // 键盘/手柄导航
}
