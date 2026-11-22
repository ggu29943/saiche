"""生成 golden 测试向量 + 稳定性模糊测试 + 坡道驻车测试。
用法（在仓库根目录）：python3 reference/gen_golden.py
输出：reference/golden/physics_<car>.json、reference/golden/track_<id>.json
"""
import json, math, random, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sim_reference import *
import track_reference
HERE = os.path.dirname(os.path.abspath(__file__))

A = {"abs": True, "tcs": True, "esc": False, "autoGear": True}

def script(t):
    """确定性输入脚本（TS 测试里必须一字不差地实现同一个函数）"""
    if t < 2.0:  return dict(steer=0.0, throttle=0.0, brake=0.0, handbrake=0.0)
    if t < 6.0:  return dict(steer=0.0, throttle=1.0, brake=0.0, handbrake=0.0)
    if t < 8.0:  return dict(steer=min(1.0, (t - 6.0) / 2.0) * 0.3, throttle=0.5, brake=0.0, handbrake=0.0)
    if t < 9.0:  return dict(steer=0.3, throttle=0.0, brake=1.0, handbrake=0.0)
    return dict(steer=-0.2, throttle=0.3, brake=0.0, handbrake=0.0)

def golden(car):
    v = Vehicle(load(car)); out = []
    n = int(round(10.0 / DT))
    for k in range(n):
        t = k * DT
        inp = script(t); inp["assists"] = A
        v.step(inp)
        if (k + 1) % 120 == 0:   # 每 0.5 s 记录
            out.append({"t": round((k + 1) * DT, 6), "pos": v.pos, "q": v.q, "vel": v.vel, "angvel": v.angvel,
                        "rpm": v.rpm, "gear": v.gear, "omega": [w["omega"] for w in v.wheels],
                        "Fz": [w["Fz"] for w in v.wheels]})
    return {"car": car, "dt": DT, "kp": v.kp, "ap": v.ap, "samples": out}

def fuzz(car, seed, secs=120):
    rnd = random.Random(seed); v = Vehicle(load(car))
    st = th = br = 0.0
    for k in range(int(secs / DT)):
        if k % 60 == 0:
            st = rnd.uniform(-1, 1); th = rnd.random(); br = rnd.random() if rnd.random() < 0.3 else 0.0
        v.step(dict(steer=st, throttle=th, brake=br, handbrake=1.0 if rnd.random() < 0.01 else 0.0,
                    assists={"abs": rnd.random() < .5, "tcs": rnd.random() < .5, "esc": rnd.random() < .5, "autoGear": True}))
        vals = v.pos + v.vel + v.angvel + v.q
        if any(math.isnan(x) or math.isinf(x) for x in vals): return ("NaN", k * DT)
        if length(v.angvel) > 50: return ("spin>50rad/s", k * DT)
    up = q_rot(v.q, [0, 1, 0])
    return ("ok", round(up[1], 3), round(length(v.vel), 1))

def slope(car, grade=0.12):
    ang = math.atan(grade)
    n = [-math.sin(ang), math.cos(ang), 0.0]
    gr = lambda x, z: (x * grade, n, "asphalt")   # 沿 +x 上坡，车头朝 +z（横坡也一起测）
    res = {}
    for yaw, name in ((0.0, "cross"), (math.pi / 2, "uphill")):
        v = Vehicle(load(car), gr); v.reset([0, 0, 0], yaw)
        for k in range(int(10 / DT)):
            v.step(dict(steer=0, throttle=0, brake=0, handbrake=1.0, assists=A))
        res[name] = round(length(v.vel), 4)
    return res

if __name__ == "__main__":
    for car in ("hatch", "coupe", "rally"):
        g = golden(car)
        json.dump(g, open(os.path.join(HERE, "golden", f"physics_{car}.json"), "w"))
        last = g["samples"][-1]
        print(car, "kp/ap", round(g["kp"], 5), round(g["ap"], 5), "t=10 pos", [round(x, 2) for x in last["pos"]], "gear", last["gear"])
        print("   slope", slope(car))
        print("   fuzz", [fuzz(car, s, 60) for s in range(3)])
    for tid in ("valley", "coast"):
        g = track_reference.golden(os.path.join(HERE, "..", "src", "data", "tracks", f"{tid}.json"))
        json.dump(g, open(os.path.join(HERE, "golden", f"track_{tid}.json"), "w"))
        print(tid, round(g["length"], 3), g["count"], "kerbs", g["kerbCount"])
