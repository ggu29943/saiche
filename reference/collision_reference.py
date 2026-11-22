"""
参考护栏碰撞实现（对应 docs/specs/03-车辆物理.md §3.6）与验收场景。
用法（仓库根目录）：python3 reference/collision_reference.py
预期输出（3 行，数值允许 ±10% 偏差）：
angle 90  hit_step 94  vz_0.5s_after 2.86  maxpen 0.022
angle 60  hit_step 107 vz_0.5s_after 0.37  maxpen 0.054
angle 120 hit_step 107 vz_0.5s_after 0.37  maxpen 0.054
"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sim_reference import *
from track_reference import Track

TEST_TRACK = {"id": "test", "runoffWidth": 4, "runoffSurface": "grass", "runoffOverrides": [],
              "controlPoints": [dict(x=x, y=0, z=z, halfWidth=6, bankDeg=0) for x, z in
                                ((0, 0), (100, 0), (200, 0), (300, 0), (400, 100), (400, 200), (300, 300),
                                 (200, 300), (100, 300), (0, 300), (-100, 200), (-100, 100))]}

COLLISION_POINTS = [[.9, 0, 2.15], [-.9, 0, 2.15], [.9, 0, -2.15], [-.9, 0, -2.15], [.9, 0, 0], [-.9, 0, 0]]

def left_at(T, p):
    a = p["a"]; b = (a + 1) % T.count; f = p["f"]
    L = [T.left[a][k] * (1 - f) + T.left[b][k] * f for k in range(3)]; L[1] = 0.0
    return norm(L)

def iinv_world(v, q, I):
    b = q_inv_rot(q, v)
    return q_rot(q, [b[0] / I["x"], b[1] / I["y"], b[2] / I["z"]])

def apply_contact(v, Pw, n, pen, e, mu_f):
    """3.6/3.7 共用的冲量 + 位置修正。返回法向冲量 jn（无冲量时 0）"""
    m = v.c["mass"]; I = v.c["inertia"]; jn = 0.0
    r = sub(Pw, v.pos)
    vp = add(v.vel, cross(v.angvel, r)); vn = dot(vp, n)
    if vn < 0:
        k = 1 / m + dot(n, cross(iinv_world(cross(r, n), v.q, I), r))
        jn = -(1 + e) * vn / k
        vt = sub(vp, mul(n, vn)); vtl = length(vt); J = mul(n, jn)
        if vtl > 1e-4:
            t = mul(vt, 1 / vtl)
            kt = 1 / m + dot(t, cross(iinv_world(cross(r, t), v.q, I), r))
            J = sub(J, mul(t, min(mu_f * jn, vtl / kt)))
        v.vel = add(v.vel, mul(J, 1 / m))
        v.angvel = add(v.angvel, iinv_world(cross(r, J), v.q, I))
    v.pos = add(v.pos, mul(n, pen * 0.8))
    return jn

def resolve_barriers(v, T, runoff):
    maxpen = 0.0; impact = 0.0
    for P in COLLISION_POINTS:
        Pw = add(v.pos, q_rot(v.q, P)); p = T.project(Pw[0], Pw[2])
        if p is None: continue
        pen = abs(p["d"]) - (p["hw"] + runoff)
        if pen <= 0: continue
        maxpen = max(maxpen, pen)
        n = mul(left_at(T, p), -sign(p["d"]))
        impact = max(impact, apply_contact(v, Pw, n, pen, 0.2, 0.4))
    return maxpen, impact

BODY_POINTS = [[sx * 0.9, 0.55, sz * 2.0] for sx in (1, -1) for sz in (1, -1)] + \
              [[sx * 0.9, -0.25, sz * 2.1] for sx in (1, -1) for sz in (1, -1)]

def resolve_body_ground(v, ground):
    for P in BODY_POINTS:
        Pw = add(v.pos, q_rot(v.q, P))
        h, n, _ = ground(Pw[0], Pw[2])
        pen = h - Pw[1]
        if pen > 0:
            apply_contact(v, Pw, n, pen, 0.1, 0.6)

if __name__ == "__main__":
    T = Track(TEST_TRACK)
    A = {"abs": True, "tcs": True, "esc": False, "autoGear": True}
    for deg in (90, 60, 120):
        v = Vehicle(load("hatch"), lambda x, z: T.query(x, z))
        v.reset([150, 0, 0], math.pi + math.radians(deg - 90))   # 车头大致朝 -z，即赛道左侧护栏
        v.vel = mul(q_rot(v.q, [0, 0, 1]), 20.0)
        for w in v.wheels: w["omega"] = 20.0 / v.c["wheel"]["radius"]
        maxpen = 0.0; hit = None; vz_after = None
        for k in range(int(3 / DT)):
            v.step(dict(steer=0, throttle=0, brake=0, handbrake=0, shift=0, assists=A))
            mp, _ = resolve_barriers(v, T, TEST_TRACK["runoffWidth"])
            resolve_body_ground(v, lambda x, z: T.query(x, z))
            maxpen = max(maxpen, mp)
            if mp > 0 and hit is None: hit = k
            if hit is not None and k == hit + 120: vz_after = v.vel[2]
        print(f"angle {deg}  hit_step {hit}  vz_0.5s_after {vz_after:.2f}  maxpen {maxpen:.3f}")
