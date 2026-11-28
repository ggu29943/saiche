import { hash2 } from '@/math/noise';
import { clamp } from '@/math/scalar';
import type { TreePoint } from './forest';
import { treeSize } from './trees';

// 规格未指定：用 48 m 内相对方向的邻树判断林缘，近、远树带共用邻域。
const radius = 48;
const byPosition = (a: TreePoint, b: TreePoint) => a.x - b.x || a.z - b.z;

export function assignTreeScales(trees: TreePoint[], seed: number) {
  const cells = new Map<string, TreePoint[]>();
  const key = (x: number, z: number) => x + ',' + z;
  for (const tree of trees) {
    const id = key(Math.floor(tree.x / radius), Math.floor(tree.z / radius));
    const cell = cells.get(id);
    if (cell) cell.push(tree);
    else cells.set(id, [tree]);
  }

  function visitNeighbours(tree: TreePoint, visit: (other: TreePoint, dx: number, dz: number, weight: number) => void) {
    const cx = Math.floor(tree.x / radius), cz = Math.floor(tree.z / radius);
    for (let x = cx - 1; x <= cx + 1; x++) for (let z = cz - 1; z <= cz + 1; z++) {
      const cell = cells.get(key(x, z));
      if (!cell) continue;
      for (const other of cell) {
        const dx = other.x - tree.x, dz = other.z - tree.z;
        const weight = 1 - (dx * dx + dz * dz) / (radius * radius);
        if (other !== tree && weight > 0) visit(other, dx, dz, weight);
      }
    }
  }

  const ranked = trees.map(tree => {
    const cover = new Float32Array(8);
    visitNeighbours(tree, (_other, dx, dz, weight) => {
      const sector = Math.floor(Math.atan2(dz, dx) * 4 / Math.PI + 8) % 8;
      cover[sector] = Math.max(cover[sector], weight);
    });
    // A tree at the edge can have many neighbours, all on the same side.
    let interior = 0;
    for (let i = 0; i < 4; i++) interior += Math.min(cover[i], cover[i + 4]) / 4;
    const growth = hash2(Math.round(tree.x), Math.round(tree.z), seed + 2);
    tree.scale = clamp(.54 + .57 * interior + .41 * growth, .6, 1.25);
    return { tree, height: treeSize(tree.model).height * tree.scale };
  }).sort((a, b) => b.height - a.height || byPosition(a.tree, b.tree));

  // Keep one dominant in a small stand, two in a larger one. Start inside
  // the stand with the tallest natural stem, independently of render tiles.
  const assigned = new Set<TreePoint>();
  const promote = (tree: TreePoint) => {
    tree.scale = 1.38 + .12 * hash2(Math.round(tree.x), Math.round(tree.z), seed + 107);
  };
  for (const { tree } of ranked) {
    if (assigned.has(tree)) continue;
    assigned.add(tree);
    let neighbours = 0, second: TreePoint | undefined, best = -Infinity;
    visitNeighbours(tree, (other, _dx, _dz, weight) => {
      if (assigned.has(other)) return;
      assigned.add(other);
      neighbours++;
      // Allow space for both crowns while preferring a stem that already grows tall.
      const score = treeSize(other.model).height * other.scale * (1 - .22 * weight);
      if (score > best || (score === best && second && byPosition(other, second) < 0)) {
        best = score;
        second = other;
      }
    });
    if (neighbours > 0) promote(tree);
    if (neighbours >= 5 && second) promote(second);
  }
}
