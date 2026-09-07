import "./style.css";
import { loadModel, type Model, type Func } from "./model";
import { resolveTitle, knownTitles, SENIORITY, seniorityByKey, type Seniority } from "./titles";
import { buildCompany, type Company } from "./company";
import { runCut, scarcest, breakdownBy, type CutResult } from "./solver";

// The user is inserted into the company, so generate one short of the target.
const HEADCOUNT = 399;
const TARGET = 0.15;
const app = document.querySelector<HTMLElement>("#app")!;

const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
const compact = (n: number) =>
  n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n / 1e3)}k`;

const FUNC_CLASS: Record<Func, string> = {
  engineering: "eng", leadership: "lead", operations: "ops",
  sales: "sales", marketing: "mkt", support: "sup",
};

let model: Model;

/* ------------------------------------------------------------------ setup */

function setup(prefill = "", message = "", showChooser = false) {
  app.innerHTML = `
    <div class="mast"><h1>riffed</h1><p>a solver decides who goes</p></div>
    <section class="setup">
      <p class="lede">A company has to cut fifteen percent of payroll. It will lose as few people as possible.</p>
      <p class="sub">Type what you do. The company gets built around you out of federal
        employment data — real staffing mix, real wages for your city. Then the solver runs.</p>

      <label for="title">Your job title</label>
      <input type="text" id="title" placeholder="Senior Software Engineer" value="${escape(prefill)}" autocomplete="off" spellcheck="false" />
      ${message ? `<p class="error">${message}</p>` : ""}
      ${showChooser ? chooser() : ""}

      <div class="row">
        <div>
          <label for="metro">Where you work</label>
          <select id="metro">${model.metros
            .map((m) => `<option value="${m.id}">${escape(m.name)}</option>`)
            .join("")}</select>
        </div>
        <div>
          <label for="level">Level</label>
          <select id="level">${SENIORITY.map(
            (s) => `<option value="${s.key}"${s.key === "senior" ? " selected" : ""}>${s.label}</option>`,
          ).join("")}</select>
        </div>
      </div>

      <button class="go" id="run">Run the cut</button>
      <p class="note">Nothing is sent anywhere. It runs in your browser.</p>
    </section>
    ${sources()}`;

  const input = document.querySelector<HTMLInputElement>("#title")!;
  const go = () => submit(input.value);
  document.querySelector<HTMLButtonElement>("#run")!.onclick = go;
  input.onkeydown = (e) => { if (e.key === "Enter") go(); };
  input.oninput = () => {
    // Fill the level dropdown from what they typed, without overriding a manual pick.
    const r = resolveTitle(input.value);
    if (r) (document.querySelector("#level") as HTMLSelectElement).value = r.seniority.key;
  };
  for (const c of document.querySelectorAll<HTMLButtonElement>(".chip")) {
    c.onclick = () => { input.value = c.textContent!; submit(c.textContent!); };
  }
  input.focus();
}

function chooser(): string {
  const titles = knownTitles().filter((t) => t.length > 3).slice(0, 220);
  return `<div class="chooser">
      <label>Pick the closest one instead</label>
      <div class="chips">${titles.map((t) => `<button class="chip">${escape(t)}</button>`).join("")}</div>
    </div>`;
}

function submit(raw: string) {
  const resolved = resolveTitle(raw);
  if (!resolved) {
    setup(raw, `No occupation matches “${escape(raw.trim())}”. Rather than guess at it — which is how you end up classified as a forest worker — pick the nearest match.`, true);
    return;
  }
  const metroId = (document.querySelector("#metro") as HTMLSelectElement).value;
  const level = seniorityByKey((document.querySelector("#level") as HTMLSelectElement).value);
  show(resolved.soc, metroId, level, undefined);
}

/* ----------------------------------------------------------------- result */

function show(soc: string, metroId: string, level: Seniority, userSalary?: number) {
  const company = buildCompany({ model, soc, metroId, seniority: level, headcount: HEADCOUNT, userSalary });
  const result = runCut(company, TARGET);
  render(company, result, soc, metroId, level, userSalary);
}

function render(
  company: Company, result: CutResult,
  soc: string, metroId: string, level: Seniority, userSalary?: number,
) {
  const u = result.user;
  const user = company.user;
  const cutCount = result.cutIds.length;
  const scarce = scarcest(company, user);

  app.innerHTML = `
    <div class="mast"><h1>riffed</h1><p>a solver decides who goes</p></div>
    <h2 class="verdict ${u.cut ? "cut" : ""}">${u.cut ? "You were cut." : "You kept your job."}</h2>
    <p class="reason">${reason(company, result, scarce)}</p>

    <div class="grid-wrap">
      <div class="grid" id="grid">${company.employees
        .map((e) => `<div class="cell ${FUNC_CLASS[e.func]}${e.isUser ? " you" : ""}" data-id="${e.id}"></div>`)
        .join("")}</div>
      <div class="legend">
        ${(["engineering", "leadership", "operations", "sales", "marketing", "support"] as Func[])
          .map((f) => `<span><i class="swatch cell ${FUNC_CLASS[f]}"></i>${f[0]!.toUpperCase() + f.slice(1)}</span>`)
          .join("")}
        <span><i class="swatch" style="background:var(--cut)"></i>Cut</span>
        <span><i class="swatch" style="background:var(--you)"></i>You</span>
      </div>
    </div>

    <div class="stats">
      <div class="stat"><div class="k">People cut</div><div class="v num">${cutCount} <span style="color:var(--dim);font-size:15px">of ${company.employees.length}</span></div></div>
      <div class="stat"><div class="k">Payroll saved</div><div class="v num">${compact(result.saved)}</div></div>
      <div class="stat"><div class="k">Target was</div><div class="v num">${compact(result.target)}</div></div>
      <div class="stat"><div class="k">Your salary</div><div class="v num">${money(user.salary)}</div></div>
    </div>

    <h2 class="sec">Where the cuts landed, by office</h2>
    <p class="seclede">Offices ordered by median pay. The solver was never told where anyone works.</p>
    ${bars(
      breakdownBy(company, result, (e) => e.metro.short)
        .sort((a, b) => b.medianSalary - a.medianSalary),
      user.metro.short,
    )}

    <h2 class="sec">Where the cuts landed, by level</h2>
    <p class="seclede">The solver was never told anyone's level either.</p>
    ${bars(
      breakdownBy(company, result, (e) => e.level)
        .sort((a, b) => b.medianSalary - a.medianSalary),
      user.level,
    )}

    <div class="actions">
      <button class="ghost" id="cheaper">Run it again with my salary 20% lower</button>
      <button class="ghost" id="again">Start over</button>
    </div>
    ${sources()}`;

  document.querySelector<HTMLButtonElement>("#again")!.onclick = () => setup();
  document.querySelector<HTMLButtonElement>("#cheaper")!.onclick = () =>
    show(soc, metroId, level, Math.round((userSalary ?? user.salary) * 0.8));

  animate(result);
}

function animate(result: CutResult) {
  const cells = new Map<number, HTMLElement>();
  for (const el of document.querySelectorAll<HTMLElement>(".cell[data-id]")) {
    cells.set(Number(el.dataset.id), el);
  }
  const total = 1400;
  const stagger = Math.min(22, total / Math.max(1, result.cutIds.length));
  result.cutIds.forEach((id, i) => {
    setTimeout(() => cells.get(id)?.classList.add("gone"), 220 + i * stagger);
  });
}

function reason(
  company: Company, result: CutResult,
  scarce: { tech: string; others: number } | null,
): string {
  const u = result.user;
  const user = company.user;
  const cheaperThanLine = user.salary < result.reachedLine;

  if (u.cut) {
    const cover = scarce
      ? `The rarest thing you know is <strong>${escape(scarce.tech)}</strong>, and <strong>${
          scarce.others
        }</strong> other ${scarce.others === 1 ? "person here knows" : "people here know"} it too.`
      : `Nothing you know is unique here.`;
    return `You cost <strong>${money(user.salary)}</strong>. ${cover} Removing you covered ${(
      (user.salary / result.target) * 100
    ).toFixed(1)}% of the target in one step.`;
  }
  if (u.skipped === "sole-holder") {
    return `You are the only person here who knows <strong>${escape(u.savedBy!)}</strong>. You were reached and passed over — cutting you would have left the company without it.`;
  }
  if (u.skipped === "last-in-team") {
    return `You are the last person left in your team. Cutting you would have closed the function outright.`;
  }
  if (cheaperThanLine) {
    return `The target was met before the solver got to you. It stopped at <strong>${money(
      result.reachedLine,
    )}</strong>; you cost ${money(user.salary)}. Being cheap is the whole reason you are still here.`;
  }
  return `The target was met before the solver reached you.`;
}

function bars(rows: Array<{ key: string; cut: number; total: number; medianSalary: number }>, highlight: string) {
  const max = Math.max(...rows.map((r) => (r.total ? r.cut / r.total : 0)), 0.01);
  return `<div class="bars">${rows
    .map((r) => {
      const pct = r.total ? r.cut / r.total : 0;
      return `<div class="bar${r.key === highlight ? " isyou" : ""}">
        <div class="lab">${escape(r.key)}</div>
        <div class="track"><div class="fill" style="width:${(pct / max) * 100}%"></div></div>
        <div class="val num">${(pct * 100).toFixed(0)}% · ${compact(r.medianSalary)}</div>
      </div>`;
    })
    .join("")}</div>`;
}

function sources(): string {
  return `<footer>
    Occupation mix: ${escape(model.meta.staffing)} — the ${model.meta.industryShareCovered}% of that
    industry covered by its ${model.occupations.length} largest occupations.<br />
    Wages: ${escape(model.meta.wages)}. Technologies: ${escape(model.meta.technologies)}.<br />
    The company is generated, the numbers in it are not. Nobody here is real, including you.
  </footer>`;
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

loadModel().then((m) => { model = m; setup(); }).catch((err) => {
  app.innerHTML = `<div class="mast"><h1>riffed</h1></div><p class="error">${escape(String(err))}</p>`;
});
