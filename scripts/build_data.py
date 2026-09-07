#!/usr/bin/env python3
"""Build public/data/model.json from BLS OEWS and O*NET bulk files.

Downloads four public archives (no key, no account), extracts the fields the
simulator needs, and writes a single compact JSON:

  BLS OEWS May 2024 national      -> wage percentiles per occupation
  BLS OEWS May 2024 by industry   -> staffing pattern for NAICS 5415
  BLS OEWS May 2024 by metro area -> per-metro median wage per occupation
  O*NET 29.1 Technology Skills    -> technologies used in each occupation

Usage:  python3 scripts/build_data.py
Needs:  pandas, openpyxl
"""
import io, json, zipfile, pathlib, sys, urllib.request
import pandas as pd

UA = {"User-Agent": "riffed-data-build/1.0"}
OUT = pathlib.Path(__file__).resolve().parent.parent / "public" / "data" / "model.json"
CACHE = pathlib.Path(__file__).resolve().parent / ".cache"
NAICS = "5415"                 # Computer Systems Design and Related Services
SOFTWARE_DEV = "15-1252"       # used to rank metros by software employment
MAX_OCCUPATIONS = 36
MAX_METROS = 26
MAX_TECH_PER_OCC = 14

SOURCES = {
    "nat":  "https://www.bls.gov/oes/special-requests/oesm24nat.zip",
    "ind":  "https://www.bls.gov/oes/special-requests/oesm24in4.zip",
    "msa":  "https://www.bls.gov/oes/special-requests/oesm24ma.zip",
    "onet": "https://www.onetcenter.org/dl_files/database/db_29_1_text.zip",
}

# SOC major group -> function bucket. Overrides for the handful that land wrong.
MAJOR_FUNC = {"11": "leadership", "13": "operations", "15": "engineering",
              "17": "engineering", "19": "engineering", "23": "operations",
              "25": "operations", "27": "marketing", "29": "operations",
              "33": "operations", "35": "operations", "37": "operations",
              "39": "operations", "41": "sales", "43": "support",
              "45": "operations", "47": "operations", "49": "operations",
              "51": "operations", "53": "operations"}
FUNC_OVERRIDE = {"15-1232": "support", "15-1244": "support", "15-1231": "support",
                 "11-2021": "marketing", "11-2022": "sales", "13-1161": "marketing",
                 "11-3121": "operations", "11-3031": "operations"}


def fetch(key):
    CACHE.mkdir(exist_ok=True)
    p = CACHE / (key + ".zip")
    if not p.exists():
        print("  downloading %s ..." % key, flush=True)
        req = urllib.request.Request(SOURCES[key], headers=UA)
        with urllib.request.urlopen(req, timeout=600) as r:
            p.write_bytes(r.read())
    return zipfile.ZipFile(p)


def sheet(zf, suffix):
    name = [n for n in zf.namelist() if n.endswith(suffix)][0]
    return pd.read_excel(io.BytesIO(zf.read(name)))


def num(s):
    """OEWS wage columns carry sentinels: '#' = at or above $239,200, '*' = not
    released. Coerce to a number, mapping '#' to the published cap."""
    v = pd.to_numeric(s, errors="coerce")
    return v.mask(s.astype(str).str.strip() == "#", 239200)


def main():
    print("reading BLS industry staffing pattern (NAICS %s)" % NAICS)
    ind = sheet(fetch("ind"), "nat4d_M2024_dl.xlsx")
    ind = ind[(ind["NAICS"].astype(str).str.startswith(NAICS)) & (ind["O_GROUP"] == "detailed")].copy()
    ind["share"] = pd.to_numeric(ind["PCT_TOTAL"], errors="coerce")
    ind = ind.dropna(subset=["share"]).sort_values("share", ascending=False).head(MAX_OCCUPATIONS)
    socs = ind["OCC_CODE"].tolist()
    print("  %d occupations, %.1f%% of the industry" % (len(socs), ind["share"].sum()))

    print("reading BLS national wage percentiles")
    nat = sheet(fetch("nat"), "national_M2024_dl.xlsx")
    nat = nat[nat["OCC_CODE"].isin(socs)].copy()
    for c in ["A_PCT10", "A_PCT25", "A_MEDIAN", "A_PCT75", "A_PCT90"]:
        nat[c] = num(nat[c])
    nat = nat.dropna(subset=["A_MEDIAN"]).set_index("OCC_CODE")

    print("reading BLS metro wages")
    msa = sheet(fetch("msa"), "MSA_M2024_dl.xlsx")
    msa["A_MEDIAN"] = num(msa["A_MEDIAN"])
    msa["TOT_EMP"] = pd.to_numeric(msa["TOT_EMP"], errors="coerce")

    dev = msa[(msa["OCC_CODE"] == SOFTWARE_DEV) & msa["A_MEDIAN"].notna() & (msa["TOT_EMP"] > 3000)]
    dev = dev.sort_values("TOT_EMP", ascending=False)
    keep = list(dict.fromkeys(dev.head(MAX_METROS - 6)["AREA"].tolist()
                              + dev.sort_values("A_MEDIAN").head(6)["AREA"].tolist()))
    metros = []
    for a in keep:
        row = dev[dev["AREA"] == a].iloc[0]
        title = str(row["AREA_TITLE"])
        metros.append({"id": str(a), "name": title,
                       "short": title.split("-")[0].split(",")[0].strip(),
                       "devMedian": int(row["A_MEDIAN"])})
    metros.sort(key=lambda m: -m["devMedian"])
    print("  %d metros, $%d - $%d for software developers"
          % (len(metros), metros[-1]["devMedian"], metros[0]["devMedian"]))

    print("reading O*NET technology skills")
    onet = fetch("onet")
    tech = pd.read_csv(io.BytesIO(onet.read("db_29_1_text/Technology Skills.txt")), sep="\t", dtype=str)
    tech["soc"] = tech["O*NET-SOC Code"].str.slice(0, 7)
    tech = tech[tech["soc"].isin(socs)]

    msa_idx = msa.set_index(["AREA", "OCC_CODE"])["A_MEDIAN"].to_dict()
    occupations = []
    for _, r in ind.iterrows():
        soc = r["OCC_CODE"]
        if soc not in nat.index:
            continue
        n = nat.loc[soc]
        t = tech[tech["soc"] == soc]
        # O*NET lists technologies alphabetically, so taking the first N gives an
        # Adobe-heavy slice of every occupation. Prefer in-demand, then sample the
        # hot list at an even stride so the result spans the alphabet.
        demand = t[t["In Demand"] == "Y"]["Example"].drop_duplicates().tolist()
        hot = [x for x in t[t["Hot Technology"] == "Y"]["Example"].drop_duplicates().tolist()
               if x not in demand]
        room = max(0, MAX_TECH_PER_OCC - len(demand))
        if room and len(hot) > room:
            stride = len(hot) / room
            hot = [hot[int(i * stride)] for i in range(room)]
        rest = [x for x in t["Example"].drop_duplicates().tolist()
                if x not in demand and x not in hot]
        hot = demand + hot
        per_metro = {}
        for m in metros:
            v = msa_idx.get((int(m["id"]), soc)) or msa_idx.get((m["id"], soc))
            if v == v and v is not None:
                per_metro[m["id"]] = int(v)
        occupations.append({
            "soc": soc,
            "title": str(r["OCC_TITLE"]),
            "share": round(float(r["share"]), 3),
            "func": FUNC_OVERRIDE.get(soc, MAJOR_FUNC.get(soc[:2], "operations")),
            "nat": {"p10": int(n["A_PCT10"]), "p25": int(n["A_PCT25"]), "p50": int(n["A_MEDIAN"]),
                    "p75": int(n["A_PCT75"]), "p90": int(n["A_PCT90"])},
            "metro": per_metro,
            "tech": (hot + rest)[:MAX_TECH_PER_OCC],
        })

    model = {
        "meta": {
            "wages": "U.S. Bureau of Labor Statistics, Occupational Employment and Wage Statistics, May 2024",
            "staffing": "BLS OEWS May 2024, NAICS %s (Computer Systems Design and Related Services)" % NAICS,
            "technologies": "O*NET 29.1 Technology Skills, U.S. Department of Labor",
            "industryShareCovered": round(float(ind["share"].sum()), 1),
        },
        "metros": metros,
        "occupations": occupations,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(model, separators=(",", ":")))
    print("wrote %s  (%.0f KB, %d occupations, %d metros)"
          % (OUT, OUT.stat().st_size / 1024, len(occupations), len(metros)))


if __name__ == "__main__":
    sys.exit(main())
