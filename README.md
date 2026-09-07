# riffed

**[aritrade1709.github.io/riffed](https://aritrade1709.github.io/riffed/)**

Type your job title. A solver cuts fifteen percent of a company's payroll while
losing as few people as possible. Watch whether it keeps you.

## What it is

A layoff, run as an optimisation problem.

You give it one thing — what you do for a living. It assembles a four hundred
person company around you using federal employment data: the occupation mix of a
real industry, real wage distributions for each of those occupations in each
city, and the technologies the Department of Labor records as being used in each
job. You are placed in it at your own level, in your own city, paid what the
data says someone like you is paid there.

Then the company has to save fifteen percent of payroll, and a solver decides
who leaves.

The solver is given one objective and two constraints. The objective is to reach
the savings target while removing as few people as possible. The constraints are
that no technology in use may be lost entirely, and no team may be emptied.

It is told nothing about seniority. Nothing about tenure, performance, or where
anyone lives. Yet it removes roughly ninety percent of executives and no juniors
at all, and it cuts the expensive offices four times as hard as the cheap ones.
That is not a rule anyone wrote. Minimising headcount against a dollar target
means taking the largest salaries first, and the largest salaries are the senior
people in the expensive cities.

## Using it

- Type a job title. Around a thousand variants are recognised, including the
  shorthand — `SDE-3`, `SRE`, `TPM`, `MTS`, `EM`, `AE`, `PMM`.
- Set your city and level, or let the title fill the level in for you.
- Read the verdict, and the reason attached to it. If you survived, it tells you
  what saved you — usually that you are the only person who knows something.
- **Run it again with your salary twenty percent lower.** This is the point of
  the whole thing.

The same title always produces the same company. Nothing is sent anywhere; it
runs entirely in the browser.

## How it works

### Building the company

Occupation mix comes from the BLS staffing pattern for NAICS 5415, Computer
Systems Design and Related Services — the thirty-six largest occupations in that
industry, covering eighty-seven percent of its employment, sampled in their
published proportions. So the generated company is about a fifth software
developers, six percent user support, five percent systems managers, and so on,
because that is what the industry is.

Five offices are drawn per company. The user's city is always one of them; the
rest are sampled with probability proportional to the square root of local
software employment. Raw employment weighting puts every office in the same
handful of expensive hubs, which is not how companies distribute sites; the
square root flattens it.

Each person is assigned a position in their occupation's wage distribution by
averaging three uniform draws, which concentrates people in the middle of their
band without asserting a distribution shape the source data does not provide.
Their salary is then interpolated through the five published percentiles for
that occupation — 10th, 25th, median, 75th, 90th — and scaled to their city by
the ratio of the local median for that occupation to the national one. Where a
city does not publish a figure for a given occupation, the local software
developer wage relative to the national one is used as the proxy.

Technologies come from O*NET's mapping of technologies to occupations. Each
person gets two or three, the first drawn from the head of their occupation's
list and the rest from further down it, so that a handful of technologies end up
with exactly one holder in the company. Those are the people the coverage
constraint protects.

### The cut

Minimising the number of people removed subject to a sum threshold is trivially
optimal when unconstrained: sort by salary descending and take from the top. The
coverage and team constraints turn it into a variant of set cover, so the
implementation is a greedy pass that takes the most expensive feasible person at
each step and passes over anyone whose removal would leave a technology unheld or
a team empty. It stops the moment the target is met, which is why what happens to
you can come down to whether the solver ever reached your salary.

Cutting eight percent of headcount produces fifteen percent of payroll.

### Job titles

The Department of Labor publishes an alternate-title list with 55,120 entries,
and it exact-matches only about fifty-eight percent of ordinary technology job
titles. Several of the matches it does make are confidently wrong: it maps
*Product Manager* to Marketing Managers and *Staff Engineer* to Computer Hardware
Engineers. It has no entry for site reliability engineer, no product designer
that is not a web designer, and no product manager at all.

Fuzzy matching makes this worse rather than better. String similarity over
46,000 occupation names resolves *Product Design Lead II* to Mechanical
Drafters, *AVP Operations* to Military Officer Special and Tactical Operations
Leaders, and *Growth Marketer* to Forest and Conservation Workers — fluently,
and with nothing to indicate anything has gone wrong. A silently mistyped
occupation poisons every number downstream of it.

So there is no fuzzy matching here. Titles are resolved by normalising, then
progressively removing level words in a defined order — rank words such as
*senior* and *staff* before role words such as *manager*, because "Senior
Product Manager" must lose *senior* first or it reduces to "senior product" and
matches nothing — and looking up each successive form in a hand-written table of
around a thousand modern job titles. The level that was stripped away becomes
the person's seniority. Titles that contain *manager* but describe individual
contributors are listed explicitly, so a product manager is not given reports.

Anything that does not resolve is handed back to the reader as a chooser. The
resolver never guesses.

## Running locally

```bash
pnpm install
pnpm dev
```

No environment variables, no API keys, no accounts.

| Command | |
|---|---|
| `pnpm dev` | development server |
| `pnpm build` | production build |
| `pnpm test` | title resolution and solver tests |
| `pnpm data` | regenerate `public/data/model.json` from source (needs Python, pandas, openpyxl) |

The test suite checks the resolver against sixty known titles, then simulates a
hundred and eight companies and asserts the invariants hold in all of them — the
savings target is met, no technology is lost, no team is emptied — along with
the two claims the project makes about the result.

## Built with

TypeScript and Vite, no framework and no runtime dependencies. The data is
precomputed into a single 32 KB JSON file by a Python script, so the page is
static and self-contained. Deployed on GitHub Pages.

## Data sources

| Source | Used for | Terms |
|---|---|---|
| [BLS OEWS May 2024, national](https://www.bls.gov/oes/tables.htm) | Wage percentiles per occupation | Public domain (US Government work) |
| [BLS OEWS May 2024, by industry](https://www.bls.gov/oes/tables.htm) | Occupation mix for NAICS 5415 | Public domain |
| [BLS OEWS May 2024, by metro area](https://www.bls.gov/oes/tables.htm) | Median wage per occupation per city | Public domain |
| [O*NET 29.1, Technology Skills](https://www.onetcenter.org/database.html) | Technologies used in each occupation | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), US Department of Labor |

O*NET® is a trademark of the U.S. Department of Labor, Employment and Training
Administration.

The company is generated. The numbers inside it are not.

## License

MIT
