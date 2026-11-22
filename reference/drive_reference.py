"""
整圈自动驾驶参考（对应 docs/specs/11-测试与验收.md §11.1.1）。
用法（仓库根目录）：python3 reference/drive_reference.py valley hatch
预期：valley hatch → dist 2292.9；valley coupe → 2328.4；coast rally → 2429.9；maxpen 均为 0
"""
import sys, math, json, time, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sim_reference import *
from track_reference import Track
from collision_reference import resolve_barriers, resolve_body_ground
tid, car = sys.argv[1], sys.argv[2]
T = Track(json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src", "data", "tracks", f"{tid}.json"), encoding="utf-8")))
g = lambda x, z: T.query(x, z)
v = Vehicle(load(car), g)
i0 = int(round((T.data["startS"] - 6) / T.step)) % T.count
P = T.pos[i0]; tn = T.tan[i0]
v.reset([P[0], T.height(P[0], P[2]), P[2]], math.atan2(tn[0], tn[2]))
A = {"abs": True, "tcs": True, "esc": True, "autoGear": True}
lapDist = -6.0; sPrev = T.project(v.pos[0], v.pos[2])["s"]; L = T.length
maxpen = 0; t0 = time.time(); lapT = None
def wrap(a): return (a + math.pi) % (2 * math.pi) - math.pi
for k in range(24000):
    p = T.project(v.pos[0], v.pos[2]); i = p["a"]
    # look-ahead curvature for speed target
    look = [abs(T.curv[(i + j) % T.count]) for j in range(0, 40)]
    R = 1 / max(max(look), 1e-4)
    vt = min(45.0, math.sqrt(0.75 * 9.81 * R))
    spd = dot(v.vel, q_rot(v.q, [0, 0, 1]))
    thr = clamp((vt - spd) * 0.5, 0, 1); brk = clamp((spd - vt) * 0.3, 0, 1)
    j = (i + int(8 / T.step)) % T.count   # aim 8 m ahead
    fwd = q_rot(v.q, [0, 0, 1]); tn = T.tan[j]
    he = wrap(math.atan2(tn[0], tn[2]) - math.atan2(fwd[0], fwd[2]))
    st = clamp(-0.08 * p["d"] + 1.2 * he, -1, 1)
    v.step(dict(steer=st, throttle=thr, brake=brk, handbrake=0, shift=0, assists=A))
    mp, _ = resolve_barriers(v, T, T.data["runoffWidth"]); resolve_body_ground(v, g)
    maxpen = max(maxpen, mp)
    s = T.project(v.pos[0], v.pos[2])["s"]; ds = s - sPrev
    if ds > L / 2: ds -= L
    if ds < -L / 2: ds += L
    sPrev = s; lapDist += ds
    if lapDist >= L and lapT is None: lapT = (k + 1) * DT
print(tid, car, "lap time", lapT, "maxpen", round(maxpen, 3), "dist", round(lapDist, 1), "wall", round(time.time() - t0, 1), "s")
