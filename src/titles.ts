/**
 * Job title -> federal occupation code.
 *
 * The government's own alternate-title list (O*NET, 55,120 entries) exact-matches
 * only about 58% of ordinary tech job titles, and several of the matches it does
 * make are confidently wrong: "Product Manager" resolves to Marketing Managers,
 * "Staff Engineer" to Computer Hardware Engineers. Fuzzy matching is worse than
 * useless here — string similarity over 46,000 occupation names maps "Product
 * Design Lead II" to Mechanical Drafters and "Growth Marketer" to Forest and
 * Conservation Workers, fluently and with no signal that anything went wrong.
 *
 * So there is no fuzzy matching in this file. A title is resolved by stripping
 * seniority words, normalising, and looking the remainder up in a hand-written
 * table. Anything that does not match is handed back to the user as a chooser
 * rather than guessed at.
 */

export interface Seniority {
  key: string;
  label: string;
  /** Where this level sits in the occupation's wage distribution. */
  percentile: number;
  manager: boolean;
}

export const SENIORITY: Seniority[] = [
  { key: "junior", label: "Junior / new grad", percentile: 0.15, manager: false },
  { key: "mid", label: "Mid-level", percentile: 0.45, manager: false },
  { key: "senior", label: "Senior", percentile: 0.68, manager: false },
  { key: "staff", label: "Staff / principal / lead", percentile: 0.86, manager: false },
  { key: "manager", label: "Manager", percentile: 0.8, manager: true },
  { key: "exec", label: "Director / VP / chief", percentile: 0.96, manager: true },
];

export const seniorityByKey = (k: string): Seniority =>
  SENIORITY.find((s) => s.key === k) ?? SENIORITY[1]!;

/**
 * Words that describe level rather than the job itself.
 *
 * Split in two, because they have to be removed in the right order. "Senior
 * Product Manager" must lose "senior" before "manager" — strip the wrong one
 * first and you are left with "senior product", which matches nothing.
 */
const RANK_WORDS: Array<[RegExp, string]> = [
  [/\b(staff|principal|distinguished|fellow|l[67]|ic[67])\b/, "staff"],
  [/\b(senior|senr|sr|snr|iii|l5|ic5)\b/, "senior"],
  [/\b(junior|jr|entry|entry.level|graduate|grad|intern|trainee|l3|ic1|ic2)\b/, "junior"],
  [/\b(ii|l4|ic4|mid|mid.level|intermediate)\b/, "mid"],
];

const ROLE_RANK_WORDS: Array<[RegExp, string]> = [
  [/\b(chief|c[teofi]o|cro|cmo|chro|cxo|svp|evp|vice president|vp|head of|head|director of|director|dir)\b/, "exec"],
  [/\b(manager|mgr|supervisor|em)\b/, "manager"],
  [/\blead\b/, "staff"],
];

/** Trailing level numerals: "engineer 3", "sde-3", "designer ii". */
const TRAILING_LEVEL = /[\s-]*\b(?:l|ic|e|p|t)?([1-9])\b\s*$/;
const NUMERAL_LEVEL: Record<string, string> = {
  "1": "junior", "2": "mid", "3": "senior", "4": "senior",
  "5": "senior", "6": "staff", "7": "staff", "8": "staff", "9": "staff",
};

/**
 * Titles that contain "manager" but describe an individual contributor. Without
 * this a product manager is treated as someone with reports, which changes both
 * their salary and how the solver sees them.
 */
const IC_DESPITE_MANAGER = new Set([
  "product manager", "program manager", "project manager", "technical program manager",
  "delivery manager", "account manager", "customer success manager", "partnerships manager",
  "renewals manager", "brand manager", "product marketing manager", "community manager",
  "business development manager", "enablement manager", "growth manager",
  "social media manager", "communications manager", "regional sales manager",
]);

/**
 * Modern job titles mapped to Standard Occupational Classification codes.
 *
 * Where the SOC taxonomy has no equivalent for a role that plainly exists — it
 * has no product manager, no site reliability engineer, no designer that isn't
 * a web designer — the nearest occupation is used and the choice is documented
 * in the README rather than hidden.
 */
const ALIASES: Record<string, string> = {};
const alias = (soc: string, ...titles: string[]) => {
  for (const t of titles) ALIASES[t] = soc;
};

// Software engineering — 15-1252 Software Developers
alias("15-1252",
  "software engineer", "software developer", "developer", "swe", "sde", "engineer",
  "backend engineer", "back end engineer", "backend developer", "server engineer",
  "frontend engineer", "front end engineer", "frontend developer", "ui engineer",
  "full stack engineer", "full stack developer", "fullstack engineer", "fullstack developer",
  "mobile engineer", "mobile developer", "ios engineer", "ios developer",
  "android engineer", "android developer", "systems engineer", "software architect",
  "devops engineer", "devops", "platform engineer", "infrastructure engineer",
  "site reliability engineer", "sre", "cloud engineer", "build engineer",
  "release engineer", "api engineer", "integration engineer", "applications engineer",
  "application developer", "game developer", "game engineer", "compiler engineer",
  "member of technical staff", "mts", "individual contributor", "ic");

// 15-1251 Computer Programmers
alias("15-1251", "computer programmer", "programmer", "coder", "analyst programmer");

// 15-1253 Software QA
alias("15-1253",
  "qa engineer", "quality assurance engineer", "qa analyst", "test engineer",
  "sdet", "software development engineer in test", "automation engineer",
  "qa", "quality engineer", "test automation engineer", "qa tester", "tester");

// 15-2051 Data Scientists
alias("15-2051",
  "data scientist", "machine learning engineer", "ml engineer", "mle",
  "ai engineer", "artificial intelligence engineer", "research scientist",
  "applied scientist", "research engineer", "nlp engineer", "computer vision engineer",
  "data analyst", "quantitative analyst", "quant", "statistician", "ml scientist");

// 15-1243 Database Architects
alias("15-1243",
  "data engineer", "analytics engineer", "database administrator", "dba",
  "database engineer", "data architect", "etl developer", "data platform engineer",
  "business intelligence engineer", "bi developer", "bi engineer");

// 15-1211 Computer Systems Analysts
alias("15-1211",
  "systems analyst", "computer systems analyst", "solutions analyst",
  "technical analyst", "erp analyst", "salesforce administrator", "systems consultant");

// 15-1212 Information Security Analysts
alias("15-1212",
  "security engineer", "security analyst", "information security analyst",
  "infosec engineer", "application security engineer", "appsec engineer",
  "cybersecurity analyst", "cyber security engineer", "penetration tester",
  "security operations analyst", "soc analyst", "detection engineer");

// 15-1241 Computer Network Architects
alias("15-1241",
  "network engineer", "network architect", "solutions architect",
  "enterprise architect", "cloud architect", "solution architect",
  "network designer", "telecommunications engineer");

// 15-1244 Network and Computer Systems Administrators
alias("15-1244",
  "system administrator", "systems administrator", "sysadmin", "it administrator",
  "server administrator", "network administrator", "it operations engineer",
  "it engineer", "linux administrator", "windows administrator");

// 15-1232 Computer User Support Specialists
alias("15-1232",
  "it support specialist", "it support", "help desk", "helpdesk technician",
  "desktop support", "technical support engineer", "support engineer",
  "technical support specialist", "it technician", "service desk analyst");

// 15-1231 Computer Network Support Specialists
alias("15-1231", "network support specialist", "noc engineer", "network technician");

// 15-1254 Web Developers
alias("15-1254", "web developer", "wordpress developer", "webmaster", "web engineer");

// 15-1255 Web and Digital Interface Designers — the nearest SOC has for product design
alias("15-1255",
  "product designer", "ux designer", "ui designer", "ux/ui designer", "ui/ux designer",
  "user experience designer", "interaction designer", "ux researcher",
  "user researcher", "design lead", "visual designer", "digital designer",
  "design systems designer", "product design");

// 27-1024 Graphic Designers
alias("27-1024", "graphic designer", "brand designer", "motion designer", "illustrator");

// 15-1299 Computer Occupations, All Other
alias("15-1299",
  "technical writer", "developer advocate", "developer relations", "devrel",
  "sales engineer", "forward deployed engineer", "implementation engineer",
  "prompt engineer", "blockchain developer", "computer scientist");

// 15-1252 hardware sits in 17-2061
alias("17-2061",
  "hardware engineer", "firmware engineer", "embedded engineer",
  "embedded software engineer", "fpga engineer", "asic engineer", "electrical engineer");

// 13-1082 Project Management Specialists — SOC has no product manager
alias("13-1082",
  "product manager", "pm", "product owner", "program manager",
  "technical program manager", "tpm", "project manager", "scrum master",
  "agile coach", "delivery manager", "product operations", "chief of staff");

// 11-3021 Computer and Information Systems Managers
alias("11-3021",
  "engineering manager", "development manager", "software engineering manager",
  "it manager", "technology manager", "cto", "chief technology officer",
  "vp engineering", "director of engineering", "head of engineering",
  "cio", "chief information officer", "technical lead", "tech lead", "team lead");

// 11-1021 General and Operations Managers
alias("11-1021",
  "operations manager", "general manager", "coo", "chief operating officer",
  "business operations manager", "site lead", "country manager", "ceo",
  "chief executive officer", "founder", "co-founder", "president");

// 13-1111 Management Analysts
alias("13-1111",
  "business analyst", "management consultant", "consultant", "strategy analyst",
  "operations analyst", "process analyst", "business consultant");

// 13-1199 Business Operations Specialists, All Other
alias("13-1199",
  "business operations specialist", "revenue operations", "revops",
  "sales operations", "partnerships manager", "community manager",
  "legal operations", "compliance analyst", "procurement specialist");

// 13-1071 Human Resources Specialists
alias("13-1071",
  "recruiter", "technical recruiter", "talent acquisition specialist",
  "talent acquisition partner", "hr business partner", "hrbp", "people operations",
  "people ops", "human resources specialist", "hr generalist", "hr manager",
  "sourcer", "people partner", "chro");

// 13-1151 Training and Development Specialists
alias("13-1151",
  "training specialist", "learning and development", "instructional designer",
  "enablement manager", "sales enablement", "technical trainer");

// 13-2011 Accountants and Auditors
alias("13-2011",
  "accountant", "auditor", "financial analyst", "finance analyst", "controller",
  "staff accountant", "fp&a analyst", "revenue accountant");

// 11-3031 Financial Managers
alias("11-3031",
  "finance manager", "cfo", "chief financial officer", "treasurer",
  "director of finance", "head of finance");

// 41-3091 Sales Representatives of Services
alias("41-3091",
  "account executive", "ae", "sales representative", "sales rep",
  "sales development representative", "sdr", "business development representative",
  "bdr", "business development manager", "inside sales", "customer success manager",
  "csm", "account manager", "client partner", "renewals manager");

// 41-4011 Technical and Scientific Sales
alias("41-4011",
  "technical sales", "solutions consultant", "pre-sales engineer",
  "presales engineer", "field engineer", "technical account manager", "tam");

// 11-2022 Sales Managers
alias("11-2022",
  "sales manager", "vp sales", "head of sales", "cro", "chief revenue officer",
  "director of sales", "regional sales manager");

// 11-2021 Marketing Managers
alias("11-2021",
  "marketing manager", "cmo", "chief marketing officer", "head of marketing",
  "vp marketing", "director of marketing", "brand manager");

// 13-1161 Market Research Analysts and Marketing Specialists
alias("13-1161",
  "marketing specialist", "growth marketer", "growth manager", "demand generation",
  "content marketer", "content writer", "copywriter", "seo specialist",
  "social media manager", "product marketing manager", "pmm",
  "market research analyst", "marketing analyst", "communications manager");

// 43-4051 Customer Service Representatives
alias("43-4051",
  "customer service representative", "customer support specialist",
  "customer support", "support specialist", "customer service", "call center agent",
  "customer experience specialist", "support agent");

// 43-1011 First-Line Supervisors of Office and Administrative Support Workers
alias("43-1011", "support manager", "customer support manager", "office supervisor");

// 43-6014 Secretaries and Administrative Assistants
alias("43-6014",
  "executive assistant", "administrative assistant", "office administrator",
  "personal assistant", "ea");

// 43-9061 Office Clerks, General
alias("43-9061", "office manager", "office clerk", "data entry", "receptionist",
  "workplace coordinator", "facilities coordinator");

// 43-3031 Bookkeeping, Accounting, and Auditing Clerks
alias("43-3031", "bookkeeper", "accounts payable", "accounts receivable", "payroll specialist");

// 11-9199 Managers, All Other
alias("11-9199", "manager", "general management", "business manager");

export interface Resolution {
  soc: string;
  seniority: Seniority;
  /** The words that were read as a level, for showing back to the user. */
  matchedTitle: string;
}

function normalise(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[()\[\]{}]/g, " ")
    .replace(/[^a-z0-9+#/&.\- ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const tidy = (s: string) =>
  s.replace(/\s+/g, " ").replace(/^[\s\-.,/&]+|[\s\-.,/&]+$/g, "").trim();

/**
 * Progressively simpler forms of a title, each paired with the level words that
 * were taken out to get there. Ordered most specific first, so a title that is
 * itself a known job ("engineering manager") is never stripped down to a
 * different one.
 */
function candidates(norm: string): Array<{ text: string; removed: string[] }> {
  const out: Array<{ text: string; removed: string[] }> = [{ text: norm, removed: [] }];
  const push = (text: string, removed: string[]) => {
    const t = tidy(text);
    if (t && !out.some((c) => c.text === t)) out.push({ text: t, removed });
  };

  let cur = norm;
  const removed: string[] = [];

  const trailing = cur.match(TRAILING_LEVEL);
  if (trailing) {
    removed.push(NUMERAL_LEVEL[trailing[1]!] ?? "mid");
    cur = cur.replace(TRAILING_LEVEL, "");
    push(cur, [...removed]);
  }

  for (const [re, key] of RANK_WORDS) {
    if (re.test(cur)) {
      removed.push(key);
      cur = cur.replace(re, " ");
      push(cur, [...removed]);
    }
  }
  for (const [re, key] of ROLE_RANK_WORDS) {
    if (re.test(cur)) {
      removed.push(key);
      cur = cur.replace(re, " ");
      push(cur, [...removed]);
    }
  }
  return out;
}

/** The level a title implies on its own, when nothing was stripped off it. */
function inherentLevel(aliasText: string): Seniority {
  if (/\b(chief|c[teofi]o|cro|cmo|chro|svp|evp|vp|head of|director of|president|founder|co-founder)\b/.test(aliasText)) {
    return seniorityByKey("exec");
  }
  if (/\b(manager|supervisor)\b/.test(aliasText) && !IC_DESPITE_MANAGER.has(aliasText)) {
    return seniorityByKey("manager");
  }
  return seniorityByKey("mid");
}

/** Highest level among the words that were stripped away. */
function removedLevel(removed: string[]): Seniority | null {
  const rank = ["junior", "mid", "senior", "staff", "manager", "exec"];
  let best: string | null = null;
  for (const r of removed) {
    if (!best || rank.indexOf(r) > rank.indexOf(best)) best = r;
  }
  return best ? seniorityByKey(best) : null;
}

/**
 * Resolve a typed job title. Returns null when there is no confident match —
 * the caller shows a chooser instead of guessing.
 */
export function resolveTitle(raw: string): Resolution | null {
  const norm = normalise(raw);
  if (!norm) return null;

  for (const { text, removed } of candidates(norm)) {
    const soc = ALIASES[text];
    if (soc) {
      return {
        soc,
        seniority: removedLevel(removed) ?? inherentLevel(text),
        matchedTitle: text,
      };
    }
  }

  // Last resort: the longest multi-word alias entirely contained in what is
  // left, so "senior backend engineer, payments" still lands on "backend
  // engineer". This is containment, not similarity — it cannot invent a match
  // the way string-distance scoring does.
  const last = candidates(norm)[candidates(norm).length - 1]!;
  const words = new Set(last.text.split(" "));
  let best: string | null = null;
  for (const key of Object.keys(ALIASES)) {
    const parts = key.split(" ");
    if (parts.length < 2) continue;
    if (parts.every((p) => words.has(p)) && (!best || key.length > best.length)) best = key;
  }
  if (best) {
    return {
      soc: ALIASES[best]!,
      seniority: removedLevel(last.removed) ?? inherentLevel(best),
      matchedTitle: best,
    };
  }
  return null;
}

/** Every title the resolver knows, for the "pick one instead" chooser. */
export function knownTitles(): string[] {
  return Object.keys(ALIASES).sort();
}
