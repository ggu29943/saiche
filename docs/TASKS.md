# TASKS —— 任务清单（按编号顺序执行）

> 执行规则见 `AGENTS.md`。每个任务的"验收"全部通过才能提交，提交信息为 `T<编号>: <标题>`。
> 规格引用写作「03 §3.6」，表示 `docs/specs/03-车辆物理.md` 第 3.6 节。
> **从 T01 起**，每个任务提交前都要额外跑 `npm run typecheck && npm run test:unit`，必须全部通过。

---

## M1 地基

### T00 初始化仓库
- **依赖**：无
- **做什么**：
  1. 如果当前仓库根目录**已经有** `AGENTS.md`、`docs/`、`reference/`、`src/data/`（用户已经放好种子文件），直接跳到第 3 步。
  2. 否则：新建空目录 `apex-line/`，执行 `git init -b main`，把规划方提供的 `repo-seed/` 目录下的**全部内容**原样复制到仓库根目录（包括 `AGENTS.md`、`docs/`、`reference/`、`src/data/`、`public/assets/manifest.json`）。
  3. 创建 `docs/BLOCKERS.md`，内容只有一行：`# Blockers`。
  4. 按 01 §1.8 创建 `.gitignore`。
- **验收**：
  - `python3 reference/gen_golden.py` 能运行，输出的最后两行为 `valley 2679.935 1340 kerbs 526` 和 `coast 2851.53 1426 kerbs 517`。
  - `git status` 中能看到 reference/golden 下的 5 个 json 没有被修改（脚本重新生成的内容与原文件完全相同；如果 `git diff --stat` 显示有变化，**不要提交这些变化**，执行 `git checkout -- reference/golden`）。
- **提交**：`T00: 初始化仓库`

### T01 工程脚手架
- **依赖**：T00
- **文件**：`package.json`、`tsconfig.json`、`vite.config.ts`、`playwright.config.ts`（全部按 01 原样写入）、`index.html`、`src/main.ts`、`src/ui/styles.css`（先只写 07 §7.3 的内容）
- **index.html**（完整内容）：
  ```html
  <!doctype html>
  <html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no" />
    <meta name="theme-color" content="#07090C" />
    <title>极限线 APEX LINE</title>
  </head>
  <body>
    <div id="game"></div>
    <div id="ui"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
  </html>
  ```
- **src/main.ts**：`import './ui/styles.css';`，然后在 `#ui` 里放一个居中的 `<h1>` 显示「极限线」（T05 会替换掉）。
- **做什么**：`npm install`；`npx playwright install chromium`（如果环境里已经有 Chromium 就跳过）。
- **验收**：
  - `npm run typecheck` 无错误。
  - `npm run build` 成功，生成 `dist/index.html`。
  - `npm run test:unit` 输出 "No test files found" 时，在 `tests/unit/` 新建 `sanity.test.ts`，内容为 `import { test, expect } from 'vitest'; test('sanity', () => expect(1 + 1).toBe(2));`，然后必须通过。
- **提交**：`T01: 工程脚手架`

### T02 数据与类型
- **依赖**：T01
- **文件**：`src/physics/types.ts`（02 §2.2、§2.3 的全部类型；`V3`/`Q` 从 math 导入，math 文件此时先建一个只导出类型的空壳，T03 再补全实现）、`src/track/types.ts`（02 §2.4 的 `ControlPoint`、`TrackData`、`Projection`，由 `track.ts` 再导出）、`src/data/index.ts`、`src/assets/manifest.ts`、`src/config/constants.ts`（02 §2.6）
- **src/data/index.ts**：
  ```ts
  import hatch from './cars/hatch.json'; import coupe from './cars/coupe.json'; import rally from './cars/rally.json';
  import valley from './tracks/valley.json'; import coast from './tracks/coast.json';
  import type { CarConfig } from '@/physics/types'; import type { TrackData } from '@/track/types';
  export const CARS: Record<CarConfig['id'], CarConfig> = { hatch: hatch as unknown as CarConfig, coupe: coupe as unknown as CarConfig, rally: rally as unknown as CarConfig };
  export const TRACKS: Record<TrackData['id'], TrackData> = { valley: valley as unknown as TrackData, coast: coast as unknown as TrackData };
  export const CAR_IDS = ['hatch', 'coupe', 'rally'] as const;
  export const TRACK_IDS = ['valley', 'coast'] as const;
  ```
- **src/assets/manifest.ts**：按 `public/assets/manifest.json` 的结构写 `interface Manifest`，所有路径字段可选；导出 `EMPTY_MANIFEST`。
- **测试** `tests/unit/data.test.ts`：3 辆车的 `wheels` 顺序依次为 FL、FR、RL、RR；每辆车 `Math.round(mass * 9.81 / 4) === tire.loadRef`；两条赛道的控制点数分别为 31 和 30。
- **验收**：typecheck 与 test:unit 通过。
- **提交**：`T02: 数据与类型`

### T03 数学库
- **依赖**：T02
- **文件**：`src/math/vec3.ts`、`src/math/quat.ts`、`src/math/scalar.ts`（02 §2.1），`tests/unit/math.test.ts`（11 §11.1）
- **补充**：`scalar.ts` 另外导出 `pmod(a, b) = ((a % b) + b) % b`，凡是从 Python 移植过来的 `%` 一律用它。
- **验收**：math.test 通过。
- **提交**：`T03: 数学库`

### T04 随机数与噪声
- **依赖**：T03
- **文件**：`src/math/rng.ts`（04 §4.6.1）、`src/math/noise.ts`（04 §4.5.3），`tests/unit/rng.test.ts`
- **验收**：rng.test 通过（期望值见 11 §11.1）。
- **提交**：`T04: 随机数与噪声`

### T05 应用骨架与调试接口
- **依赖**：T04
- **文件**：`src/app.ts`、`src/debug/debugApi.ts`、`src/ui/screens/*.ts`（先建 `title.ts`，只显示标题文字）、`src/main.ts`（改为 `new App(document.getElementById('game')!, document.getElementById('ui')!)`）
- **做什么**：
  1. `App` 持有当前界面 `Screen`（07 §7.1 的接口），提供 `go(id)` 切换界面：先调用旧界面的 `unmount()`，再调用新界面的 `mount(uiRoot)`。
  2. `requestAnimationFrame` 主循环：先只计算 dt 和 fps（10 §10.5）。
  3. `window.__apex`：按 02 §2.7 定义；暂时不支持的方法抛 `Error('not implemented')`，`state()` 返回 screen 和 fps，其他字段先填默认值（null、0 或 `[0,0,0]`）。
  4. 新建 `tests/e2e/boot.spec.ts`：打开 `/`，等待 `window.__apex` 出现，断言 `state().screen === 'title'`。
- **验收**：`npm run test:e2e -- --project=desktop` 通过。
- **提交**：`T05: 应用骨架与调试接口`

---

## M2 物理核心

> M2 的全部任务都是**逐行移植** `reference/sim_reference.py`（03 §3.2）。不许 import three。

### T06 路面与物理类型补全
- **依赖**：T05
- **文件**：`src/physics/surfaces.ts`（`SURFACES` 表、`flatGround`），检查 `types.ts` 中 `WheelState`、`VehicleState`、`DriveInput` 是否齐全。
- **验收**：typecheck 通过。
- **提交**：`T06: 路面与物理类型`

### T07 轮胎模型
- **依赖**：T06
- **文件**：`src/physics/tyre.ts`（`mf`、`mfPeakX`、`tyreForces`），`tests/unit/tyre.test.ts`
- **验收**：tyre.test 通过。
- **提交**：`T07: 轮胎模型`

### T08 发动机与差速器
- **依赖**：T07
- **文件**：`src/physics/engine.ts`（`torqueCurve`、`diffSplit`），`tests/unit/engine.test.ts`
- **验收**：engine.test 通过。
- **提交**：`T08: 发动机与差速器`

### T09 Vehicle（上）：构造、重置、转向、悬挂、防倾杆、接触坐标系
- **依赖**：T08
- **文件**：`src/physics/vehicle.ts`
- **做什么**：实现 `constructor`、`reset`、`totalRatio`、`driven`、`speedKmh`；`step()` 实现到参考实现的 **第 4 步（contact frames & velocities）为止**，后续步骤先留 `// TODO T10` 和 `// TODO T11`。另外导出只读属性 `kp`、`ap`。
- **验收**：typecheck 通过（这一步还没有行为测试）。
- **提交**：`T09: Vehicle 上半部分`

### T10 Vehicle（中）：变速箱、发动机、TCS、扭矩分配、刹车、ABS、ESC
- **依赖**：T09
- **做什么**：实现参考实现的第 5、6、7 步。
- **验收**：typecheck 通过。
- **提交**：`T10: Vehicle 中段`

### T11 Vehicle（下）：轮胎力、轮速、空气动力、积分
- **依赖**：T10
- **做什么**：实现第 8、9、10 步。
- **验收**：新建临时测试 `tests/unit/vehicle.smoke.test.ts`：hatch 在平地 idle 2 s 后，`pos[1]` 在 0.50 到 0.54 之间，并且没有 NaN。
- **提交**：`T11: Vehicle 下半部分`

### T12 固定步长物理循环
- **依赖**：T11
- **文件**：`src/physics/world.ts`（03 §3.5），`tests/unit/world.test.ts`
- **测试**：`advance(0.01)` 执行 2 步，之后 accumulator 约为 0.0016667（误差 < 1e-9）；`advance(0.5)` 先被截断为 0.1，执行 12 步后 accumulator 清零（0.1/(1/240)=24 > 12）；`interpolated()` 在 alpha=0 时等于 prev。（此时 `resolveCollisions`、`resolveBodyGround` 先做成可选回调，未传入时跳过。）
- **验收**：world.test 通过。
- **提交**：`T12: 固定步长物理循环`

### T13 物理 golden 与行为测试
- **依赖**：T12
- **文件**：`tests/unit/physics.golden.test.ts`（03 §3.3）、`tests/unit/physics.behavior.test.ts`（03 §3.4）；删除 `vehicle.smoke.test.ts`。
- **验收**：两个测试文件全部通过。**这是 M2 的关卡**：没通过就逐行对照参考实现排查，不许进入 M3。实在找不到原因，按 AGENTS.md §4 记录到 BLOCKERS.md。
- **提交**：`T13: 物理 golden 测试`

---

## M3 赛道

### T14 赛道几何与查询
- **依赖**：T13
- **文件**：`src/track/track.ts`（04 §4.1，包括 `leftAt`、`minimapPath`、`minimapPoint`（04 §4.9））
- **验收**：typecheck 通过。
- **提交**：`T14: 赛道几何`

### T15 赛道 golden 测试
- **依赖**：T14
- **文件**：`tests/unit/track.golden.test.ts`（04 §4.1）
- **验收**：通过。
- **提交**：`T15: 赛道 golden 测试`

### T16 基础渲染与赛道查看器
- **依赖**：T15
- **文件**：`src/render/renderer.ts`（05 §5.1，暂时不接后期处理，直接 `renderer.render`；`toneMapping` 暂时设为 `ACESFilmicToneMapping`）、`src/app.ts`
- **做什么**：URL 带 `?view=track&track=valley`（或 coast）时，App 不进入 title，而是进入"赛道查看器"：
  - 场景里放 `HemisphereLight('#DDE8F5', '#4A5A3A', 1.2)` 和 `DirectionalLight('#FFFFFF', 2.0)`（方向取赛道的 sunDirection）。
  - 用 `three/examples/jsm/controls/OrbitControls.js`，初始相机放在赛道包围盒中心上方 900 m，看向中心。
  - 先把赛道中心线画成 `THREE.Line`（白色），把护栏位置（`±(hw+runoffWidth)`）画成两条红色 Line。
- **验收**：`npm run dev` 后打开 `http://localhost:5173/?view=track&track=valley`，能看到闭合的白线和两条红线。新建 `tests/e2e/viewer.spec.ts`，截图保存到 `test-results/viewer-valley.png`，并断言页面没有 console error。
- **提交**：`T16: 赛道查看器`

### T17 赛道网格与路缘贴图
- **依赖**：T16
- **文件**：`src/track/trackMesh.ts`（04 §4.2）、`src/track/kerbTexture.ts`（04 §4.3）、`src/render/materials.ts`（05 §5.3，**先只实现占位材质**，`createMaterials(null, q)`）
- **做什么**：查看器里用网格替换 T16 画的线（护栏红线保留）。04 §4.2.3 要求按 200 m 分段（10 §10.4 第 3 条），这里一并实现。
- **验收**：查看器截图能看到灰色路面、红白路缘、绿色和米色的缓冲区。e2e viewer 截图更新。
- **提交**：`T17: 赛道网格`

### T18 地形
- **依赖**：T17
- **文件**：`src/track/terrain.ts`（04 §4.5），`tests/unit/terrain.test.ts`；`materials.ts` 增加占位版地形材质（05 §5.4，用 1×1 纯色纹理）
- **验收**：terrain.test 通过；查看器里 valley 有起伏的山丘，coast 一侧低于 0 m（暂时还没有海面）。
- **提交**：`T18: 地形`

### T19 护栏、道具与起跑线
- **依赖**：T18
- **文件**：`src/track/barriers.ts`（04 §4.4）、`src/track/props.ts`（04 §4.7，**只做占位几何**）。删除 T16 的红线。
- **验收**：查看器中 valley 为混凝土墙，coast 为波形护栏加立柱；能看到龙门架、看台（valley）和灯塔（coast）；起跑线为棋盘格。
- **提交**：`T19: 护栏与道具`

### T20 景物与海面占位
- **依赖**：T19
- **文件**：`src/track/scenery.ts`（04 §4.6，只做占位几何）、`src/render/water.ts`（04 §4.8，只做占位材质版本）
- **验收**：valley 在 medium 画质下的树木数量 = `min(候选数, 2500)`，用 `console.info('[scenery] trees', n)` 打印出来，并把这个数值记进提交信息；coast 能看到海面。
- **提交**：`T20: 景物与海面`

---

## M4 能开起来

### T21 键盘输入
- **依赖**：T20
- **文件**：`src/input/types.ts`、`src/input/keyboard.ts`（06 §6.2）、`src/input/inputManager.ts`（06 §6.1，此时只接键盘）
- **验收**：typecheck 通过。
- **提交**：`T21: 键盘输入`

### T22 输入平滑与转向辅助
- **依赖**：T21
- **文件**：`src/input/smoothing.ts`（06 §6.5）、`src/input/steeringAssist.ts`（06 §6.6），以及两个测试文件
- **验收**：两个测试通过。
- **提交**：`T22: 平滑与转向辅助`

### T23 占位车与车辆显示
- **依赖**：T22
- **文件**：`src/render/placeholderCar.ts`（05 §5.5.4）、`src/render/carView.ts`（05 §5.5.1、§5.5.2；材质替换 §5.5.3 先只处理 `paint`，其余在 T33 补上）
- **验收**：typecheck 通过。
- **提交**：`T23: 车辆显示`

### T24 相机
- **依赖**：T23
- **文件**：`src/render/cameraRig.ts`（05 §5.6，暂时不做镜头抖动）
- **验收**：typecheck 通过。
- **提交**：`T24: 相机`

### T25 驾驶调试场景
- **依赖**：T24
- **做什么**：URL 带 `?view=drive&track=valley&car=hatch` 时进入驾驶场景：生成赛道、地形、护栏、景物，创建 `Vehicle`（ground = `track.query`），`resetToTrack(startS - spawnBehindStart)`（03 §3.8，这里先在 `src/physics/reset.ts` 实现），`PhysicsWorld`，`CarView`，`CameraRig`，接上键盘（06 §6.7 组装 DriveInput，assists 先用 `DEFAULT_SETTINGS.assists`）。按主循环顺序（05 §5.9）运行。`C` 键切换视角。`__apex.state()` 返回真实的 speedKmh、rpm、gear、pos；`setInputOverride` 在这个场景下生效。
- **验收**：打开该 URL，能用 WASD 开车、相机跟随、车轮转动。新建 `tests/e2e/drive.spec.ts`：打开该 URL，`setInputOverride({steer:0,throttle:1,brake:0,handbrake:0})`，5 s 后 `speedKmh > 60`。
- **提交**：`T25: 驾驶调试场景`

### T26 护栏碰撞与车身触地
- **依赖**：T25
- **文件**：`src/physics/collision.ts`（03 §3.6、§3.7），`tests/unit/collision.test.ts`；在 `PhysicsWorld.advance` 中接入
- **验收**：collision.test 通过；在驾驶场景里全速撞墙，车会被弹开，不会穿墙。
- **提交**：`T26: 碰撞`

### T27 车辆重置
- **依赖**：T26
- **做什么**：`R` 键手动重置（冷却 1.5 s），翻车 3 s 自动重置（03 §3.8）。重置后相机直接跳到新位置（05 §5.6）。
- **验收**：驾驶场景中开进缓冲区后按 R，车回到赛道中心线上，车头朝前进方向。
- **提交**：`T27: 车辆重置`

### T28 性能统计面板
- **依赖**：T27
- **做什么**：10 §10.5 的 `?stats=1` 面板。
- **验收**：`?view=drive&track=valley&car=hatch&stats=1` 左下角显示 fps、画质、draw calls、三角面、物理步数。
- **提交**：`T28: 统计面板`

### T29 M4 检查点
- **依赖**：T28
- **做什么**：跑全部单元测试和 e2e（boot、viewer、drive）；修复所有失败项。把三辆车在两条赛道上的驾驶场景各截一张图，保存到 `docs/screenshots/m4-<track>-<car>.png`（共 6 张）。
- **验收**：`npm run test:unit && npm run test:e2e -- --project=desktop` 全部通过。
- **提交**：`T29: M4 检查点`

---

## M5 写实画面

### T30 素材管理与脚本
- **依赖**：T29
- **文件**：`src/assets/assetManager.ts`（09 §9.6）、`scripts/check-assets.mjs`（09 §9.7）、`scripts/optimize-assets.mjs`（09 §9.8）
- **验收**：在没有任何素材的情况下，`npm run assets:check` 对每一项输出 MISSING，退出码为 0。
- **提交**：`T30: 素材管理`

### T31 环境光、天空与阴影
- **依赖**：T30
- **文件**：`src/render/environment.ts`（05 §5.2）。驾驶场景和赛道查看器都改用它，删除 T16 的 HemisphereLight。
- **验收**：
  1. 没有 HDRI 时显示 Sky 天空，车和树在地面上投下阴影，阴影跟随车辆，移动时不闪烁。
  2. **如果** `public/assets/env/valley_sky.hdr` 存在：执行 05 §5.2 的对齐校验（`?debugSun=1`），截图保存为 `docs/screenshots/sun-align-valley.png`。不存在就跳过这一条，并在提交信息里写明 "HDRI 缺失，未校验"。
- **提交**：`T31: 环境与阴影`

### T32 PBR 材质与地形 shader
- **依赖**：T31
- **做什么**：`materials.ts` 实现"有素材时"的分支（05 §5.3），地形 shader（05 §5.4）。
- **验收**：没有素材时画面与 T31 一致（占位颜色）；地形在陡坡处呈岩石色。
- **提交**：`T32: PBR 材质`

### T33 真实车模接入
- **依赖**：T32
- **做什么**：`carView` 先尝试 `assets.loadGLB(manifest.cars[id].model)`，失败时用占位车；实现 05 §5.5.3 的全部材质替换规则；刹车灯随刹车输入变化；`restQuat` 的处理。
- **验收**：没有车模时使用占位车（和之前一样）。在 `tests/unit/carView.test.ts` 中用 `buildPlaceholderCar` 当作"真实模型"走一遍加载后的处理流程：断言找到 4 个车轮节点、`paint` 材质被替换成 `MeshPhysicalMaterial`。（这个测试不需要 WebGL，只操作场景图。）
- **提交**：`T33: 车模接入`

### T34 后期处理与画质表
- **依赖**：T33
- **文件**：`src/render/postfx.ts`（05 §5.7）、`src/render/quality.ts`（10 §10.1）。renderer 改为 `NoToneMapping`，曝光按 05 §5.1 的方式处理。
- **做什么**：URL 参数 `&q=low|medium|high` 可以强制指定画质（调试用）。
- **验收**：三种画质下分别截图 `docs/screenshots/q-<level>.png`，肉眼可见的差别：low 没有 bloom，阴影更粗糙。
- **提交**：`T34: 后期与画质`

### T35 自动画质与资源释放
- **依赖**：T34
- **做什么**：10 §10.2 的自动画质；10 §10.4 第 7 条资源释放（实现 `disposeScene(scene)`，驾驶场景卸载时调用）。
- **验收**：在驾驶场景里连续切换赛道 5 次（新增一个调试 URL 参数 `&cycle=5`：每 3 s 自动重新加载一次场景），`renderer.info.memory.geometries` 和 `textures` 不持续增长（第 5 次与第 2 次相比，差值 ≤ 5）。
- **提交**：`T35: 自动画质`

### T36 水面与景物模型
- **依赖**：T35
- **做什么**：`water.ts` 的 Water.js 分支；`scenery.ts` 和 `props.ts` 加载 GLB 模型（缺失时用占位）；树叶材质如果是 MASK 模式就保持原样，并开启 `alphaToCoverage = false`、`side = DoubleSide`。
- **验收**：没有素材时画面与之前一致。
- **提交**：`T36: 水面与景物模型`

---

## M6 游戏化

### T37 UI 基础
- **依赖**：T36
- **文件**：`src/ui/styles.css`（07 §7.3 全部内容）、`src/ui/dom.ts`（07 §7.2：`h(tag, attrs, children)` DOM 辅助函数、`FocusList` 焦点管理、`MenuNav` 键盘和手柄导航，手柄部分在 T47 补上）、`src/ui/strings.ts`（07 §7.10 原样写入）
- **验收**：typecheck 通过。
- **提交**：`T37: UI 基础`

### T38 计圈与时间格式
- **依赖**：T37
- **文件**：`src/game/lapTimer.ts`（07 §7.5）、`src/game/formatTime.ts`（07 §7.9），以及两个测试文件
- **验收**：测试通过。
- **提交**：`T38: 计圈`

### T39 设置与存档
- **依赖**：T38
- **文件**：`src/game/settings.ts`（02 §2.5；`load()`、`save()`、`get()`、`update(patch)`、`onChange(cb)`）、`src/game/storage.ts`（`getJSON`、`setJSON`、`getString`、`setString`，全部带 try/catch），`tests/unit/storage.test.ts`
- **补充**：`load()` 读到的对象要和 `DEFAULT_SETTINGS` 做**深合并**（旧存档缺少的字段用默认值补上）；`version` 不等于 1 时直接用默认值。
- **验收**：测试通过。
- **提交**：`T39: 设置与存档`

### T40 标题、主菜单、操作说明、设置界面
- **依赖**：T39
- **文件**：`src/ui/screens/title.ts`、`mainMenu.ts`、`help.ts`、`settings.ts`（07 §7.4）
- **做什么**：title 的速度线 canvas；mainMenu 的本地最佳面板（读取 storage）；settings 的所有控件，修改后立即 `settings.update()`。title 的第一次用户手势里创建 AudioContext（先建一个 `src/audio/audioEngine.ts` 的空壳类，只负责创建 context 和 master 节点）。
- **验收**：从 title 进入 mainMenu，打开设置并修改选项，刷新页面后设置仍然保留；键盘可以完成所有操作。
- **提交**：`T40: 菜单界面`

### T41 幽灵车
- **依赖**：T40
- **文件**：`src/game/ghost.ts`（07 §7.6：`GhostRecorder`、`GhostTrack`（回放与 `deltaAt(lapDist, lapTime)`）、`encodeGhost`、`decodeGhost`）、`src/render/ghostView.ts`（05 §5.8），`tests/unit/ghost.test.ts`
- **验收**：测试通过。
- **提交**：`T41: 幽灵车`

### T42 展厅与选车界面
- **依赖**：T41
- **文件**：`src/render/showroom.ts`（07 §7.8）、`src/ui/screens/carSelect.ts`（07 §7.4 carSelect）
- **验收**：左右键切换 3 辆车，上下键切换涂装（展厅里车漆颜色立即变化，并写入 `settings.paint`），Enter 进入 trackSelect（暂时先进入一个空白界面），Esc 返回。
- **提交**：`T42: 选车`

### T43 选赛道与加载界面
- **依赖**：T42
- **文件**：`src/ui/screens/trackSelect.ts`、`src/ui/screens/loading.ts`；把 T25 驾驶场景里"生成赛道与车辆"的逻辑抽成 `src/game/raceScene.ts` 的 `async buildRaceScene(trackId, carId, assets, quality, onProgress)`，返回 `{ scene, track, vehicle, world, carView, cameraRig, env, water, heightAt, dispose() }`。加载步骤与权重按 07 §7.4 loading。
- **验收**：trackSelect 确认后显示进度条，完成后进入 countdown（暂时先停在 3D 画面上）。
- **提交**：`T43: 选赛道与加载`

### T44 比赛控制
- **依赖**：T43
- **文件**：`src/game/raceController.ts`（07 §7.7）、`src/ui/screens/countdown.ts`（倒计时灯，07 §7.4 countdown）
- **做什么**：倒计时 3 s（期间每个物理步使用 `{ steer: 0, throttle: 0, brake: 0, handbrake: 1, shift: 0 }`，保留当前 assists，见 05 §5.9 第 3 步）→ racing；每个物理步调用 `lapTimer.step`、幽灵车录制；处理 lap/sector/invalid 事件；重置、自动重置、逆行检测；圈完成时比较并保存最佳成绩和幽灵车。
- **验收**：在 valley 跑完一整圈后，`localStorage` 中出现 `apex.best.v1.valley.hatch` 和 `apex.ghost.v1.valley.hatch`。自动挡下完整跑完 3 s 倒计时，进入 racing 时断言 `gear === 1`，并且车辆相对倒计时起点的三维位移小于 0.5 m。
- **提交**：`T44: 比赛控制`

### T45 HUD 与小地图
- **依赖**：T44
- **文件**：`src/ui/hud.ts`、`src/ui/minimap.ts`（07 §7.4 racing 的全部区块）
- **验收**：HUD 各区块位置、字号、颜色与规格一致；跑完第二圈时差值胶囊和分段提示正常出现。截图 `docs/screenshots/hud.png`。
- **提交**：`T45: HUD`

### T46 暂停、结算与完整流程
- **依赖**：T45
- **文件**：`src/ui/screens/pause.ts`、`src/ui/screens/results.ts`；完善 `app.ts` 的状态机（07 §7.1 的全部转换）；`__apex` 的所有方法都改为真实实现；删除调试 URL `?view=drive` 以外的旧入口（`?view=track` 和 `?view=drive` 保留，供调试使用）
- **做什么**：编写 `tests/e2e/menu.spec.ts`（11 §11.2）。
- **验收**：menu.spec 通过；从 title 一路走到 results 再回到主菜单，过程中没有 console error。
- **提交**：`T46: 完整流程`

---

## M7 输入与音频

### T47 手柄
- **依赖**：T46
- **文件**：`src/input/gamepad.ts`（06 §6.3），接入 inputManager 和菜单导航（07 §7.2）
- **验收**：新建 `tests/unit/gamepad.test.ts`，用伪造的 Gamepad 对象测试转向曲线（axes[0] = -1 → steer = 1；axes[0] = -0.08 → 0；axes[0] = -0.54 → `((0.54-0.08)/0.92)^1.6` ≈ 0.3299）和按键边沿检测。
- **提交**：`T47: 手柄`

### T48 触屏
- **依赖**：T47
- **文件**：`src/input/touch.ts`、`src/ui/touchOverlay.ts`（06 §6.4）、`src/ui/screens/rotate.ts`；HUD 的触屏布局（07 §7.4）；触屏时强制自动挡（`assists.autoGear` 视为 true，但不修改保存的设置）
- **验收**：`npm run test:e2e -- --project=mobile` 下，boot.spec 和一个新增的 `touch.spec.ts` 通过。touch.spec：进入 racing 后，用 `page.touchscreen.tap` 不够（需要按住），改为对油门元素派发 `pointerdown`（`pointerType: 'touch'`），3 s 后 `speedKmh > 30`，再派发 `pointerup`。
- **提交**：`T48: 触屏`

### T49 音频图与合成引擎声
- **依赖**：T48
- **文件**：`src/audio/audioEngine.ts`（08 §8.1，补全）、`src/audio/synthEngine.ts`（08 §8.4 的引擎部分）
- **验收**：没有任何音频素材时，开车能听到随转速变化的合成引擎声；暂停时静音。（这一项无法自动测试，在提交信息中写"已人工确认"或"环境无音频输出，未确认"。）
- **提交**：`T49: 合成引擎声`

### T50 采样引擎声
- **依赖**：T49
- **文件**：`src/audio/engineSound.ts`（08 §8.2）；素材存在时使用采样，否则使用 T49 的合成方案
- **验收**：新建 `tests/unit/engineMix.test.ts`，把交叉淡化计算抽成纯函数 `engineMix(rpm, load, voices)`，测试：rpm=1500 → 只有 on_low 有声音（g=1）；rpm=3000 → on_low 和 on_mid 的 g 都约等于 0.7071；rpm=7000 → 只有 on_high。
- **提交**：`T50: 采样引擎声`

### T51 音效
- **依赖**：T50
- **文件**：`src/audio/sfx.ts`（08 §8.3 与 §8.4 的其余部分）；倒计时提示音、UI 音效接入
- **验收**：typecheck 和单元测试通过；把 skid 的计算抽成纯函数 `skidAmount(wheels, kp, ap)` 并加一个单元测试：所有车轮 κ=0、β=0 → 0；某个车轮 κ=0.6（其余为 0）→ 1（(0.6−0.9·kp)/0.4 > 1，被截断为 1）。
- **提交**：`T51: 音效`

### T52 画面细节
- **依赖**：T51
- **做什么**：镜头抖动（05 §5.6）、速度 FOV、刹车灯（05 §5.5.3）、HUD 辅助指示灯（ABS：任意车轮 `absScale < 1`；TCS：`tcsScale < 1`）、换挡时档位框闪烁、限转器闪烁。
- **验收**：截图 `docs/screenshots/braking.png`（刹车时刹车灯亮）。
- **提交**：`T52: 画面细节`

### T53 切后台与暂停
- **依赖**：T52
- **做什么**：08 §8.5；07 §7.4 paused 中的物理暂停与音频 suspend/resume。
- **验收**：在 e2e 中模拟 `document.dispatchEvent(new Event('visibilitychange'))`，同时把 `document.visibilityState` 用 `Object.defineProperty` 改成 'hidden'，断言 screen 变为 paused。
- **提交**：`T53: 切后台暂停`

---

## M8 打磨与验收

### T54 性能优化
- **依赖**：T53
- **做什么**：逐条核对 10 §10.4 的 7 项，未完成的补上。
- **验收**：`?stats=1` 下记录 valley 驾驶场景 medium 画质的 draw calls，写进提交信息。
- **提交**：`T54: 性能优化`

### T55 构建体积与加载时间
- **依赖**：T54
- **做什么**：`npm run build`，记录 `dist/assets/*.js` 的总大小（gzip 前后都记）。写一个 e2e `loadtime.spec.ts`：从 `startRace('valley','hatch')` 调用到 screen 变为 countdown 的耗时，桌面端 ≤ 4000 ms（10 §10.3）。
- **验收**：loadtime.spec 通过。如果超时，先确认是否忘了 `compileAsync`，以及地形是否重复计算了最近点。
- **提交**：`T55: 加载时间`

### T56 整圈驾驶测试
- **依赖**：T55
- **文件**：`tests/unit/perf.test.ts`（11 §11.1.1）
- **验收**：通过。
- **提交**：`T56: 整圈驾驶测试`

### T57 端到端测试
- **依赖**：T56
- **文件**：`tests/e2e/smoke.spec.ts`（11 §11.2）
- **验收**：`npm run test:e2e` 的 desktop 和 mobile 两个 project 全部通过。
- **提交**：`T57: 端到端测试`

### T58 全面检查
- **依赖**：T57
- **做什么**：
  1. `grep -rn "any" src --include=*.ts` 检查有没有 `: any`、`as any`，有就改掉。
  2. `grep -rn "TODO" src` 必须为空。
  3. 检查 strings.ts 以外的地方有没有硬编码中文：`grep -rnP "[\x{4e00}-\x{9fa5}]" src --include=*.ts | grep -v strings.ts | grep -v "^.*//"`，有就挪进 strings.ts（注释里的中文不算）。
  4. 跑全部测试。
- **验收**：以上 4 项全部通过。
- **提交**：`T58: 全面检查`

### T59 截图审查
- **依赖**：T58
- **文件**：`tests/e2e/screenshots.spec.ts`，按 11 §11.4 生成截图到 `docs/screenshots/`
- **验收**：11 张截图全部生成。
- **提交**：`T59: 截图`

### T60 交付
- **依赖**：T59
- **文件**：`README.md`
- **README 内容**（按顺序）：
  1. 标题和一句话介绍（00 §0.1）；
  2. 运行方式：`npm install`、`npm run dev`、`npm run build`；
  3. 操作说明（键盘、手柄、触屏三张表，内容取自 strings.ts 的 help）；
  4. 如何放入素材：指向 `docs/specs/09-素材规范.md`，并说明 `npm run assets:check` 和 `npm run assets:optimize` 的用法；
  5. 调试参数：`?view=track&track=`、`?view=drive&track=&car=`、`?stats=1`、`?q=`、`?debugSun=1`；
  6. 人工验收清单（11 §11.3 原样复制）；
  7. 已知限制（AGENTS.md 中 BLOCKERS 未解决的条目，没有则写"无"）。
- **验收**：`npm run build && npm run test:unit && npm run test:e2e` 全部通过。
- **提交**：`T60: 交付`
