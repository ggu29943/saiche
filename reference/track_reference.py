"""
参考赛道几何实现（Reference track geometry）。TypeScript 版必须逐步对应，并通过 golden 测试。
只依赖 Python 标准库。
坐标：世界 Y 向上；赛道“左侧”= 沿行驶方向的左手边。
"""
import json, math

DENSE_PER_SEGMENT = 200   # 每段 Catmull-Rom 采样数
SAMPLE_STEP = 2.0         # 重采样间距（米，实际为 L/round(L/2)）
CELL = 25.0               # 空间网格尺寸（米）
KERB_WIDTH = 1.0
KERB_CURVATURE = 1.0 / 150.0
DRAIN_SLOPE = 0.02        # 路肩外每米下降 2 cm

def _tj(ti, a, b):
    d = math.sqrt((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2 + (b[2] - a[2]) ** 2)
    return ti + max(d, 1e-6) ** 0.5

def _lerp(a, b, wa, wb):
    return [a[k] * wa + b[k] * wb for k in range(len(a))]

def _cr(p0, p1, p2, p3, n):
    """centripetal Catmull-Rom（knot 只按 xyz 距离），对 5 个通道 [x,y,z,hw,bank] 同权插值"""
    t0 = 0.0; t1 = _tj(t0, p0, p1); t2 = _tj(t1, p1, p2); t3 = _tj(t2, p2, p3)
    out = []
    for k in range(n):
        t = t1 + (t2 - t1) * k / n
        a1 = _lerp(p0, p1, (t1 - t) / (t1 - t0), (t - t0) / (t1 - t0))
        a2 = _lerp(p1, p2, (t2 - t) / (t2 - t1), (t - t1) / (t2 - t1))
        a3 = _lerp(p2, p3, (t3 - t) / (t3 - t2), (t - t2) / (t3 - t2))
        b1 = _lerp(a1, a2, (t2 - t) / (t2 - t0), (t - t0) / (t2 - t0))
        b2 = _lerp(a2, a3, (t3 - t) / (t3 - t1), (t - t1) / (t3 - t1))
        out.append(_lerp(b1, b2, (t2 - t) / (t2 - t1), (t - t1) / (t2 - t1)))
    return out

class Track:
    def __init__(self, data):
        self.data = data
        cps = [[p["x"], p["y"], p["z"], p["halfWidth"], p["bankDeg"]] for p in data["controlPoints"]]
        n = len(cps)
        dense = []
        for i in range(n):
            dense += _cr(cps[(i - 1) % n], cps[i], cps[(i + 1) % n], cps[(i + 2) % n], DENSE_PER_SEGMENT)
        dense.append(dense[0])
        cum = [0.0]
        for i in range(1, len(dense)):
            a, b = dense[i - 1], dense[i]
            cum.append(cum[-1] + math.sqrt((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2 + (b[2] - a[2]) ** 2))
        L = cum[-1]
        m = int(round(L / SAMPLE_STEP))
        step = L / m
        self.length = L; self.step = step; self.count = m
        S = []
        j = 0
        for i in range(m):
            s = i * step
            while cum[j + 1] < s:
                j += 1
            f = (s - cum[j]) / (cum[j + 1] - cum[j])
            S.append(_lerp(dense[j], dense[j + 1], 1 - f, f))
        # 派生量
        self.pos, self.hw, self.bank, self.tan, self.left, self.s = [], [], [], [], [], []
        for i in range(m):
            self.pos.append(S[i][0:3]); self.hw.append(S[i][3]); self.bank.append(math.radians(S[i][4]))
            self.s.append(i * step)
        for i in range(m):
            a, b = self.pos[(i - 1) % m], self.pos[(i + 1) % m]
            t = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
            l = math.sqrt(t[0] ** 2 + t[1] ** 2 + t[2] ** 2); t = [c / l for c in t]
            self.tan.append(t)
            h = math.sqrt(t[0] ** 2 + t[2] ** 2)
            self.left.append([t[2] / h, 0.0, -t[0] / h])
        # 曲率（xz 平面，带符号，左弯为正），9 点滑动平均
        raw = []
        for i in range(m):
            a0 = math.atan2(self.tan[(i - 1) % m][0], self.tan[(i - 1) % m][2])
            a1 = math.atan2(self.tan[(i + 1) % m][0], self.tan[(i + 1) % m][2])
            d = (a1 - a0 + math.pi) % (2 * math.pi) - math.pi
            raw.append(d / (2 * step))
        self.curv = [sum(raw[(i + k) % m] for k in range(-4, 5)) / 9.0 for i in range(m)]
        self.kerb = [abs(c) > KERB_CURVATURE for c in self.curv]
        # 空间网格
        self.grid = {}
        for i in range(m):
            key = (math.floor(self.pos[i][0] / CELL), math.floor(self.pos[i][2] / CELL))
            self.grid.setdefault(key, []).append(i)

    def runoff_surface(self, s):
        for o in self.data.get("runoffOverrides", []):
            if o["from"] <= s <= o["to"]:
                return o["surface"]
        return self.data["runoffSurface"]

    def nearest_index(self, x, z):
        cx, cz = math.floor(x / CELL), math.floor(z / CELL)
        best, bi = 1e18, -1
        for dx in (-1, 0, 1):
            for dz in (-1, 0, 1):
                for i in self.grid.get((cx + dx, cz + dz), ()):
                    p = self.pos[i]
                    d = (p[0] - x) ** 2 + (p[2] - z) ** 2
                    if d < best or (d == best and i < bi):
                        best, bi = d, i
        return bi

    def project(self, x, z):
        """返回 dict(i, f, s, d, y_center, hw, bank) ；找不到（离中心线 >25m）返回 None"""
        i = self.nearest_index(x, z)
        if i < 0:
            return None
        m = self.count
        best = None
        for (a, b) in (((i - 1) % m, i), (i, (i + 1) % m)):
            A, B = self.pos[a], self.pos[b]
            ex, ez = B[0] - A[0], B[2] - A[2]
            f = ((x - A[0]) * ex + (z - A[2]) * ez) / (ex * ex + ez * ez)
            f = min(1.0, max(0.0, f))
            px, pz = A[0] + ex * f, A[2] + ez * f
            d2 = (x - px) ** 2 + (z - pz) ** 2
            if best is None or d2 < best[0]:
                best = (d2, a, b, f)
        _, a, b, f = best
        P = _lerp(self.pos[a], self.pos[b], 1 - f, f)
        L = _lerp(self.left[a], self.left[b], 1 - f, f)
        ll = math.sqrt(L[0] ** 2 + L[2] ** 2); L = [L[0] / ll, 0.0, L[2] / ll]
        s = (self.s[a] + f * self.step) % self.length
        return {"a": a, "f": f, "s": s, "d": (x - P[0]) * L[0] + (z - P[2]) * L[2], "yc": P[1],
                "hw": self.hw[a] * (1 - f) + self.hw[b] * f, "bank": self.bank[a] * (1 - f) + self.bank[b] * f,
                "kerb": self.kerb[a] or self.kerb[b]}

    def height(self, x, z):
        p = self.project(x, z)
        if p is None:
            return None
        d, hw = p["d"], p["hw"]
        dc = max(-hw, min(hw, d))
        return p["yc"] + dc * math.tan(p["bank"]) - max(0.0, abs(d) - hw) * DRAIN_SLOPE

    def query(self, x, z):
        """物理用：返回 (height, normal, surface)"""
        p = self.project(x, z)
        if p is None:
            return 0.0, [0.0, 1.0, 0.0], "grass"
        e = 0.25
        hxp, hxm = self.height(x + e, z), self.height(x - e, z)
        hzp, hzm = self.height(x, z + e), self.height(x, z - e)
        h0 = self.height(x, z)
        hxp = h0 if hxp is None else hxp; hxm = h0 if hxm is None else hxm
        hzp = h0 if hzp is None else hzp; hzm = h0 if hzm is None else hzm
        n = [-(hxp - hxm) / (2 * e), 1.0, -(hzp - hzm) / (2 * e)]
        l = math.sqrt(n[0] ** 2 + n[1] ** 2 + n[2] ** 2); n = [c / l for c in n]
        ad, hw = abs(p["d"]), p["hw"]
        if ad <= hw: surf = "asphalt"
        elif ad <= hw + KERB_WIDTH and p["kerb"]: surf = "kerb"
        else: surf = self.runoff_surface(p["s"])
        return h0, n, surf

    def barrier_offset(self, i):
        return self.hw[i] + self.data["runoffWidth"]


def golden(path):
    t = Track(json.load(open(path, encoding="utf-8")))
    probes = []
    for (i, d) in ((0, 0.0), (37, 3.0), (211, -5.5), (400, 6.5), (777, -2.0), (t.count - 3, 9.0)):
        P, L = t.pos[i], t.left[i]
        x, z = P[0] + L[0] * d, P[2] + L[2] * d
        h, n, s = t.query(x, z)
        probes.append({"x": x, "z": z, "height": h, "normal": n, "surface": s, "progress": t.project(x, z)["s"]})
    return {"id": t.data["id"], "length": t.length, "count": t.count,
            "samples": {str(i): {"pos": t.pos[i], "left": t.left[i], "hw": t.hw[i], "curv": t.curv[i], "kerb": t.kerb[i]}
                        for i in (0, 1, 100, 500, t.count - 1)},
            "kerbCount": sum(t.kerb), "probes": probes}
