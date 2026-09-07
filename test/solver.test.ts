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

// --- India mode ------------------------------------------------------------
{
  const cities = ["Bengaluru", "Hyderabad", "Pune", "Chennai"];
  let indiaCut = 0, indiaTotal = 0, usCut = 0, usTotal = 0, runsIn = 0;
  for (const soc of socs.slice(0, 18)) {
    for (const city of cities) {
      for (const ratio of [0.08, 0.22, 0.6]) {
        const c = buildCompany({
          model, soc, metroId: city, seniority: seniorityByKey("senior"),
          headcount: 399, region: "india", costRatio: ratio,
        });
        const res = runCut(c, 0.15);
        runsIn++;
        check(c.employees.length === 400, "india: wrong headcount");
        check(res.saved >= res.target * 0.999, `india ${city}/${ratio}: target missed`);
        const kept = c.employees.filter((e) => !res.decisions.get(e.id)?.cut);
        const keptTech = new Set(kept.flatMap((e) => e.tech));
        for (const t of new Set(c.employees.flatMap((e) => e.tech))) {
          check(keptTech.has(t), `india ${city}: technology "${t}" lost`);
        }
        check(c.offices.filter((o) => o.id.startsWith("in-")).length === 3, "india: expected 3 Indian sites");
        check(c.offices.filter((o) => !o.id.startsWith("in-")).length === 2, "india: expected 2 US sites");
        for (const e of c.employees) {
          const cut = res.decisions.get(e.id)?.cut ? 1 : 0;
          if (e.metro.id.startsWith("in-")) { indiaCut += cut; indiaTotal++; }
          else { usCut += cut; usTotal++; }
        }
      }
    }
  }
  const inPct = (100 * indiaCut) / indiaTotal, usPct = (100 * usCut) / usTotal;
  console.log(`\n${runsIn} India-mode companies simulated`);
  console.log(`  cut rate, Indian sites   ${inPct.toFixed(1)}%`);
  console.log(`  cut rate, US sites       ${usPct.toFixed(1)}%`);
  // The claim the India mode makes, across the whole slider range.
  check(usPct > inPct * 4, "India mode: US sites should be cut far harder than Indian ones");
}

// --- India-scoped cuts: what a delivery-centre layoff actually is -----------
{
  const inIndia = (e: { metro: { id: string } }) => e.metro.id.startsWith("in-");
  const LPA = (n: number) => (n * 1e5) / 88;
  let cutAt50 = 0, cutAt70 = 0, cutAt12 = 0, n = 0, savedByConstraint = 0;
  let usTouched = 0;

  for (const soc of socs.slice(0, 20)) {
    for (const city of ["Bengaluru", "Hyderabad", "Pune"]) {
      n++;
      for (const [lpa, tally] of [[12, "a"], [50, "b"], [70, "c"]] as const) {
        const c = buildCompany({
          model, soc, metroId: city, seniority: seniorityByKey("senior"),
          headcount: 399, region: "india", costRatio: 0.22, userSalary: LPA(lpa),
        });
        const res = runCut(c, 0.15, inIndia);
        const cut = res.decisions.get(c.user.id)?.cut ?? false;
        if (tally === "a" && cut) cutAt12++;
        if (tally === "b" && cut) cutAt50++;
        if (tally === "c") {
          if (cut) cutAt70++;
          else {
            // The only thing that may save the most expensive person in the office
            // is a constraint — being the sole holder of something, or the last of
            // their team. Anything else means the solver skipped them wrongly.
            const d = res.decisions.get(c.user.id);
            check(
              d?.skipped === "sole-holder" || d?.skipped === "last-in-team",
              `70 LPA reader survived ${city}/${soc} for no reason: ${JSON.stringify(d?.skipped)}`,
            );
            savedByConstraint++;
          }
        }
        // A scoped cut must never touch the head office.
        usTouched += c.employees.filter(
          (e) => !inIndia(e) && res.decisions.get(e.id)?.cut,
        ).length;
        check(res.saved >= res.target * 0.999, `scoped ${city}: target missed`);
        const kept = c.employees.filter((e) => !res.decisions.get(e.id)?.cut);
        const keptTech = new Set(kept.flatMap((e) => e.tech));
        for (const t of new Set(c.employees.flatMap((e) => e.tech))) {
          check(keptTech.has(t), `scoped ${city}: technology "${t}" lost`);
        }
      }
    }
  }
  console.log(`\n${n} India-office-only cuts, reader's CTC varied`);
  console.log(`  cut at 12 LPA   ${((100 * cutAt12) / n).toFixed(0)}%`);
  console.log(`  cut at 50 LPA   ${((100 * cutAt50) / n).toFixed(0)}%`);
  console.log(`  cut at 70 LPA   ${((100 * cutAt70) / n).toFixed(0)}%`);
  check(usTouched === 0, "scoped cut reached the head office");
  console.log(`  (${savedByConstraint} of the 70 LPA readers were saved by a constraint)`);
  check(
    cutAt70 + savedByConstraint === n,
    "every 70 LPA reader should be cut unless a constraint saved them",
  );
  check(cutAt50 > n * 0.9, "a 50 LPA reader should almost always be cut");
  check(cutAt12 === 0, "a 12 LPA reader should never be cut");
}

if (fails.length) {
  console.log(`\n${fails.length} FAILURES:`);
  for (const f of fails.slice(0, 12)) console.log("  " + f);
  process.exit(1);
}
console.log("\nall invariants and claims hold");
