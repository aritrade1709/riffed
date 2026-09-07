/** Shapes of public/data/model.json, produced by scripts/build_data.py. */

export type Func =
  | "engineering"
  | "leadership"
  | "operations"
  | "sales"
  | "marketing"
  | "support";

export interface Metro {
  id: string;
  name: string;
  short: string;
  /** Median annual wage for Software Developers in this metro. */
  devMedian: number;
}

export interface Occupation {
  soc: string;
  title: string;
  /** Percent of NAICS 5415 employment in this occupation. */
  share: number;
  func: Func;
  nat: { p10: number; p25: number; p50: number; p75: number; p90: number };
  /** Median wage for this occupation by metro id. Sparse. */
  metro: Record<string, number>;
  tech: string[];
}

export interface Model {
  meta: {
    wages: string;
    staffing: string;
    technologies: string;
    industryShareCovered: number;
  };
  metros: Metro[];
  occupations: Occupation[];
}

export async function loadModel(): Promise<Model> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/model.json`);
  if (!res.ok) throw new Error(`could not load model.json (${res.status})`);
  return (await res.json()) as Model;
}

export const FUNC_LABEL: Record<Func, string> = {
  engineering: "Engineering",
  leadership: "Leadership",
  operations: "Operations",
  sales: "Sales",
  marketing: "Marketing",
  support: "Support",
};
