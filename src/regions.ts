/**
 * India mode.
 *
 * There is no free, authoritative, IT-specific, city-level wage table for India.
 * The ILO publishes median monthly earnings for India by occupation, current and
 * sourced from the Periodic Labour Force Survey, but only at the nine ISCO-08
 * major groups, with no percentiles and no cities — its "Professionals" figure
 * spans teachers, nurses and lawyers alongside engineers, so it says nothing
 * useful about a software engineer in Bengaluru.
 *
 * Rather than invent the missing table, this mode asks the reader for their own
 * salary and calibrates from it. What is borrowed from the US data is the
 * *shape* of each occupation's wage distribution — the ratios between its 10th,
 * 25th, 75th and 90th percentiles — which transfers across labour markets far
 * better than the level does. The level comes from the reader.
 *
 * Every assumption in here is exposed in the interface. The cost ratio is a
 * slider, and the finding holds across its whole range.
 */
import type { Metro } from "./model";

/** Rupees to the dollar. Pinned, not fetched, so the page stays static. */
export const INR_PER_USD = 88;

/**
 * Fraction of the equivalent US salary that an Indian role costs, used when the
 * reader does not give their own. Sits inside the commonly cited four-to-six
 * times range for IT wage differentials. Adjustable in the interface.
 */
export const DEFAULT_COST_RATIO = 0.22;
export const COST_RATIO_RANGE: [number, number] = [0.08, 0.6];

/**
 * Indian sites all sit at the same wage level, because no source distinguishes
 * them. Bengaluru is not modelled as more expensive than Pune — that difference
 * exists, but not in any data that can be cited, so it is not asserted here.
 */
export const INDIA_CITIES = [
  "Bengaluru", "Hyderabad", "Pune", "Chennai", "Gurugram",
  "Noida", "Mumbai", "Kolkata", "Ahmedabad", "Kochi", "Coimbatore", "Indore",
] as const;

export function indiaSite(city: string, nationalDevMedian: number, ratio: number): Metro {
  return {
    id: `in-${city.toLowerCase()}`,
    name: `${city}, India`,
    short: city,
    devMedian: Math.round(nationalDevMedian * ratio),
  };
}

export const isIndiaSite = (m: Metro) => m.id.startsWith("in-");

/** ₹ in the units Indians actually use: lakh below a crore, crore above. */
export function formatINR(usd: number): string {
  const r = usd * INR_PER_USD;
  if (r >= 1e7) return `₹${(r / 1e7).toFixed(2)} Cr`;
  return `₹${(r / 1e5).toFixed(1)} L`;
}

export const lpaToUsd = (lpa: number) => (lpa * 1e5) / INR_PER_USD;
export const usdToLpa = (usd: number) => (usd * INR_PER_USD) / 1e5;
