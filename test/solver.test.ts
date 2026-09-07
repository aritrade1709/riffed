import { readFileSync } from "node:fs";
import type { Model } from "../src/model";
import { buildCompany } from "../src/company";
import { runCut } from "../src/solver";
import { seniorityByKey } from "../src/titles";

const model = JSON.parse(readFileSync("public/data/model.json", "utf8")) as Model;
const fails: string[] = [];
const check = (ok: boolean, msg: string) => { if (!ok) fails.push(msg); };

const socs = model.occupations.map((o) => o.soc);
const levels = ["junior", "mid", "senior", "staff", "manager", "exec"];

let runs = 0;
let cutShare = 0;
let headShare = 0;
const byLevel = new Map<string, [number, number]>();
const byCostQuartile = new Map<string, [number, number]>();

for (const soc of socs) {
  for (const metro of [model.metros[0]!, model.metros[12]!, model.metros[25]!]) {
    const level = seniorityByKey(levels[runs % levels.length]!);
    const company = buildCompany({ model, soc, metroId: metro.id, seniority: level, headcount: 399 });
    const result = runCut(company, 0.15);
    runs++;

    // --- invariants -------------------------------------------------------
    check(company.employees.length === 400, `headcount ${company.employees.length} != 400`);
    check(result.saved >= result.target * 0.999, `${soc}/${metro.short}: target missed`);

    const kept = company.employees.filter((e) => !result.decisions.get(e.id)?.cut);
    const keptTech = new Set(kept.flatMap((e) => e.tech));
    for (const t of new Set(company.employees.flatMap((e) => e.tech))) {
      check(keptTech.has(t), `${soc}/${metro.short}: technology "${t}" lost entirely`);
    }
    const keptTeams = new Set(kept.map((e) => e.team));
    for (const t of new Set(company.employees.map((e) => e.team))) {
      check(keptTeams.has(t), `${soc}/${metro.short}: team "${t}" emptied`);
    }
    check(result.cutIds.length < company.employees.length, "everyone was cut");
    check(new Set(result.cutIds).size === result.cutIds.length, "duplicate cut ids");

    cutShare += result.saved / result.payroll;
    headShare += result.cutIds.length / company.employees.length;

    for (const e of company.employees) {
      const cut = result.decisions.get(e.id)?.cut ? 1 : 0;
      const l = byLevel.get(e.level) ?? [0, 0];
      byLevel.set(e.level, [l[0] + cut, l[1] + 1]);
      const rank = company.offices
        .slice()
        .sort((a, b) => b.devMedian - a.devMedian)
        .findIndex((m) => m.id === e.metro.id);
      const bucket = rank <= 1 ? "expensive offices" : "cheaper offices";
      const c = byCostQuartile.get(bucket) ?? [0, 0];
      byCostQuartile.set(bucket, [c[0] + cut, c[1] + 1]);
    }
  }
}

const pct = ([c, t]: [number, number]) => (100 * c) / t;
console.log(`${runs} companies simulated`);
console.log(`  payroll cut      ${((cutShare / runs) * 100).toFixed(1)}%`);
console.log(`  headcount cut    ${((headShare / runs) * 100).toFixed(1)}%`);
console.log("  cut rate by level:");
for (const [k, v] of [...byLevel.entries()].sort((a, b) => pct(b[1]) - pct(a[1]))) {
  console.log(`    ${k.padEnd(20)} ${pct(v).toFixed(1)}%`);
}
console.log("  cut rate by office cost:");
for (const [k, v] of byCostQuartile) console.log(`    ${k.padEnd(20)} ${pct(v).toFixed(1)}%`);

// --- the claims the project makes -----------------------------------------
const jun = byLevel.get("Junior")!, staff = byLevel.get("Staff / principal")!;
check(pct(staff) > pct(jun) * 3, "seniority effect missing: staff should be cut far more than junior");
const exp = byCostQuartile.get("expensive offices")!, cheap = byCostQuartile.get("cheaper offices")!;
check(pct(exp) > pct(cheap) * 1.5, "location effect missing: expensive offices should be cut harder");
check(headShare / runs < cutShare / runs, "should cut a smaller share of people than of payroll");

if (fails.length) {
  console.log(`\n${fails.length} FAILURES:`);
  for (const f of fails.slice(0, 12)) console.log("  " + f);
  process.exit(1);
}
console.log("\nall invariants and claims hold");
