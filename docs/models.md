# APEX LINE 车辆模型

游戏从 [素材清单](../public/assets/manifest.json) 读取三个 GLB。下列图片均由交付的 GLB 渲染，使用驾驶场景的材质替换和车型默认涂装。

| 车型 | 前 3/4 | 后 3/4 | 正侧面 | 正上方 |
| --- | --- | --- | --- | --- |
| 雨燕 GTi · hatch | [![雨燕车头](screenshots/car-hatch-front.png)](screenshots/car-hatch-front.png) | [![雨燕车尾](screenshots/car-hatch-rear.png)](screenshots/car-hatch-rear.png) | [![雨燕侧面](screenshots/car-hatch-side.png)](screenshots/car-hatch-side.png) | [![雨燕上方](screenshots/car-hatch-top.png)](screenshots/car-hatch-top.png) |
| 朱雀 R · coupe | [![朱雀车头](screenshots/car-coupe-front.png)](screenshots/car-coupe-front.png) | [![朱雀车尾](screenshots/car-coupe-rear.png)](screenshots/car-coupe-rear.png) | [![朱雀侧面](screenshots/car-coupe-side.png)](screenshots/car-coupe-side.png) | [![朱雀上方](screenshots/car-coupe-top.png)](screenshots/car-coupe-top.png) |
| 雷隼 AWD · rally | [![雷隼车头](screenshots/car-rally-front.png)](screenshots/car-rally-front.png) | [![雷隼车尾](screenshots/car-rally-rear.png)](screenshots/car-rally-rear.png) | [![雷隼侧面](screenshots/car-rally-side.png)](screenshots/car-rally-side.png) | [![雷隼上方](screenshots/car-rally-top.png)](screenshots/car-rally-top.png) |

## 建模方法

车头朝 +Z，左侧为 +X，竖直向上为 +Y，脚本以米为单位。地面原点取前后车轴中点的投影。车轮中心直接取自各车的轮距、轴距和轮胎半径，四个车轮节点分别绕局部 X 轴滚动。

车壳沿车长方向放样。每种车型都有独立的前后悬、发动机盖高度、挡风玻璃起点和车顶轮廓。纵向设计点之间采用保形三次插值，横向曲面从中线经过轮拱肩部弯到车侧。轮胎上方留出实际开口，开口内侧接深色轮罩，外侧沿弧线翻边。前后保险杠的曲面从车侧向车头、车尾收拢。

- 雨燕 GTi 的车顶越过后排后开始下收，后窗中心与水平面约成 77°。后悬缩短约 25 cm，车顶尾翼随尾门上缘定位。
- 朱雀 R 的后悬缩短 26 cm，车尾上表面中心降低约 16 cm。前后翼子板向轮拱外侧隆起，约 1.71 m 宽的尾灯横跨车尾，两端的刹车灯随制动输入点亮。
- 雷隼 AWD 使用三厢车身，前盖设进气口，后备厢支撑大尾翼，四个轮拱后方各装一块泥挡。

三车的胎面、内外胎壁和防擦凸缘共用 `#151515` 的非金属橡胶材质，轮辋单独着色。导出器按材质合并同一刚体上的零件，锁住相邻曲面的边缘，再对平坦区域减面。每侧的前后轮共用网格数据，并由各自的节点驱动。

| 交付文件 | 轴距 | 轮距 | 轮胎半径 | 整车三角面 |
| --- | ---: | ---: | ---: | ---: |
| [hatch.glb](../public/assets/cars/hatch/hatch.glb) | 2.60 m | 1.54 m | 0.315 m | 69,980 |
| [coupe.glb](../public/assets/cars/coupe/coupe.glb) | 2.65 m | 1.58 m | 0.335 m | 68,118 |
| [rally.glb](../public/assets/cars/rally/rally.glb) | 2.62 m | 1.56 m | 0.325 m | 69,238 |

车身零件归在 `body` 下，风挡和车窗使用 `glass`。游戏通过 `paint` 统一更换车漆，按 `light_head`、`light_tail` 和 `light_brake` 分别设置前灯、尾灯和刹车灯。截图脚本保持车轮着地的静置姿态，用同一套摄影棚灯光渲染四个角度，便于比较车身比例。

## 生成与验收

在仓库根目录执行以下命令。生成器和截图脚本均支持在命令末尾加车型 ID，单独处理一辆车。首次截图前可用 `npx playwright install chromium` 安装浏览器。

```sh
node scripts/models/generate.mjs
npm run assets:check
node scripts/models/capture.mjs
```

在本地运行 `npm run dev` 后，打开 `/?view=drive&track=valley&car=hatch&paint=0`。把 `car` 改为 `coupe` 或 `rally` 可切换车型。涂装编号为 0–3，驾驶时可在浏览器控制台执行 `window.__apex.setPaint(2)` 原地换色。`window.__apex.state().carModel` 显示当前加载的模型来源，正常为 `glb`，文件缺失或无法解析时为 `placeholder`。
