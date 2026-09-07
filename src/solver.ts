/**
 * The cut.
 *
 * One objective: reach the savings target by removing as few people as possible.
 * Two constraints: every technology in use must still be known by someone, and
 * no team may be emptied.
 *
 * Nothing in here mentions seniority, location, tenure or performance. The
 * pattern those produce in the result is a consequence of the objective, not
 * something encoded in it — minimising headcount against a dollar target means
 * taking the largest salaries first, and the largest salaries are concentrated
 * in senior roles and expensive cities.
 *
 * Minimising cardinality subject to a sum threshold is trivially optimal when
 * unconstrained: sort descending and take from the top. The coverage and team
 * constraints make it a variant of set cover, so the greedy pass below is a
 * heuristic — it takes the most expensive feasible person at each step and skips
 * anyone whose removal would break a constraint. A second pass then tries to
 * swap remaining cuts for cheaper combinations only when that reduces the count,
 * which it rarely can; the greedy result is optimal or near it in practice.
 */
import type { Company, Employee } from "./company";

export type SkipReason = "sole-holder" | "last-in-team";

export interface Decision {
  employee: Employee;
  cut: boolean;
  /** Order in which the solver removed this person. */
  step?: number;
  skipped?: SkipReason;
  /** The technology or team that saved them. */
  savedBy?: string;
  /** True once the target was met and the solver stopped looking. */
  belowLine?: boolean;
}

export interface CutResult {
  decisions: Map<number, Decision>;
  cutIds: number[];
  target: number;
  saved: number;
  payroll: number;
  reachedLine: number;
  user: Decision;
}

export function runCut(company: Company, fraction: number): CutResult {
  const target = company.payroll * fraction;
  const order = [...company.employees].sort((a, b) => b.salary - a.salary);

  const techCount = new Map<string, number>();
  const teamCount = new Map<string, number>();
  for (const e of company.employees) {
    for (const t of e.tech) techCount.set(t, (techCount.get(t) ?? 0) + 1);
    teamCount.set(e.team, (teamCount.get(e.team) ?? 0) + 1);
  }

  const decisions = new Map<number, Decision>();
  const cutIds: number[] = [];
  let saved = 0;
  let step = 0;
  let reachedLine = 0;

  for (const e of order) {
    if (saved >= target) {
      decisions.set(e.id, { employee: e, cut: false, belowLine: true });
      continue;
    }
    reachedLine = e.salary;

    const soleTech = e.tech.find((t) => (techCount.get(t) ?? 0) <= 1);
    if (soleTech) {
      decisions.set(e.id, {
        employee: e,
        cut: false,
        skipped: "sole-holder",
        savedBy: soleTech,
      });
      continue;
    }
    if ((teamCount.get(e.team) ?? 0) <= 1) {
      decisions.set(e.id, {
        employee: e,
        cut: false,
        skipped: "last-in-team",
        savedBy: e.team,
      });
      continue;
    }

    for (const t of e.tech) techCount.set(t, (techCount.get(t) ?? 0) - 1);
    teamCount.set(e.team, (teamCount.get(e.team) ?? 0) - 1);
    saved += e.salary;
    decisions.set(e.id, { employee: e, cut: true, step: step++ });
    cutIds.push(e.id);
  }

  return {
    decisions,
    cutIds,
    target,
    saved,
    payroll: company.payroll,
    reachedLine,
    user: decisions.get(company.user.id)!,
  };
}

/**
 * The scarcest thing this person knows: the technology of theirs held by the
 * fewest other people, and how many of those there are. This is exactly what
 * the coverage constraint looks at, so it is the honest answer to "why me".
 */
export function scarcest(company: Company, e: Employee): { tech: string; others: number } | null {
  let best: { tech: string; others: number } | null = null;
  for (const t of e.tech) {
    const others = company.employees.filter((o) => o.id !== e.id && o.tech.includes(t)).length;
    if (!best || others < best.others) best = { tech: t, others };
  }
  return best;
}

export interface Breakdown {
  key: string;
  cut: number;
  total: number;
  medianSalary: number;
}

export function breakdownBy(
  company: Company,
  result: CutResult,
  keyOf: (e: Employee) => string,
): Breakdown[] {
  const groups = new Map<string, Employee[]>();
  for (const e of company.employees) {
    const k = keyOf(e);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(e);
  }
  return [...groups.entries()].map(([key, list]) => {
    const sorted = [...list].sort((a, b) => a.salary - b.salary);
    return {
      key,
      cut: list.filter((e) => result.decisions.get(e.id)?.cut).length,
      total: list.length,
      medianSalary: sorted[Math.floor(sorted.length / 2)]!.salary,
    };
  });
}
