/**
 * Builds a company out of published federal data.
 *
 * Nothing here is invented. Occupation mix comes from the BLS staffing pattern
 * for NAICS 5415, wages from the BLS wage distribution for that occupation in
 * that metro, and the technologies each person knows from O*NET's mapping of
 * technologies to occupations. The only modelling choices are how people are
 * spread across offices and where in the wage distribution each person sits;
 * both are stated in the README.
 */
import type { Func, Metro, Model, Occupation } from "./model";
import type { Seniority } from "./titles";

export interface Employee {
  id: number;
  occ: Occupation;
  func: Func;
  metro: Metro;
  salary: number;
  /** Position in the occupation's wage distribution, 0-1. */
  percentile: number;
  level: string;
  tech: string[];
  team: string;
  isUser: boolean;
}

export interface Company {
  employees: Employee[];
  offices: Metro[];
  payroll: number;
  user: Employee;
}

/** Deterministic RNG so the same title always produces the same company. */
function rng(seed: string): () => number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function weightedPick<T>(items: T[], weights: number[], r: number): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let x = r * total;
  for (let i = 0; i < items.length; i++) {
    x -= weights[i]!;
    if (x <= 0) return items[i]!;
  }
  return items[items.length - 1]!;
}

/** Interpolate a salary at a percentile through the five published points. */
function wageAt(occ: Occupation, p: number, scale: number): number {
  const pts: Array<[number, number]> = [
    [0.1, occ.nat.p10],
    [0.25, occ.nat.p25],
    [0.5, occ.nat.p50],
    [0.75, occ.nat.p75],
    [0.9, occ.nat.p90],
  ];
  const q = Math.min(0.97, Math.max(0.03, p));
  let val: number;
  if (q <= 0.1) val = occ.nat.p10 * (0.72 + 2.8 * q);
  else if (q >= 0.9) val = occ.nat.p90 * (1 + (q - 0.9) * 1.4);
  else {
    let i = 0;
    while (i < pts.length - 2 && q > pts[i + 1]![0]) i++;
    const [x0, y0] = pts[i]!;
    const [x1, y1] = pts[i + 1]!;
    val = y0 + ((q - x0) / (x1 - x0)) * (y1 - y0);
  }
  return Math.round((val * scale) / 500) * 500;
}

/** Wage scale for an occupation in a metro, relative to its national median. */
function metroScale(occ: Occupation, metro: Metro, model: Model): number {
  const local = occ.metro[metro.id];
  if (local) return local / occ.nat.p50;
  // No published figure for this occupation here: fall back to the metro's
  // software-developer wage relative to the national one, which is the best
  // available proxy for local pay levels in this industry.
  const dev = model.occupations.find((o) => o.soc === "15-1252");
  return dev ? metro.devMedian / dev.nat.p50 : 1;
}

const OFFICE_WEIGHTS = [0.34, 0.24, 0.18, 0.13, 0.11];

export interface BuildOptions {
  model: Model;
  soc: string;
  metroId: string;
  seniority: Seniority;
  headcount: number;
  /** Overrides the user's computed salary, for the "what if I cost less" rerun. */
  userSalary?: number;
}

export function buildCompany(opts: BuildOptions): Company {
  const { model, soc, metroId, seniority, headcount } = opts;
  const r = rng(`${soc}|${metroId}|${headcount}`);

  const userMetro = model.metros.find((m) => m.id === metroId) ?? model.metros[0]!;
  const userOcc =
    model.occupations.find((o) => o.soc === soc) ?? model.occupations[0]!;

  // Offices: the user's, plus four others drawn with probability proportional to
  // the square root of local software employment. Raw employment weighting would
  // put every office in the same handful of expensive hubs; the square root
  // flattens it to something closer to how companies actually distribute sites.
  const offices: Metro[] = [userMetro];
  const pool = model.metros.filter((m) => m.id !== userMetro.id);
  const weights = pool.map((m) => Math.sqrt(Math.max(1, m.devMedian / 1000)));
  while (offices.length < 5 && pool.length) {
    const pick = weightedPick(pool, weights, r());
    const i = pool.indexOf(pick);
    pool.splice(i, 1);
    weights.splice(i, 1);
    offices.push(pick);
  }

  const employees: Employee[] = [];
  const occShares = model.occupations.map((o) => o.share);

  for (let i = 0; i < headcount; i++) {
    const occ = weightedPick(model.occupations, occShares, r());
    const metro = weightedPick(offices, OFFICE_WEIGHTS.slice(0, offices.length), r());
    // Most people sit in the middle of their band. Averaging three draws gives a
    // centre-weighted spread without pretending to a distribution we don't have.
    const percentile = (r() + r() + r()) / 3;
    const salary = wageAt(occ, percentile, metroScale(occ, metro, model));
    employees.push({
      id: i,
      occ,
      func: occ.func,
      metro,
      salary,
      percentile,
      level: levelName(percentile, occ.func),
      tech: pickTech(occ, r),
      team: `${occ.func}-${metro.id}`,
      isUser: false,
    });
  }

  const userScale = metroScale(userOcc, userMetro, model);
  const user: Employee = {
    id: -1,
    occ: userOcc,
    func: userOcc.func,
    metro: userMetro,
    salary: opts.userSalary ?? wageAt(userOcc, seniority.percentile, userScale),
    percentile: seniority.percentile,
    // Deliberately the generated taxonomy rather than the label the user picked,
    // so they group with everyone else in the by-level breakdown instead of
    // becoming a category of one.
    level: levelName(seniority.percentile, userOcc.func),
    tech: pickTech(userOcc, rng(`user|${soc}`)),
    team: `${userOcc.func}-${userMetro.id}`,
    isUser: true,
  };
  // Drop the user in near the middle of the grid rather than at the end, so the
  // cut animation doesn't always reach them last.
  employees.splice(Math.floor(headcount * 0.42), 0, user);
  employees.forEach((e, i) => (e.id = i));

  return {
    employees,
    offices,
    payroll: employees.reduce((a, e) => a + e.salary, 0),
    user,
  };
}

/**
 * Two or three technologies per person. The first is drawn from the front of the
 * occupation's list (its common tools) and the rest from further down, so a few
 * technologies end up with a single holder in the company — which is what makes
 * the solver's coverage constraint bite.
 */
function pickTech(occ: Occupation, r: () => number): string[] {
  const list = occ.tech;
  if (!list.length) return [];
  const out = new Set<string>();
  out.add(list[Math.floor(r() * Math.min(4, list.length))]!);
  const extra = r() < 0.5 ? 1 : 2;
  for (let i = 0; i < extra; i++) {
    const idx = Math.min(list.length - 1, Math.floor(Math.pow(r(), 0.55) * list.length));
    out.add(list[idx]!);
  }
  return [...out];
}

function levelName(p: number, func: Func): string {
  if (func === "leadership") return p > 0.85 ? "Executive" : "Manager";
  if (p < 0.25) return "Junior";
  if (p < 0.55) return "Mid-level";
  if (p < 0.8) return "Senior";
  return "Staff / principal";
}

export const LEVEL_ORDER = ["Junior", "Mid-level", "Senior", "Staff / principal", "Manager", "Executive"];
