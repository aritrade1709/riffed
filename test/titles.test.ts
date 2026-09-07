import { resolveTitle } from "../src/titles";

const CASES: Array<[string, string, string]> = [
  ["Software Engineer", "15-1252", "mid"],
  ["Senior Software Engineer", "15-1252", "senior"],
  ["Staff Engineer", "15-1252", "staff"],
  ["SDE-3", "15-1252", "senior"],
  ["SDE II", "15-1252", "mid"],
  ["Sr. Backend Engineer", "15-1252", "senior"],
  ["SRE", "15-1252", "mid"],
  ["Site Reliability Engineer", "15-1252", "mid"],
  ["Junior Frontend Developer", "15-1252", "junior"],
  ["Engineering Manager", "11-3021", "manager"],
  ["VP Engineering", "11-3021", "exec"],
  ["Director of Engineering", "11-3021", "exec"],
  ["Data Scientist", "15-2051", "mid"],
  ["Senior Machine Learning Engineer", "15-2051", "senior"],
  ["Data Engineer", "15-1243", "mid"],
  ["Analytics Engineer", "15-1243", "mid"],
  ["QA Engineer", "15-1253", "mid"],
  ["SDET", "15-1253", "mid"],
  ["Product Manager", "13-1082", "mid"],
  ["Senior Product Manager", "13-1082", "senior"],
  ["Technical Program Manager", "13-1082", "mid"],
  ["TPM", "13-1082", "mid"],
  ["Scrum Master", "13-1082", "mid"],
  ["Product Designer", "15-1255", "mid"],
  ["UX Researcher", "15-1255", "mid"],
  ["Graphic Designer", "27-1024", "mid"],
  ["Security Engineer", "15-1212", "mid"],
  ["Network Engineer", "15-1241", "mid"],
  ["Solutions Architect", "15-1241", "mid"],
  ["IT Support Specialist", "15-1232", "mid"],
  ["Technical Recruiter", "13-1071", "mid"],
  ["HR Business Partner", "13-1071", "mid"],
  ["People Operations Manager", "13-1071", "manager"],
  ["Account Executive", "41-3091", "mid"],
  ["SDR", "41-3091", "mid"],
  ["Customer Success Manager", "41-3091", "mid"],
  ["Sales Manager", "11-2022", "manager"],
  ["Marketing Manager", "11-2021", "manager"],
  ["Growth Marketer", "13-1161", "mid"],
  ["Copywriter", "13-1161", "mid"],
  ["Social Media Manager", "13-1161", "mid"],
  ["Financial Analyst", "13-2011", "mid"],
  ["Controller", "13-2011", "mid"],
  ["Office Manager", "43-9061", "manager"],
  ["Executive Assistant", "43-6014", "mid"],
  ["Customer Support Specialist", "43-4051", "mid"],
  ["Database Administrator", "15-1243", "mid"],
  ["Business Analyst", "13-1111", "mid"],
  ["Web Developer", "15-1254", "mid"],
  ["Hardware Engineer", "17-2061", "mid"],
  ["Technical Writer", "15-1299", "mid"],
  ["Principal Software Engineer", "15-1252", "staff"],
  ["senior backend engineer, payments", "15-1252", "senior"],
  ["CTO", "11-3021", "exec"],
  ["COO", "11-1021", "exec"],
  ["Chief Financial Officer", "11-3031", "exec"],
];

let pass = 0;
const fails: string[] = [];
for (const [title, soc, level] of CASES) {
  const r = resolveTitle(title);
  if (!r) { fails.push(`${title}  ->  NO MATCH (want ${soc}/${level})`); continue; }
  if (r.soc !== soc || r.seniority.key !== level) {
    fails.push(`${title}  ->  ${r.soc}/${r.seniority.key}  (want ${soc}/${level})`);
    continue;
  }
  pass++;
}

// Gibberish must not resolve to anything.
for (const junk of ["asdfgh", "", "   ", "purple monkey dishwasher"]) {
  if (resolveTitle(junk)) fails.push(`"${junk}" resolved but should not have`);
  else pass++;
}

console.log(`${pass}/${CASES.length + 4} passed`);
if (fails.length) {
  console.log("\nFAILURES:");
  for (const f of fails) console.log("  " + f);
  process.exit(1);
}
