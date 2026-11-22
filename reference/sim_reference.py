"""
参考物理实现（Reference vehicle physics）。
TypeScript 版本必须逐行对应本文件的算法与执行顺序，并通过 golden 测试。
坐标：世界 Y 向上，右手系。车身局部：+Z 前，+Y 上，+X 左。
只依赖 Python 标准库（math），便于对照移植。
"""
import json, math

G = 9.81
RHO = 1.225
DT = 1.0 / 240.0

# ---------------------------------------------------------------- vec / quat
def add(a, b): return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
def sub(a, b): return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
def mul(a, s): return [a[0] * s, a[1] * s, a[2] * s]
def dot(a, b): return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
def cross(a, b): return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
def length(a): return math.sqrt(dot(a, a))
def norm(a):
    l = length(a)
    return [0.0, 0.0, 0.0] if l < 1e-9 else mul(a, 1.0 / l)

def q_mul(a, b):
    aw, ax, ay, az = a; bw, bx, by, bz = b
    return [aw * bw - ax * bx - ay * by - az * bz,
            aw * bx + ax * bw + ay * bz - az * by,
            aw * by - ax * bz + ay * bw + az * bx,
            aw * bz + ax * by - ay * bx + az * bw]

def q_rot(q, v):
    """rotate vector v by unit quaternion q (w,x,y,z)"""
    w, x, y, z = q
    u = [x, y, z]
    t = mul(cross(u, v), 2.0)
    return add(add(v, mul(t, w)), cross(u, t))

def q_inv_rot(q, v):
    return q_rot([q[0], -q[1], -q[2], -q[3]], v)

def q_norm(q):
    l = math.sqrt(sum(c * c for c in q))
    return [c / l for c in q]

def clamp(x, lo, hi): return lo if x < lo else hi if x > hi else x
def sign(x): return 1.0 if x > 0 else -1.0 if x < 0 else 0.0

# ---------------------------------------------------------------- tyre
def mf(x, B, C, E):
    bx = B * x
    return math.sin(C * math.atan(bx - E * (bx - math.atan(bx))))

def mf_peak_x(B, C, E):
    """数值求峰值位置：在 [0, 1.5] 上以 1e-5 步长扫描，取最大值处 x。初始化时算一次。"""
    best_x, best_y = 0.0, -1.0
    n = 150000
    for i in range(1, n + 1):
        x = 1.5 * i / n
        y = mf(x, B, C, E)
        if y > best_y:
            best_y, best_x = y, x
    return best_x

def tyre_forces(kappa, alpha, Fz, tire, mu_surface, kp, ap):
    """组合滑移（归一化）。kappa=滑移率, alpha=滑移角(rad)。返回 (Fx, Fy)"""
    if Fz <= 0.0:
        return 0.0, 0.0
    lon, lat = tire["lon"], tire["lat"]
    mu = tire["mu"] * (1.0 + tire["loadSensitivity"] * (Fz - tire["loadRef"]) / tire["loadRef"])
    mu = max(mu, 0.5 * tire["mu"]) * mu_surface
    D = mu * Fz
    sx = kappa / kp
    sy = alpha / ap
    s = math.sqrt(sx * sx + sy * sy)
    if s < 1e-9:
        return 0.0, 0.0
    Fx = D * mf(s * kp, lon["B"], lon["C"], lon["E"]) * (sx / s)
    Fy = D * mf(s * ap, lat["B"], lat["C"], lat["E"]) * (sy / s)
    return Fx, Fy

# ---------------------------------------------------------------- engine
def torque_curve(curve, rpm):
    if rpm <= curve[0][0]: return curve[0][1]
    if rpm >= curve[-1][0]: return curve[-1][1]
    for i in range(len(curve) - 1):
        r0, t0 = curve[i]; r1, t1 = curve[i + 1]
        if r0 <= rpm <= r1:
            return t0 + (t1 - t0) * (rpm - r0) / (r1 - r0)
    return 0.0

def diff_split(T, w_a, w_b, d):
    """把扭矩 T 分给 a/b 两端。open: 各一半。lsd: 加锁止扭矩。返回 (Ta, Tb)"""
    if d["type"] == "open":
        return 0.5 * T, 0.5 * T
    lim = d["preloadNm"] + d["lockRatio"] * abs(T)
    dT = clamp(d["lockGain"] * (w_b - w_a), -lim, lim)   # a 慢于 b 时把扭矩推向 a
    return 0.5 * T + 0.5 * dT, 0.5 * T - 0.5 * dT

# ---------------------------------------------------------------- ground (flat for reference; game uses track query)
def flat_ground(x, z):
    return 0.0, [0.0, 1.0, 0.0], "asphalt"

SURFACES = {
    "asphalt": {"mu": 1.00, "rolling": 0.000},
    "kerb":    {"mu": 0.95, "rolling": 0.002},
    "grass":   {"mu": 0.60, "rolling": 0.060},
    "gravel":  {"mu": 0.55, "rolling": 0.120},
}

# ---------------------------------------------------------------- vehicle
class Vehicle:
    def __init__(self, cfg, ground=flat_ground):
        self.c = cfg
        self.ground = ground
        self.kp = mf_peak_x(cfg["tire"]["lon"]["B"], cfg["tire"]["lon"]["C"], cfg["tire"]["lon"]["E"])
        self.ap = mf_peak_x(cfg["tire"]["lat"]["B"], cfg["tire"]["lat"]["C"], cfg["tire"]["lat"]["E"])
        self.reset([0.0, 0.0, 0.0], 0.0)

    def reset(self, ground_pos, yaw):
        c = self.c
        h = c["cgHeight"]
        self.pos = [ground_pos[0], ground_pos[1] + h + 0.02, ground_pos[2]]
        self.q = [math.cos(yaw / 2), 0.0, math.sin(yaw / 2), 0.0]
        self.vel = [0.0, 0.0, 0.0]
        self.angvel = [0.0, 0.0, 0.0]
        self.wheels = []
        for w in c["wheels"]:
            s = c["suspension"][w["axle"]]
            self.wheels.append({"cfg": w, "susp": s, "omega": 0.0, "kappa": 0.0, "beta": 0.0,
                                "len": s["restLength"], "lenPrev": s["restLength"], "contact": False,
                                "Fz": 0.0, "Fx": 0.0, "Fy": 0.0, "steer": 0.0, "rot": 0.0,
                                "surface": "asphalt", "absScale": 1.0})
        self.gear = 1
        self.shiftTimer = 0.0
        self.sinceShift = 10.0
        self.rpm = c["engine"]["idleRpm"]
        self.limiterCut = False
        self.tcsScale = 1.0
        self.time = 0.0

    # --- helpers
    def total_ratio(self, gear):
        gb = self.c["gearbox"]
        if gear == 0: return 0.0
        r = -gb["reverse"] if gear < 0 else gb["ratios"][gear - 1]
        return r * gb["final"]

    def driven(self):
        t = self.c["drivetrain"]["type"]
        return {"FWD": [0, 1], "RWD": [2, 3], "AWD": [0, 1, 2, 3]}[t]

    def step(self, inp, dt=DT):
        """inp: dict steer[-1,1] (+左), throttle[0,1], brake[0,1], handbrake[0,1], shift(-1/0/+1),
        assists: {abs,tcs,esc,autoGear}"""
        c = self.c
        q = self.q
        up = q_rot(q, [0, 1, 0]); fwd = q_rot(q, [0, 0, 1]); left = q_rot(q, [1, 0, 0])
        a = inp.get("assists", {"abs": True, "tcs": True, "esc": False, "autoGear": True})

        # 1. steering angles (Ackermann). steer input already smoothed by input layer.
        maxd = math.radians(c["steering"]["maxAngleDeg"])
        delta = inp["steer"] * maxd
        fl, fr = c["wheels"][0]["mount"], c["wheels"][1]["mount"]
        rl = c["wheels"][2]["mount"]
        Lwb = fl[2] - rl[2]; Ttr = fl[0] - fr[0]
        if abs(delta) > 1e-4:
            Rt = Lwb / math.tan(abs(delta))
            inner = math.atan(Lwb / (Rt - Ttr / 2)); outer = math.atan(Lwb / (Rt + Ttr / 2))
            if delta > 0: dl, dr = inner, outer
            else: dl, dr = -outer, -inner
        else:
            dl = dr = 0.0
        self.wheels[0]["steer"] = dl; self.wheels[1]["steer"] = dr
        self.wheels[2]["steer"] = 0.0; self.wheels[3]["steer"] = 0.0

        # 2. suspension
        for w in self.wheels:
            s = w["susp"]; R = c["wheel"]["radius"]
            mount_w = add(self.pos, q_rot(q, w["cfg"]["mount"]))
            gy, n, surf = self.ground(mount_w[0], mount_w[2])
            dirv = mul(up, -1.0)
            denom = dot(dirv, n)
            w["lenPrev"] = w["len"]
            w["contact"] = False
            w["Fz"] = 0.0
            maxlen = s["restLength"]
            if denom < -0.2:
                gp = [mount_w[0], gy, mount_w[2]]
                t = dot(sub(gp, mount_w), n) / denom
                if t <= s["restLength"] + R:
                    w["contact"] = True
                    length_ = t - R
                    minlen = s["restLength"] - s["maxCompression"]
                    bump = 0.0
                    if length_ < minlen:
                        bump = c["suspension"]["bumpStopStiffness"] * (minlen - length_)
                    w["len"] = max(length_, minlen)
                    comp = s["restLength"] - w["len"]
                    comp_v = (w["lenPrev"] - w["len"]) / dt
                    damp = s["damperBump"] if comp_v > 0 else s["damperRebound"]
                    w["Fz"] = max(0.0, s["stiffness"] * comp + damp * comp_v + bump)
                    w["contactPoint"] = add(mount_w, mul(dirv, t))
                    w["normal"] = n
                    w["surface"] = surf
            if not w["contact"]:
                w["len"] = min(w["len"] + 2.0 * dt, maxlen)   # 悬空时以 2 m/s 伸展到自由长度（仅视觉）

        # 3. anti-roll bars (front: wheels 0/1, rear: 2/3)
        for (iL, iR, axle) in ((0, 1, "front"), (2, 3, "rear")):
            wL, wR = self.wheels[iL], self.wheels[iR]
            if wL["contact"] and wR["contact"]:
                k = c["suspension"][axle]["antiRollStiffness"]
                diff = (wL["susp"]["restLength"] - wL["len"]) - (wR["susp"]["restLength"] - wR["len"])
                F = k * diff
                wL["Fz"] = max(0.0, wL["Fz"] + F)
                wR["Fz"] = max(0.0, wR["Fz"] - F)

        # 4. contact frames & velocities
        v_fwd_body = dot(self.vel, fwd)
        for w in self.wheels:
            if not w["contact"]:
                continue
            n = w["normal"]
            st = w["steer"]
            heading = add(mul(fwd, math.cos(st)), mul(left, math.sin(st)))
            f = norm(sub(heading, mul(n, dot(heading, n))))
            l = cross(n, f)
            r = sub(w["contactPoint"], self.pos)
            vc = add(self.vel, cross(self.angvel, r))
            w["f"], w["l"], w["r"] = f, l, r
            w["vx"] = dot(vc, f)
            w["vy"] = dot(vc, l)

        # 5. gearbox (auto) and engine rpm
        eng = c["engine"]; gb = c["gearbox"]
        self.sinceShift += dt
        if self.shiftTimer > 0:
            self.shiftTimer = max(0.0, self.shiftTimer - dt)
        drv = self.driven()
        w_drv = sum(self.wheels[i]["omega"] for i in drv) / len(drv)
        throttle = inp["throttle"]; brake = inp["brake"]
        # auto reverse logic
        speed = v_fwd_body
        if a["autoGear"]:
            if self.gear > 0 and speed < 0.5 and brake > 0.5 and throttle < 0.05:
                self.revTimer = getattr(self, "revTimer", 0.0) + dt
                if self.revTimer > 0.3:
                    self.gear = -1; self.revTimer = 0.0
            elif self.gear < 0 and speed > -0.5 and throttle > 0.5 and brake < 0.05:
                self.revTimer = getattr(self, "revTimer", 0.0) + dt
                if self.revTimer > 0.3:
                    self.gear = 1; self.revTimer = 0.0
            else:
                self.revTimer = 0.0
            if self.gear < 0:   # 倒挡时刹车键=油门，油门键=刹车
                throttle, brake = inp["brake"], inp["throttle"]
        ratio = self.total_ratio(self.gear)
        rpm_wheels = abs(w_drv * ratio) * 60.0 / (2 * math.pi)
        rpm = max(rpm_wheels, eng["idleRpm"] + throttle * (eng["launchRpm"] - eng["idleRpm"]))
        rpm = min(rpm, eng["limiterRpm"] + 200)
        self.rpm = rpm
        if a["autoGear"] and self.gear > 0 and self.shiftTimer == 0 and self.sinceShift >= gb["minShiftInterval"]:
            if rpm_wheels > gb["autoUpRpm"] and self.gear < len(gb["ratios"]):
                self.gear += 1; self.shiftTimer = gb["shiftTime"]; self.sinceShift = 0.0
            elif rpm_wheels < gb["autoDownRpm"] and self.gear > 1:
                self.gear -= 1; self.shiftTimer = gb["shiftTime"]; self.sinceShift = 0.0
        if not a["autoGear"] and inp.get("shift", 0) != 0 and self.shiftTimer == 0:
            ng = clamp(self.gear + inp["shift"], -1, len(gb["ratios"]))
            if ng < 0 and speed > 2.0:  # 速度 > 2 m/s 不允许挂倒挡
                ng = 0
            if ng != self.gear:
                self.gear = ng; self.shiftTimer = gb["shiftTime"]; self.sinceShift = 0.0
        # rev limiter with 200 rpm hysteresis
        if rpm >= eng["limiterRpm"]: self.limiterCut = True
        elif rpm < eng["limiterRpm"] - 200: self.limiterCut = False
        # TCS
        if a["tcs"]:
            maxk = max((self.wheels[i]["kappa"] for i in drv), default=0.0)
            if maxk > self.kp * 1.2: self.tcsScale = max(0.2, self.tcsScale - 6.0 * dt)
            else: self.tcsScale = min(1.0, self.tcsScale + 2.0 * dt)
        else:
            self.tcsScale = 1.0
        thr_eff = throttle * self.tcsScale
        if self.limiterCut: thr_eff = 0.0
        Te = thr_eff * torque_curve(eng["torqueCurve"], rpm) - (1 - thr_eff) * eng["engineBrakeNmPer1000Rpm"] * rpm / 1000.0
        if self.shiftTimer > 0 or self.gear == 0:
            T_axle = 0.0
        else:
            T_axle = Te * ratio * gb["efficiency"]
            if rpm_wheels < eng["idleRpm"] and thr_eff < 0.01:
                T_axle = 0.0   # 怠速以下且无油门：离合脱开，不产生发动机制动
        # driveline reflected inertia per driven wheel
        engaged = self.shiftTimer == 0 and self.gear != 0
        I_refl = eng["inertia"] * ratio * ratio / len(drv) if engaged else 0.0

        # 6. torque distribution
        Tw = [0.0, 0.0, 0.0, 0.0]
        dt_ = c["drivetrain"]
        if dt_["type"] == "FWD":
            Tw[0], Tw[1] = diff_split(T_axle, self.wheels[0]["omega"], self.wheels[1]["omega"], dt_["diffFront"])
        elif dt_["type"] == "RWD":
            Tw[2], Tw[3] = diff_split(T_axle, self.wheels[2]["omega"], self.wheels[3]["omega"], dt_["diffRear"])
        else:
            wf = 0.5 * (self.wheels[0]["omega"] + self.wheels[1]["omega"])
            wr = 0.5 * (self.wheels[2]["omega"] + self.wheels[3]["omega"])
            # center: base split frontSplit, plus lock (same formula, around the base split)
            dc = dt_["diffCenter"]
            Tf = T_axle * dt_["frontSplit"]; Tr = T_axle * (1 - dt_["frontSplit"])
            if dc["type"] == "lsd":
                lim = dc["preloadNm"] + dc["lockRatio"] * abs(T_axle)
                dT = clamp(dc["lockGain"] * (wr - wf), -lim, lim)
                Tf += 0.5 * dT; Tr -= 0.5 * dT
            Tw[0], Tw[1] = diff_split(Tf, self.wheels[0]["omega"], self.wheels[1]["omega"], dt_["diffFront"])
            Tw[2], Tw[3] = diff_split(Tr, self.wheels[2]["omega"], self.wheels[3]["omega"], dt_["diffRear"])

        # 7. brakes + ABS + ESC
        br = c["brakes"]
        Tb = [brake * br["maxTorque"] * br["frontBias"] / 2] * 2 + [brake * br["maxTorque"] * (1 - br["frontBias"]) / 2] * 2
        hb = inp.get("handbrake", 0.0)
        Tb[2] += hb * br["handbrakeTorque"] / 2; Tb[3] += hb * br["handbrakeTorque"] / 2
        for i, w in enumerate(self.wheels):
            # ABS：每轮一个刹车系数 absScale ∈ [0.1, 1]
            if a["abs"] and brake > 0 and w["contact"]:
                if w["kappa"] < -self.kp:
                    w["absScale"] = max(0.1, w["absScale"] - 12.0 * dt)
                elif w["kappa"] > -0.7 * self.kp:
                    w["absScale"] = min(1.0, w["absScale"] + 4.0 * dt)
            else:
                w["absScale"] = 1.0
            if not (i >= 2 and hb > 0):
                Tb[i] *= w["absScale"]
        if a["esc"] and v_fwd_body > 5.0:
            yaw_rate = dot(self.angvel, up)
            target = v_fwd_body * delta / (Lwb * (1 + 0.0025 * v_fwd_body * v_fwd_body))
            err = yaw_rate - target
            if abs(err) > 0.12 and abs(yaw_rate) > abs(target):
                # oversteer → brake outer front; outer = right wheel if turning left(yaw_rate>0)
                idx = 1 if yaw_rate > 0 else 0
                Tb[idx] += min(1500.0, 4000.0 * (abs(err) - 0.12))
                self.tcsScale = min(self.tcsScale, 0.6)

        # 8. tyres: slip state, forces, wheel spin
        R = c["wheel"]["radius"]; tire = c["tire"]
        Fsum = [0.0, -c["mass"] * G, 0.0]
        Tsum = [0.0, 0.0, 0.0]
        for i, w in enumerate(self.wheels):
            Iw = c["wheel"]["inertia"] + (I_refl if i in drv else 0.0)
            if w["contact"]:
                vx, vy = w["vx"], w["vy"]
                sx_, rx = tire["relaxLon"], tire["relaxLat"]
                w["kappa"] = (w["kappa"] + dt * (w["omega"] * R - vx) / sx_) / (1 + dt * abs(vx) / sx_)
                w["beta"] = (w["beta"] + dt * (-vy) / rx) / (1 + dt * abs(vx) / rx)
                w["kappa"] = clamp(w["kappa"], -1.5, 1.5)
                w["beta"] = clamp(w["beta"], -1.5, 1.5)
                alpha = math.atan(w["beta"])
                surf = SURFACES[w["surface"]]
                Fx, Fy = tyre_forces(w["kappa"], alpha, w["Fz"], tire, surf["mu"], self.kp, self.ap)
                w["Fx"], w["Fy"] = Fx, Fy
                rr = (tire["rollingResistance"] + surf["rolling"]) * w["Fz"]
                Tfree = Tw[i] - Fx * R - rr * R * sign(w["omega"])
                F = add(add(mul(up, w["Fz"]), mul(w["f"], Fx)), mul(w["l"], Fy))
                # rolling resistance as a force at contact (opposes vx)
                F = add(F, mul(w["f"], -rr * clamp(vx / 0.5, -1, 1)))
                Fsum = add(Fsum, F)
                Tsum = add(Tsum, cross(w["r"], F))
            else:
                w["kappa"] = 0.0; w["beta"] = 0.0; w["Fx"] = w["Fy"] = 0.0
                Tfree = Tw[i]
            om = w["omega"] + dt * Tfree / Iw
            maxb = Tb[i] * dt / Iw
            if abs(om) <= maxb: om = 0.0
            else: om -= sign(om) * maxb
            w["omega"] = clamp(om, -400.0, 400.0)
            w["rot"] = (w["rot"] + w["omega"] * dt) % (2 * math.pi)

        # 9. aero
        v2 = dot(self.vel, self.vel)
        if v2 > 1e-6:
            Fsum = add(Fsum, mul(norm(self.vel), -0.5 * RHO * c["aero"]["cdA"] * v2))
        vf = max(0.0, v_fwd_body)
        dF = 0.5 * RHO * c["aero"]["clAFront"] * vf * vf
        dR = 0.5 * RHO * c["aero"]["clARear"] * vf * vf
        pf = q_rot(q, [0.0, 0.0, c["wheels"][0]["mount"][2]])
        pr = q_rot(q, [0.0, 0.0, c["wheels"][2]["mount"][2]])
        for (p, d) in ((pf, dF), (pr, dR)):
            Fd = mul(up, -d)
            Fsum = add(Fsum, Fd); Tsum = add(Tsum, cross(p, Fd))

        # 10. integrate (semi-implicit Euler)
        m = c["mass"]
        self.vel = add(self.vel, mul(Fsum, dt / m))
        I = c["inertia"]
        wb = q_inv_rot(q, self.angvel)
        tb = q_inv_rot(q, Tsum)
        Iw_ = [I["x"] * wb[0], I["y"] * wb[1], I["z"] * wb[2]]
        gyro = cross(wb, Iw_)
        wb = [wb[0] + dt * (tb[0] - gyro[0]) / I["x"],
              wb[1] + dt * (tb[1] - gyro[1]) / I["y"],
              wb[2] + dt * (tb[2] - gyro[2]) / I["z"]]
        self.angvel = q_rot(q, wb)
        self.pos = add(self.pos, mul(self.vel, dt))
        wq = [0.0] + self.angvel
        dq = q_mul(wq, q)
        self.q = q_norm([q[k] + 0.5 * dt * dq[k] for k in range(4)])
        self.time += dt

    # --- telemetry
    def speed_kmh(self):
        return dot(self.vel, q_rot(self.q, [0, 0, 1])) * 3.6


def load(id):
    import os
    here = os.path.dirname(os.path.abspath(__file__))
    return json.load(open(os.path.join(here, "..", "src", "data", "cars", f"{id}.json"), encoding="utf-8"))
