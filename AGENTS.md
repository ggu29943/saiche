# AGENTS.md —— 执行者守则（Codex 必读）

本仓库是网页 3D 拟真赛车游戏「极限线 APEX LINE」。全部设计已经由规划方定稿，你的职责是**照规格执行**，不是做设计。

## 1. 文档位置与优先级

1. `docs/TASKS.md`：任务清单。**严格按编号顺序执行**，一次只做一个任务。
2. `docs/specs/*.md`：各模块规格。任务里写了"见 §x.y"就去对应章节照做。
3. `reference/*.py`：物理与赛道的**参考实现**。TypeScript 版必须逐函数、逐步骤对应，执行顺序也不能变。
4. `reference/golden/*.json`：标准答案。单元测试必须和它对上。
5. `src/data/**/*.json`：车辆和赛道数据。**不许修改任何数值**。

规格之间冲突时，优先级为：TASKS.md > specs > reference 注释。实在无法执行时，按第 4 节处理。

## 2. 硬性规则

- 依赖版本以 `docs/specs/01-技术栈与目录.md` 的表格为准，`package.json` 里写精确版本（不带 `^` 或 `~`）。不许新增表格以外的依赖。
- 语言：TypeScript strict，禁止使用 `any`（测试文件除外）。UI 文案全部放在 `src/ui/strings.ts`，不许在别处硬编码中文。
- 物理代码（`src/physics/**`、`src/track/track.ts`）**不许 import three**，只能使用 `src/math/*`。
- 不许修改 `reference/`、`src/data/` 下的文件，也不许修改规格里给出的常量。
- 每个任务完成后，先运行该任务的「验收」命令，全部通过才能提交。
- 提交信息格式：`T<编号>: <任务标题>`，例如 `T07: 轮胎模型`。一个任务对应一个提交。
- 规格写的是"必须"，就不许自作主张改成"更好的做法"。规格没提到的细节，按最简单、最直接的写法实现，并在代码里写注释：`// 规格未指定：<你的选择>`。

## 3. 每个任务的固定流程

1. 读任务全文和它引用的规格章节。
2. 按「文件」一栏创建或修改文件。
3. 运行「验收」里的每一条命令，输出必须和「预期」一致。
4. `npm run typecheck && npm run test:unit` 必须全部通过（T01 之后的所有任务都适用）。
5. 提交。

## 4. 卡住时

出现以下情况时**停止**，在 `docs/BLOCKERS.md` 末尾追加一条记录（任务编号、现象、完整报错、已经尝试过的做法），然后接着做**不依赖这个任务**的下一个任务：

- golden 测试的误差超出容差，并且已经逐行对照参考实现检查过一遍；
- 规格本身自相矛盾；
- 需要的外部素材缺失。素材缺失时**不算阻塞**：一律使用规格里的占位方案（placeholder），继续做。

不许为了让测试通过而修改测试的容差或 golden 文件。

## 5. 常用命令

```
npm run dev          # 开发服务器 http://localhost:5173
npm run build        # 生产构建到 dist/
npm run typecheck    # tsc --noEmit
npm run test:unit    # vitest run
npm run test:e2e     # playwright test --trace off
npm run assets:check # 检查 public/assets 下素材是否符合规范
```
