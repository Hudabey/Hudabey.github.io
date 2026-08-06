# LabOps — presentation site

Interactive slide deck for the Databases final project: **LabOps, a relational database
for GPU research-lab operations** (MySQL 9.7.1, SRH University). Companion to
`~/dbms-final/Hudeifa_Hassan_100002025_LabOps.pdf`.

## Run it

Open `index.html` in a browser — that's it. No server, no internet required:
the deck embeds a real SQLite engine (sql.js, WebAssembly, inlined base64 in
`vendor/`) loaded with the full LabOps schema and sample data, so every query
result on screen is computed live in the page.

Navigate with `←` `→` (or Space / PageUp / PageDown), `Home` / `End`, or the
numbered dots in the top bar.

## Slides

| # | Page | What it shows |
|---|------|---------------|
| 01 | `index.html` | Hero — chaos-to-tables animation |
| 02 | `problem.html` | Requirements: the lab, 4 business goals, users, rules |
| 03 | `er-model.html` | Interactive Crow's Foot ER diagram (hover to trace relationships) |
| 04 | `normalization.html` | FLAT → 1NF → 2NF → 3NF stepper with redundancy counter |
| 05 | `schema.html` | Constraint matrix + row counts read live from the embedded DB |
| 06 | `queries.html` | **Centerpiece** — Q1–Q11 running live, plus a free SQL console |
| 07 | `guardrails.html` | Audit trigger + `register_run()` procedure, both executable |
| 08 | `performance.html` | Full-scan vs B+-tree probe chart, growth-model slider |
| 09 | `acid-cap.html` | ACID with project examples, CAP pick-two explorer |
| 10 | `conclusion.html` | Three lessons + delivered/verified checklist |

## Dialect note

Displayed SQL is the MySQL 9.7.1 text from the report, verbatim. The live engine
is SQLite; Q1–Q10 run identically, Q11's view is pre-created at load (SQLite has
no `CREATE OR REPLACE VIEW`), the trigger is ported to `WHEN`-clause syntax, and
the stored procedure's semantics (VRAM check + one transaction) are executed via
explicit `BEGIN…COMMIT`. All outputs match the MySQL-verified outputs in the PDF
(checked against sqlite3 3.45 and sql.js 1.10).

## Files

- `style.css` / `script.js` — shared chrome (nav, progress, keyboard), demos, embedded schema, query collection
- `vendor/sql-wasm{-b64}.js`, `vendor/sql-wasm.wasm` — sql.js 1.10.2, vendored + base64-inlined so `file://` works offline
