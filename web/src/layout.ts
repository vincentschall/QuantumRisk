/**
 * Board layout: sector boxes, cluster packages and routed connections, computed once per map.
 * Traces and buses use 45° PCB routes; for each one several shapes are tried and the one that
 * avoids sector boxes and overlapping earlier routes wins. Power cables run around the outside of
 * the board, each on its own lane, going the way round that shares the least edge with other cables.
 */
import type { BoardMap } from "./net.js";

export const W = 1260;
export const H = 920;
export const NH = 46;
export const GUTTER = 40; // margin around the board; cables run in it

export type Pt = [number, number];
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const sectorWidth = (name: string, stronghold: boolean) => Math.max(86, Math.round(name.length * 6.9 + 22 + (stronghold ? 26 : 0)));

export interface Route {
  a: string;
  b: string;
  kind: string;
  d: string;
}

export interface Package {
  name: string;
  bonus: number;
  rect: Rect;
}

export interface Layout {
  rects: Map<string, Rect>;
  packages: Package[];
  housings: { sector: string; rect: Rect; label: string; labelBelow: boolean }[];
  routes: Route[];
}

const CLUSTER_PAD: Record<string, [number, number]> = { CPU: [28, 30], GPU: [30, 26], RAM: [28, 30], SSD: [26, 22] };

export function layout(map: BoardMap): Layout {
  const P = map.positions;
  const strong = new Set(map.strongholds);
  const rects = new Map<string, Rect>();
  for (const [s, [x, y]] of Object.entries(P)) {
    const w = sectorWidth(s, strong.has(s));
    rects.set(s, { x: x - w / 2, y: y - NH / 2, w, h: NH });
  }

  const packages: Package[] = [];
  const housings: Layout["housings"] = [];
  for (const [name, c] of Object.entries(map.clusters)) {
    const pad = CLUSTER_PAD[name];
    if (!pad) {
      for (const s of c.sectors) {
        const r = rects.get(s)!;
        housings.push({ sector: s, rect: { x: r.x - 12, y: r.y - 12, w: r.w + 24, h: r.h + 24 }, label: `${name} +${c.bonus}`, labelBelow: false });
      }
      continue;
    }
    const rs = c.sectors.map((s) => rects.get(s)!);
    const x0 = Math.min(...rs.map((r) => r.x)) - pad[0];
    const y0 = Math.min(...rs.map((r) => r.y)) - pad[1];
    const x1 = Math.max(...rs.map((r) => r.x + r.w)) + pad[0];
    const y1 = Math.max(...rs.map((r) => r.y + r.h)) + pad[1];
    packages.push({ name, bonus: c.bonus, rect: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } });
  }

  const routes: Route[] = [];
  const placed: Seg[] = [];
  // Buses first (they are the important inter-cluster links), then traces.
  const order = [...map.connections].sort((p, q) => rank(p[2]) - rank(q[2]));
  const usedPerimeter: [number, number][] = [];
  let lane = 0;
  for (const [a, b, kind] of order) {
    if (kind === "cable") {
      const long = Math.hypot(P[a]![0] - P[b]![0], P[a]![1] - P[b]![1]) >= 360;
      routes.push({ a, b, kind, d: cableRoute(P[a]!, P[b]!, long ? lane++ : 0, usedPerimeter) });
      continue;
    }
    const pts = bestTrace(P[a]!, P[b]!, a, b, rects, placed);
    for (let i = 1; i < pts.length; i++) placed.push([pts[i - 1]!, pts[i]!]);
    routes.push({ a, b, kind, d: "M" + pts.map((p) => p.join(",")).join(" L") });
  }
  // Put each housing label on the side (above or below) that no connection leaves from.
  const leavesUp = (s: string) =>
    routes.some((r) => {
      if (r.a !== s && r.b !== s) return false;
      const nums = r.d.match(/-?[\d.]+/g)!.map(Number);
      // The first point after the sector (for a reversed path the coordinate pairs come back as y, x).
      const [x0, y0, x1, y1] = r.a === s ? nums.slice(0, 4) : (([y, x, yb, xb]) => [x, y, xb, yb])(nums.slice(-4).reverse());
      return y1! - y0! < -Math.abs(x1! - x0!);
    });
  for (const h of housings) h.labelBelow = leavesUp(h.sector);
  return { rects, packages, housings, routes };
}

const rank = (k: string) => (k === "bus" ? 0 : k === "trace" ? 1 : 2);

type Seg = [Pt, Pt];

/** Candidate 45° routes from a to b. */
function candidates([x1, y1]: Pt, [x2, y2]: Pt): Pt[][] {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  const sx = Math.sign(dx);
  const sy = Math.sign(dy);
  if (ax === 0 || ay === 0) return [[[x1, y1], [x2, y2]]];
  // Right-angle routes are a fallback (penalised by their index) for when every 45° route collides.
  const elbows: Pt[][] = [
    [[x1, y1], [x2, y1], [x2, y2]],
    [[x1, y1], [x1, y2], [x2, y2]],
  ];
  return [...diagonals(), ...elbows];
  function diagonals(): Pt[][] {
  if (ax >= ay) {
    const run = ax - ay;
    return [
      [[x1, y1], [x1 + (sx * run) / 2, y1], [x2 - (sx * run) / 2, y2], [x2, y2]], // straight, diagonal, straight
      [[x1, y1], [x1 + sx * ay, y2], [x2, y2]], // diagonal first
      [[x1, y1], [x1 + sx * run, y1], [x2, y2]], // diagonal last
      [[x1, y1], [x1 + (sx * run) / 4, y1], [x2 - (sx * run * 3) / 4, y2], [x2, y2]],
      [[x1, y1], [x1 + (sx * run * 3) / 4, y1], [x2 - (sx * run) / 4, y2], [x2, y2]],
    ];
  }
  const run = ay - ax;
  return [
    [[x1, y1], [x1, y1 + (sy * run) / 2], [x2, y2 - (sy * run) / 2], [x2, y2]],
    [[x1, y1], [x2, y1 + sy * ax], [x2, y2]],
    [[x1, y1], [x1, y1 + sy * run], [x2, y2]],
    [[x1, y1], [x1, y1 + (sy * run) / 4], [x2, y2 - (sy * run * 3) / 4], [x2, y2]],
    [[x1, y1], [x1, y1 + (sy * run * 3) / 4], [x2, y2 - (sy * run) / 4], [x2, y2]],
  ];
  }
}

function bestTrace(pa: Pt, pb: Pt, a: string, b: string, rects: Map<string, Rect>, placed: Seg[]): Pt[] {
  let best: Pt[] = [];
  let bestScore = Infinity;
  candidates(pa, pb).forEach((pts, i) => {
    let score = i < 5 ? i * 0.5 : 40 + i; // prefer the symmetric 45° route; elbows only as a fallback
    for (let k = 1; k < pts.length; k++) {
      const seg: Seg = [pts[k - 1]!, pts[k]!];
      for (const [s, r] of rects) {
        if (s === a || s === b) continue;
        score += 1000 * clipLength(seg, inflate(r, 8));
      }
      for (const other of placed) score += 20 * overlap(seg, other, rects.get(a)!, rects.get(b)!);
    }
    if (score < bestScore) {
      bestScore = score;
      best = pts;
    }
  });
  return best;
}

const inflate = (r: Rect, m: number): Rect => ({ x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m });
const inside = ([x, y]: Pt, r: Rect) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

/** Length of a segment inside a rectangle (Liang–Barsky). */
function clipLength([[x1, y1], [x2, y2]]: Seg, r: Rect): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  let t0 = 0;
  let t1 = 1;
  const edges: [number, number][] = [
    [-dx, x1 - r.x],
    [dx, r.x + r.w - x1],
    [-dy, y1 - r.y],
    [dy, r.y + r.h - y1],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return 0;
    } else {
      const t = q / p;
      if (p < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
    }
  }
  return t1 > t0 ? (t1 - t0) * Math.hypot(dx, dy) : 0;
}

/** Length along which two segments run on top of each other (outside the endpoint boxes). */
function overlap(s: Seg, o: Seg, ra: Rect, rb: Rect): number {
  const [[x1, y1], [x2, y2]] = s;
  const len = Math.hypot(x2 - x1, y2 - y1);
  if (len === 0) return 0;
  const ux = (x2 - x1) / len;
  const uy = (y2 - y1) / len;
  const [[ox1, oy1], [ox2, oy2]] = o;
  const olen = Math.hypot(ox2 - ox1, oy2 - oy1);
  if (olen === 0) return 0;
  if (Math.abs(ux * (oy2 - oy1) - uy * (ox2 - ox1)) / olen > 0.05) return 0; // not parallel
  if (Math.abs((ox1 - x1) * uy - (oy1 - y1) * ux) > 24) return 0; // parallel but clearly apart
  const t1 = (ox1 - x1) * ux + (oy1 - y1) * uy;
  const t2 = (ox2 - x1) * ux + (oy2 - y1) * uy;
  const lo = Math.max(0, Math.min(t1, t2));
  const hi = Math.min(len, Math.max(t1, t2));
  if (hi <= lo) return 0;
  // Ignore the part hidden under the two sector boxes this route connects.
  let visible = 0;
  for (let t = lo; t < hi; t += 2) {
    const p: Pt = [x1 + ux * t, y1 + uy * t];
    if (!inside(p, ra) && !inside(p, rb)) visible += 2;
  }
  return visible;
}

/** Power cables: short ones hang directly; long ones run around the outside on their own lane. */
function cableRoute(a: Pt, b: Pt, lane: number, used: [number, number][]): string {
  if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 360) return curve(a, b);
  const g = 16 + lane * 10;
  const [L, T, R, B] = [-g, -g, W + g, H + g];
  const per = 2 * (R - L) + 2 * (B - T);
  const off = (lane % 3) * 10 - 10; // keep the stubs from the sectors apart
  const exit = ([x, y]: Pt): { pt: Pt; t: number; start: Pt } => {
    const d = [y, W - x, H - y, x];
    const side = d.indexOf(Math.min(...d));
    const xs = x + off;
    const ys = y + off;
    // `start` is under the sector box, so the visible stub is straight.
    if (side === 0) return { pt: [xs, T], t: xs - L, start: [xs, y] };
    if (side === 1) return { pt: [R, ys], t: R - L + (ys - T), start: [x, ys] };
    if (side === 2) return { pt: [xs, B], t: R - L + (B - T) + (R - xs), start: [xs, y] };
    return { pt: [L, ys], t: 2 * (R - L) + (B - T) + (B - ys), start: [x, ys] };
  };
  const corners: { pt: Pt; t: number }[] = [
    { pt: [L, T], t: 0 },
    { pt: [R, T], t: R - L },
    { pt: [R, B], t: R - L + (B - T) },
    { pt: [L, B], t: 2 * (R - L) + (B - T) },
  ];
  const ea = exit(a);
  const eb = exit(b);
  const cw = (eb.t - ea.t + per) % per;
  const walk = (forward: boolean) => {
    const span = forward ? cw : per - cw;
    const along = (c: { t: number }) => (forward ? (c.t - ea.t + per) % per : (ea.t - c.t + per) % per);
    const mid = corners.filter((c) => along(c) > 0 && along(c) < span).sort((x, y) => along(x) - along(y));
    // The stretch of perimeter this route covers, as a clockwise interval [start, start + len].
    const interval: [number, number] = forward ? [ea.t, span] : [eb.t, span];
    return { mid, span, interval };
  };
  const shared = ([s1, l1]: [number, number]) =>
    used.reduce((sum, [s2, l2]) => {
      let o = 0;
      for (const shift of [-per, 0, per]) o += Math.max(0, Math.min(s1 + l1, s2 + l2 + shift) - Math.max(s1, s2 + shift));
      return sum + o;
    }, 0);
  const options = [walk(true), walk(false)].map((w) => ({ ...w, cost: w.span + 4 * shared(w.interval) }));
  const pick = options[0]!.cost <= options[1]!.cost ? options[0]! : options[1]!;
  used.push(pick.interval);
  const pts = [ea.start, ea.pt, ...pick.mid.map((c) => c.pt), eb.pt, eb.start];
  return "M" + pts.map((p) => p.join(",")).join(" L");
}

/** Gentle curve from a to b, bowing away from the board centre. */
export function curve([x1, y1]: Pt, [x2, y2]: Pt): string {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  let nx = -(y2 - y1) * 0.18;
  let ny = (x2 - x1) * 0.18;
  if ((mx + nx - W / 2) ** 2 + (my + ny - H / 2) ** 2 < (mx - nx - W / 2) ** 2 + (my - ny - H / 2) ** 2) {
    nx = -nx;
    ny = -ny;
  }
  return `M${x1},${y1} Q${mx + nx},${my + ny} ${x2},${y2}`;
}
