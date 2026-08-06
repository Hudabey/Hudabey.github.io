/* =============================================================================
   LabOps — interactive engine
   Per-page demos are dispatched from initPage() based on body[data-page].
   Pages 5–7 embed a real SQLite database (sql.js / WebAssembly) loaded with
   the LabOps schema; every query result on screen is computed live.
   ============================================================================= */
(() => {
'use strict';

/* ----- Page list (source of truth for nav) -------------------------------- */
const PAGES = [
  { n: 1,  href: 'index.html',         title: 'Hero',           short: 'LabOps' },
  { n: 2,  href: 'problem.html',       title: 'The problem',    short: 'Requirements' },
  { n: 3,  href: 'er-model.html',      title: 'ER model',       short: 'Design' },
  { n: 4,  href: 'normalization.html', title: 'Normalization',  short: '3NF' },
  { n: 5,  href: 'schema.html',        title: 'Implementation', short: 'Constraints' },
  { n: 6,  href: 'queries.html',       title: 'Live queries',   short: 'Q1–Q11' },
  { n: 7,  href: 'guardrails.html',    title: 'Guardrails',     short: 'Trigger · proc' },
  { n: 8,  href: 'performance.html',   title: 'Performance',    short: 'Millions of rows' },
  { n: 9,  href: 'acid-cap.html',      title: 'ACID & CAP',     short: 'Guarantees' },
  { n: 10, href: 'conclusion.html',    title: 'Takeaways',      short: 'Wrap-up' },
];

/* ----- Utilities ---------------------------------------------------------- */
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp  = (a, b, t) => a + (b - a) * t;
const TAU   = Math.PI * 2;
const PALETTE = ['#10b981','#22d3ee','#34d399','#fbbf24','#f472b6','#60a5fa','#f87171','#6ee7b7','#4ade80','#fb923c','#e879f9','#38bdf8'];

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function setupCanvas(canvas, opts={}) {
  const dpr = window.devicePixelRatio || 1;
  function resize() {
    const r = canvas.getBoundingClientRect();
    const w = Math.max(opts.minW || 320, Math.floor(r.width));
    let h = Math.floor(r.height);
    if (h < 60) {
      h = opts.height || Math.floor(w * (opts.ratio || 0.55));
      canvas.style.height = h + 'px';
    }
    canvas.width  = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    canvas._w = w; canvas._h = h;
    if (opts.onResize) opts.onResize(w, h);
  }
  Promise.resolve().then(resize);
  window.addEventListener('resize', resize);
  return { resize };
}

function mulberry32(seed) {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* =============================================================================
   Top progress + dot nav + keyboard nav (chrome)
   ============================================================================= */
function initChrome() {
  const page = +document.body.dataset.page || 1;
  const progress = $('.progress');
  if (progress) progress.style.setProperty('--progress', ((page - 1) / (PAGES.length - 1) * 100) + '%');

  const dots = $('.dots');
  if (dots) {
    dots.innerHTML = '';
    PAGES.forEach(p => {
      const a = document.createElement('a');
      a.href = p.href; a.dataset.n = p.n; a.textContent = String(p.n).padStart(2,'0');
      a.title = `${p.n}. ${p.title}`;
      if (p.n === page) a.classList.add('active');
      dots.appendChild(a);
    });
  }

  const counter = $('.counter');
  if (counter) counter.innerHTML = `<b>${String(page).padStart(2,'0')}</b> <span>/ ${PAGES.length}</span>`;

  const prev = $('.navbtn.prev'), next = $('.navbtn.next');
  const prevP = PAGES[page - 2], nextP = PAGES[page];
  if (prev) {
    if (prevP) {
      prev.href = prevP.href;
      prev.querySelector('.title').textContent = prevP.title;
      prev.querySelector('small').textContent = `${String(prevP.n).padStart(2,'0')} · prev`;
    } else { prev.classList.add('disabled'); }
  }
  if (next) {
    if (nextP) {
      next.href = nextP.href;
      next.querySelector('.title').textContent = nextP.title;
      next.querySelector('small').textContent  = `${String(nextP.n).padStart(2,'0')} · next`;
    } else { next.classList.add('disabled'); }
  }

  document.addEventListener('keydown', (e) => {
    const tgt = e.target;
    if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.tagName === 'SELECT')) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
      if (nextP) { e.preventDefault(); window.location.href = nextP.href; }
    } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
      if (prevP) { e.preventDefault(); window.location.href = prevP.href; }
    } else if (e.key === 'Home') {
      e.preventDefault(); window.location.href = PAGES[0].href;
    } else if (e.key === 'End') {
      e.preventDefault(); window.location.href = PAGES[PAGES.length - 1].href;
    }
  });

  const io = ('IntersectionObserver' in window) ? new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('in'); });
  }, { threshold: 0.1 }) : null;
  if (io) $$('.reveal').forEach(el => io.observe(el));
  else $$('.reveal').forEach(el => el.classList.add('in'));

  $$('pre.sql, code.sql').forEach(el => { el.innerHTML = hlSQL(el.textContent); });
}

/* =============================================================================
   SQL syntax highlighter (display only)
   ============================================================================= */
const SQL_KW = /\b(SELECT|FROM|WHERE|JOIN|LEFT|RIGHT|INNER|OUTER|ON|GROUP|ORDER|BY|HAVING|AS|AND|OR|NOT|IN|BETWEEN|LIKE|IS|NULL|CASE|WHEN|THEN|ELSE|END|WITH|OVER|PARTITION|RANK|ROW_NUMBER|COUNT|SUM|AVG|MIN|MAX|ROUND|CREATE|OR|REPLACE|VIEW|TABLE|TRIGGER|PROCEDURE|AFTER|UPDATE|INSERT|INTO|VALUES|SET|DELETE|DROP|IF|EXISTS|FOR|EACH|ROW|BEGIN|DECLARE|EXIT|HANDLER|SQLEXCEPTION|ROLLBACK|RESIGNAL|SIGNAL|SQLSTATE|MESSAGE_TEXT|START|TRANSACTION|COMMIT|CALL|DELIMITER|PRIMARY|FOREIGN|KEY|REFERENCES|UNIQUE|CHECK|DEFAULT|CONSTRAINT|CASCADE|AUTO_INCREMENT|AUTOINCREMENT|ENUM|DISTINCT|LIMIT|DESC|ASC|USE|NEW|OLD|TRUE|FALSE|VARCHAR|INT|INTEGER|SMALLINT|DECIMAL|DATE|DATETIME|BOOLEAN|TEXT|LAST_INSERT_ID|NOW|PRAGMA|WHEN)\b/gi;
function hlSQL(src) {
  let out = '';
  const parts = esc(src).split(/('(?:[^']|'')*'|--[^\n]*)/g);
  for (const p of parts) {
    if (p == null || p === '') continue;
    if (p.startsWith('--')) out += `<span class="cm">${p}</span>`;
    else if (p.startsWith("'")) out += `<span class="str">${p}</span>`;
    else out += p
      .replace(SQL_KW, m => `<span class="kw">${m}</span>`)
      .replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="num">$1</span>');
  }
  return out;
}

/* =============================================================================
   Embedded database (sql.js) — LabOps schema, SQLite dialect
   ============================================================================= */
const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;
CREATE TABLE researchers (
    researcher_id   INTEGER       PRIMARY KEY AUTOINCREMENT,
    full_name       VARCHAR(80)   NOT NULL,
    email           VARCHAR(120)  NOT NULL UNIQUE,
    lab_role        TEXT          NOT NULL DEFAULT 'msc' CHECK (lab_role IN ('lead','phd','msc','engineer')),
    joined_date     DATE          NOT NULL
);
CREATE TABLE projects (
    project_id          INTEGER      PRIMARY KEY AUTOINCREMENT,
    project_name        VARCHAR(60)  NOT NULL UNIQUE,
    focus_area          VARCHAR(80)  NOT NULL,
    status              TEXT         NOT NULL DEFAULT 'active' CHECK (status IN ('active','frozen','closed')),
    started_date        DATE         NOT NULL,
    lead_researcher_id  INTEGER      NOT NULL,
    CONSTRAINT fk_projects_lead
        FOREIGN KEY (lead_researcher_id) REFERENCES researchers(researcher_id)
);
CREATE TABLE gpu_nodes (
    node_id      INTEGER       PRIMARY KEY AUTOINCREMENT,
    provider     VARCHAR(40)   NOT NULL,
    gpu_model    VARCHAR(40)   NOT NULL,
    vram_gb      SMALLINT      NOT NULL,
    hourly_usd   DECIMAL(6,2)  NOT NULL,
    region       VARCHAR(30)   NOT NULL DEFAULT 'EU-West',
    CONSTRAINT chk_vram   CHECK (vram_gb > 0),
    CONSTRAINT chk_price  CHECK (hourly_usd >= 0)
);
CREATE TABLE experiment_runs (
    run_id         INTEGER       PRIMARY KEY AUTOINCREMENT,
    project_id     INTEGER       NOT NULL,
    node_id        INTEGER       NOT NULL,
    researcher_id  INTEGER       NOT NULL,
    run_label      VARCHAR(80)   NOT NULL,
    started_at     DATETIME      NOT NULL,
    duration_min   INTEGER       NOT NULL,
    status         TEXT          NOT NULL DEFAULT 'RUNNING' CHECK (status IN ('GREEN','MIXED','FAILED','RUNNING')),
    notes          VARCHAR(255),
    CONSTRAINT chk_duration CHECK (duration_min > 0),
    CONSTRAINT fk_runs_project    FOREIGN KEY (project_id)    REFERENCES projects(project_id),
    CONSTRAINT fk_runs_node       FOREIGN KEY (node_id)       REFERENCES gpu_nodes(node_id),
    CONSTRAINT fk_runs_researcher FOREIGN KEY (researcher_id) REFERENCES researchers(researcher_id)
);
CREATE INDEX idx_runs_project ON experiment_runs(project_id);
CREATE INDEX idx_runs_node    ON experiment_runs(node_id);
CREATE INDEX idx_runs_started ON experiment_runs(started_at);
CREATE TABLE run_metrics (
    metric_id     INTEGER        PRIMARY KEY AUTOINCREMENT,
    run_id        INTEGER        NOT NULL,
    metric_name   VARCHAR(40)    NOT NULL,
    metric_value  DECIMAL(12,4)  NOT NULL,
    CONSTRAINT uq_run_metric UNIQUE (run_id, metric_name),
    CONSTRAINT fk_metrics_run FOREIGN KEY (run_id)
        REFERENCES experiment_runs(run_id) ON DELETE CASCADE
);
CREATE TABLE checkpoints (
    checkpoint_id  INTEGER       PRIMARY KEY AUTOINCREMENT,
    run_id         INTEGER       NOT NULL,
    file_path      VARCHAR(200)  NOT NULL,
    size_gb        DECIMAL(7,2)  NOT NULL,
    is_release     BOOLEAN       NOT NULL DEFAULT FALSE,
    CONSTRAINT chk_size CHECK (size_gb > 0),
    CONSTRAINT fk_ckpt_run FOREIGN KEY (run_id)
        REFERENCES experiment_runs(run_id) ON DELETE CASCADE
);
CREATE TABLE claims (
    claim_id    INTEGER       PRIMARY KEY AUTOINCREMENT,
    project_id  INTEGER       NOT NULL,
    claim_code  VARCHAR(10)   NOT NULL UNIQUE,
    statement   VARCHAR(255)  NOT NULL,
    verdict     TEXT          NOT NULL DEFAULT 'OPEN' CHECK (verdict IN ('SUPPORTED','REFUTED','OPEN')),
    CONSTRAINT fk_claims_project FOREIGN KEY (project_id) REFERENCES projects(project_id)
);
CREATE TABLE run_claims (
    run_id         INTEGER NOT NULL,
    claim_id       INTEGER NOT NULL,
    evidence_note  VARCHAR(160),
    PRIMARY KEY (run_id, claim_id),
    CONSTRAINT fk_rc_run   FOREIGN KEY (run_id)   REFERENCES experiment_runs(run_id) ON DELETE CASCADE,
    CONSTRAINT fk_rc_claim FOREIGN KEY (claim_id) REFERENCES claims(claim_id)
);
CREATE TABLE run_audit (
    audit_id    INTEGER   PRIMARY KEY AUTOINCREMENT,
    run_id      INTEGER   NOT NULL,
    old_status  VARCHAR(10),
    new_status  VARCHAR(10),
    changed_at  DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER trg_run_status_audit
AFTER UPDATE ON experiment_runs
FOR EACH ROW
WHEN NEW.status <> OLD.status
BEGIN
    INSERT INTO run_audit (run_id, old_status, new_status)
    VALUES (NEW.run_id, OLD.status, NEW.status);
END;
INSERT INTO researchers (full_name, email, lab_role, joined_date) VALUES
('Hudeifa Hassan',  'hudeifa.hassan@lab.example',  'lead',     '2025-10-01'),
('Lena Okafor',     'lena.okafor@lab.example',     'phd',      '2025-11-15'),
('Tomas Keller',    'tomas.keller@lab.example',    'engineer', '2026-01-10'),
('Priya Nair',      'priya.nair@lab.example',      'phd',      '2026-02-01'),
('Aisha Rahman',    'aisha.rahman@lab.example',    'msc',      '2026-03-20'),
('Marek Novak',     'marek.novak@lab.example',     'msc',      '2026-04-05');
INSERT INTO projects (project_name, focus_area, status, started_date, lead_researcher_id) VALUES
('Helios-2',       'Video VAE decode acceleration',          'active', '2026-05-10', 1),
('K3-Engineer',    'Expert subnetwork extraction from MoE',  'active', '2026-07-20', 1),
('SLA-Ablation',   'Sparse-linear attention for video DiT',  'closed', '2026-03-01', 2),
('KDEFormer-Port', 'KDE-based attention approximation',      'frozen', '2026-04-15', 4),
('SpecDec-AR',     'Speculative decoding for AR video',      'active', '2026-06-01', 2),
('ReMass',         'Mass-aware sparse attention reference',  'active', '2026-07-01', 5);
INSERT INTO gpu_nodes (provider, gpu_model, vram_gb, hourly_usd, region) VALUES
('RunPod',    'H100 SXM',   80, 2.99, 'EU-West'),
('RunPod',    'A100 80GB',  80, 1.89, 'EU-West'),
('Lambda',    'H100 PCIe',  80, 2.49, 'US-East'),
('RunPod',    'RTX 4090',   24, 0.44, 'EU-Central'),
('Vast.ai',   'A6000',      48, 0.79, 'US-West'),
('CoreWeave', 'H100 SXM',   80, 3.29, 'US-East'),
('Lambda',    'B200',      192, 5.49, 'US-East');
INSERT INTO experiment_runs
(project_id, node_id, researcher_id, run_label, started_at, duration_min, status, notes) VALUES
(1, 1, 1, 'vae-stage0-blockprune',     '2026-06-14 09:12:00', 310, 'GREEN',  'up_blocks.3 load-bearing; keep all 3 ResBlocks'),
(1, 1, 3, 'trt-fp16-pilot',            '2026-06-18 14:05:00', 145, 'GREEN',  'TensorRT FP16 engine builds clean'),
(1, 2, 3, 'trt-fp8-pilot',             '2026-06-21 10:40:00', 190, 'MIXED',  'FP8 speedup real but banding artifacts'),
(1, 1, 1, 'section-cache-m1m2m3',      '2026-07-02 08:30:00', 420, 'GREEN',  'byte-equal output, -12.2% wall'),
(1, 4, 5, 'triton-conv-sweep',         '2026-07-05 16:20:00', 260, 'FAILED', 'best kernel 0.88x cuDNN; abandon'),
(2, 1, 1, 'router-trace-capture',      '2026-07-24 11:00:00', 240, 'GREEN',  'traces + atlas v0 written'),
(2, 1, 1, 'expert-freq-atlas',         '2026-07-27 09:45:00', 380, 'GREEN',  'per-domain expert histograms stable'),
(2, 6, 3, 'prune-cap0-gate',           '2026-07-30 13:15:00', 510, 'MIXED',  'G1 pass, G2 hard fail, G3 formal fail'),
(3, 2, 2, 'sla-k5-repro-freeze',       '2026-05-03 07:50:00', 615, 'GREEN',  'median rel 0.118 reproducible'),
(3, 2, 2, 'sla-motivation-ablation',   '2026-05-08 12:10:00', 340, 'GREEN',  'ablation grid complete'),
(3, 4, 6, 'sla-lowrank-sanity',        '2026-05-12 18:00:00',  95, 'FAILED', 'OOM at r=1024 on 24GB card'),
(4, 2, 4, 'wkde1-plumbing-oracle',     '2026-06-10 10:25:00', 180, 'GREEN',  'oracle error ~1e-6, plumbing correct'),
(4, 2, 4, 'wkde2-real-traces',         '2026-06-16 09:35:00', 480, 'MIXED',  'n=4 Spearman weak; sampler mass-blind'),
(5, 1, 2, 'drafter-4step-bank',        '2026-06-25 15:45:00', 300, 'GREEN',  '4-step drafter banked'),
(5, 1, 2, 'batch2-throughput-probe',   '2026-07-08 11:30:00', 220, 'MIXED',  'B=2 fits memory; throughput unproven'),
(5, 3, 6, 'fp8-drafter-probe',         '2026-07-12 14:55:00', 130, 'FAILED', 'numerics diverge after chunk 3'),
(6, 1, 5, 'rectified-spaattn-control', '2026-07-14 09:05:00', 350, 'GREEN',  'baseline reproduced within 1%'),
(6, 1, 5, 'mass-aware-ref-v1',         '2026-07-19 10:15:00', 400, 'GREEN',  'beats pooling reference at 90% sparsity'),
(6, 2, 5, 'mass-aware-ref-k97',        '2026-07-23 08:20:00', 460, 'MIXED',  'quality holds, kernel slower than budget'),
(6, 5, 6, 'ablation-random-mask',      '2026-07-26 17:40:00', 150, 'GREEN',  'random-mask control done');
INSERT INTO run_metrics (run_id, metric_name, metric_value) VALUES
(1,'psnr_db',38.42),(1,'decode_fps',21.7),
(2,'decode_fps',25.12),(2,'psnr_db',38.1),
(3,'decode_fps',28.9),(3,'psnr_db',33.45),
(4,'decode_fps',28.61),(4,'wall_ms',3862.18),
(5,'kernel_speedup',0.88),
(6,'trace_rows_m',118),(6,'router_entropy',2.31),
(7,'expert_coverage',0.964),(7,'atlas_domains',12),
(8,'flip_rate',0.31),(8,'nll_delta',0.214),
(9,'rel_err_median',0.118),(9,'sparsity_pct',95),
(10,'rel_err_median',0.131),(10,'sparsity_pct',95),
(11,'oom_at_rank',1024),
(12,'oracle_err',0),(12,'sparsity_pct',90),
(13,'spearman_n4',0.41),(13,'sparsity_pct',90),
(14,'accept_rate',0.68),(14,'steps',4),
(15,'batch_fit',2),(15,'vram_peak_gb',71.3),
(16,'divergence_chunk',3),
(17,'psnr_db',35.9),(17,'sparsity_pct',93),
(18,'psnr_db',36.72),(18,'sparsity_pct',90),
(19,'psnr_db',36.1),(19,'sparsity_pct',97),
(20,'psnr_db',29.8),(20,'sparsity_pct',90);
INSERT INTO checkpoints (run_id, file_path, size_gb, is_release) VALUES
(2,  '/ckpt/helios2/trt_fp16_engine.plan',      4.80, TRUE),
(4,  '/ckpt/helios2/section_cache_v3.pt',       9.20, TRUE),
(6,  '/ckpt/k3/router_traces_v0.parquet',      62.50, FALSE),
(7,  '/ckpt/k3/expert_atlas_v0.npz',           11.40, TRUE),
(9,  '/ckpt/sla/lr_exact_r512.pt',              6.75, TRUE),
(12, '/ckpt/kde/wkde1_oracle_dump.pt',          2.30, FALSE),
(14, '/ckpt/specdec/drafter_4step.safetensors', 5.10, TRUE),
(17, '/ckpt/remass/spaattn_control.pt',         7.90, FALSE),
(18, '/ckpt/remass/mass_ref_v1.pt',             8.05, TRUE),
(19, '/ckpt/remass/mass_ref_k97.pt',            8.05, FALSE);
INSERT INTO claims (project_id, claim_code, statement, verdict) VALUES
(1, 'C1', 'All three ResBlocks of up_blocks.3 are load-bearing for decode quality',        'SUPPORTED'),
(1, 'C2', 'A custom Triton kernel can beat cuDNN NDHWC for VAE convolutions',              'REFUTED'),
(1, 'C3', 'Intra-section history caching preserves byte-equal outputs',                    'SUPPORTED'),
(2, 'C4', 'A domain-pruned expert subnetwork preserves K3 engineering competence',         'OPEN'),
(3, 'C5', 'Per-layer low-rank correction halves median relative error at k=5%',            'SUPPORTED'),
(4, 'C6', 'KDE sampling matches top-k selection at equal budget on real traces',           'REFUTED'),
(5, 'C7', 'A 4-step drafter reaches usable acceptance rates for AR video',                 'SUPPORTED'),
(6, 'C8', 'Reference quality, not block selection, sets the sparsity frontier',            'OPEN');
INSERT INTO run_claims (run_id, claim_id, evidence_note) VALUES
(1,  1, 'pruning any ResBlock drops PSNR > 4 dB'),
(5,  2, 'best sweep kernel reached only 0.88x cuDNN'),
(4,  3, 'SHA-256 of outputs identical with cache on/off'),
(6,  4, 'trace corpus captured; no verdict yet'),
(8,  4, 'flip ceiling breached at cap0; NLL separates'),
(9,  5, 'median rel 0.118 vs 0.326 baseline'),
(10, 5, 'ablation confirms low-rank term drives the gain'),
(13, 6, 'n=4 Spearman 0.41; mass-blind sampler is the failure'),
(14, 7, 'acceptance 0.68 at 4 steps'),
(17, 8, 'control reproduced; frontier comparison enabled'),
(18, 8, 'mass-aware reference beats pooling at 90%'),
(19, 8, 'holds at 97% sparsity; speed still short of budget');
CREATE VIEW project_dashboard AS
SELECT p.project_name,
       p.status                                            AS project_status,
       COUNT(r.run_id)                                     AS runs,
       SUM(CASE WHEN r.status = 'GREEN' THEN 1 ELSE 0 END) AS green_runs,
       ROUND(SUM(r.duration_min / 60.0 * g.hourly_usd), 2) AS spend_usd,
       (SELECT COUNT(*)
        FROM   checkpoints c
        JOIN   experiment_runs r2 ON r2.run_id = c.run_id
        WHERE  r2.project_id = p.project_id)               AS checkpoints
FROM   projects p
LEFT JOIN experiment_runs r ON r.project_id = p.project_id
LEFT JOIN gpu_nodes g       ON g.node_id    = r.node_id
GROUP BY p.project_id, p.project_name, p.status;
`;

let SQLmod = null, db = null, dbReadyPromise = null;

function dbInit() {
  if (dbReadyPromise) return dbReadyPromise;
  dbReadyPromise = (async () => {
    const b64 = window.SQL_WASM_B64;
    const raw = atob(b64);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    SQLmod = await initSqlJs({ wasmBinary: bytes.buffer });
    db = new SQLmod.Database();
    db.run(SCHEMA_SQL);
    announceEngine();
    return db;
  })();
  return dbReadyPromise;
}

function dbReset() {
  if (!SQLmod) return;
  if (db) db.close();
  db = new SQLmod.Database();
  db.run(SCHEMA_SQL);
  announceEngine();
}

function announceEngine() {
  const el = $('#engine-badge');
  if (!el || !db) return;
  const t = db.exec("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")[0].values[0][0];
  const r = db.exec(`SELECT (SELECT COUNT(*) FROM researchers)+(SELECT COUNT(*) FROM projects)+(SELECT COUNT(*) FROM gpu_nodes)
    +(SELECT COUNT(*) FROM experiment_runs)+(SELECT COUNT(*) FROM run_metrics)+(SELECT COUNT(*) FROM checkpoints)
    +(SELECT COUNT(*) FROM claims)+(SELECT COUNT(*) FROM run_claims)+(SELECT COUNT(*) FROM run_audit)`)[0].values[0][0];
  el.textContent = `SQLite live · ${t} tables · ${r} rows`;
  el.classList.remove('hidden');
}

function runSQL(sql) {
  const t0 = performance.now();
  const res = db.exec(sql);
  const ms = performance.now() - t0;
  return { res, ms };
}

const STATUS_VALS = new Set(['GREEN','MIXED','FAILED','RUNNING','SUPPORTED','REFUTED','OPEN','HEAVY','MODERATE','LIGHT','active','frozen','closed']);
function renderTable(result, fmt={}) {
  if (!result || !result.length) return '<div class="muted" style="padding:14px;font-family:var(--mono);font-size:12px">∅ empty result set</div>';
  const { columns, values } = result[0];
  let h = '<div class="rwrap"><table class="rtable"><thead><tr>';
  columns.forEach(c => h += `<th>${esc(c)}</th>`);
  h += '</tr></thead><tbody>';
  values.forEach(row => {
    h += '<tr>';
    row.forEach((v, i) => {
      const col = columns[i];
      if (v === null) { h += '<td class="muted">NULL</td>'; return; }
      if (typeof v === 'string' && STATUS_VALS.has(v)) {
        const cls = { SUPPORTED:'GREEN', REFUTED:'FAILED', OPEN:'RUNNING', HEAVY:'FAILED', MODERATE:'MIXED', LIGHT:'GREEN', active:'GREEN', frozen:'RUNNING', closed:'MIXED' }[v] || v;
        h += `<td><span class="pill-status ${cls}">${esc(v)}</span></td>`; return;
      }
      if (typeof v === 'number') {
        const d = fmt[col];
        h += `<td class="num">${d != null ? v.toFixed(d) : (Number.isInteger(v) ? v : v)}</td>`; return;
      }
      h += `<td>${esc(v)}</td>`;
    });
    h += '</tr>';
  });
  h += '</tbody></table></div>';
  return h;
}

/* =============================================================================
   Query collection (Q1–Q11 run live; SQL text identical to the report)
   ============================================================================= */
const QUERIES = [
  {
    id: 'Q1', title: 'SELECT · WHERE · LIKE · ORDER BY', short: 'Filter & sort',
    q: 'Which runs were executed on any H100 variant, longest first?',
    concepts: ['SELECT','WHERE','LIKE','ORDER BY'],
    sql: `SELECT r.run_label, g.gpu_model, g.provider, r.duration_min, r.status
FROM   experiment_runs r
JOIN   gpu_nodes g ON g.node_id = r.node_id
WHERE  g.gpu_model LIKE 'H100%'
ORDER BY r.duration_min DESC;`,
    note: `LIKE 'H100%' matches both SXM and PCIe form factors; the descending sort surfaces the most expensive occupancies immediately.`,
  },
  {
    id: 'Q2', title: 'COUNT · SUM · AVG · MIN · MAX', short: 'All five aggregates',
    q: 'What does our overall run activity look like per run status?',
    concepts: ['GROUP BY','aggregates'],
    sql: `SELECT status,
       COUNT(*)                 AS runs,
       SUM(duration_min)        AS total_min,
       ROUND(AVG(duration_min)) AS avg_min,
       MIN(duration_min)        AS shortest,
       MAX(duration_min)        AS longest
FROM   experiment_runs
GROUP BY status;`,
    fmt: { avg_min: 0 },
    note: `GREEN runs dominate wall-clock while FAILED runs are short (avg 162 min) — failures tend to be caught early, which is what a healthy experiment loop should show.`,
  },
  {
    id: 'Q3', title: 'INNER JOIN · GROUP BY · derived column', short: 'GPU spend per project',
    q: 'How much money has each project burned on GPU rental? (cost = hours × hourly rate)',
    concepts: ['JOIN','GROUP BY','derived'],
    sql: `SELECT p.project_name,
       COUNT(r.run_id)                                      AS runs,
       ROUND(SUM(r.duration_min / 60.0 * g.hourly_usd), 2)  AS gpu_spend_usd
FROM   experiment_runs r
JOIN   projects  p ON p.project_id = r.project_id
JOIN   gpu_nodes g ON g.node_id    = r.node_id
GROUP BY p.project_name
ORDER BY gpu_spend_usd DESC;`,
    fmt: { gpu_spend_usd: 2 },
    note: `K3-Engineer is the most expensive project despite fewer runs than Helios-2 — all of its runs sit on premium H100 SXM nodes.`,
  },
  {
    id: 'Q4', title: 'LEFT JOIN (anti-join)', short: 'Idle-spend detector',
    q: 'Which rented node types have never run a single experiment? (idle spend risk)',
    concepts: ['LEFT JOIN','IS NULL'],
    sql: `SELECT g.provider, g.gpu_model, g.vram_gb, g.hourly_usd
FROM   gpu_nodes g
LEFT JOIN experiment_runs r ON r.node_id = g.node_id
WHERE  r.run_id IS NULL;`,
    fmt: { hourly_usd: 2 },
    note: `The reserved B200 at $5.49/hr has never hosted a run — pure idle-spend risk. An INNER JOIN could never answer this question.`,
  },
  {
    id: 'Q5', title: 'GROUP BY · HAVING · CASE in aggregate', short: 'Failure-rate filter',
    q: 'Which projects have a failure rate above 20% and should be re-scoped?',
    concepts: ['HAVING','CASE','GROUP BY'],
    sql: `SELECT p.project_name,
       COUNT(*)                                             AS runs,
       SUM(CASE WHEN r.status = 'FAILED' THEN 1 ELSE 0 END) AS failed,
       ROUND(100.0 * SUM(CASE WHEN r.status = 'FAILED' THEN 1 ELSE 0 END)
                   / COUNT(*), 1)                            AS fail_pct
FROM   experiment_runs r
JOIN   projects p ON p.project_id = r.project_id
GROUP BY p.project_name
HAVING fail_pct > 20
ORDER BY fail_pct DESC;`,
    fmt: { fail_pct: 1 },
    note: `The CASE expression turns run status into a 0/1 flag so SUM acts as a conditional counter; HAVING then filters on the aggregated percentage — a filter WHERE cannot express.`,
  },
  {
    id: 'Q6', title: 'IN · BETWEEN over a date range', short: 'Provider + time window',
    q: 'Which July-2026 runs used our two main cloud providers?',
    concepts: ['IN','BETWEEN','dates'],
    sql: `SELECT r.run_label, g.provider, r.started_at, r.status
FROM   experiment_runs r
JOIN   gpu_nodes g ON g.node_id = r.node_id
WHERE  g.provider IN ('RunPod', 'Lambda')
  AND  r.started_at BETWEEN '2026-07-01 00:00:00' AND '2026-07-31 23:59:59'
ORDER BY r.started_at;`,
    note: `BETWEEN bounds the datetime window; IN restricts the provider set without chained ORs.`,
  },
  {
    id: 'Q7', title: 'Correlated subquery', short: 'Longer than own project avg',
    q: "Which runs lasted longer than the average run of their own project? (candidates for cost review)",
    concepts: ['correlated subquery'],
    sql: `SELECT p.project_name, r.run_label, r.duration_min
FROM   experiment_runs r
JOIN   projects p ON p.project_id = r.project_id
WHERE  r.duration_min > (SELECT AVG(r2.duration_min)
                         FROM   experiment_runs r2
                         WHERE  r2.project_id = r.project_id)
ORDER BY p.project_name, r.duration_min DESC;`,
    note: `The inner query re-evaluates per outer row (correlated on project_id), so each run is compared against its own project's baseline, not a global mean.`,
  },
  {
    id: 'Q8', title: 'Window: RANK() OVER (PARTITION BY)', short: 'Quality leaderboard',
    q: "Rank each project's runs by PSNR quality; rank 1 is the project's best-quality run.",
    concepts: ['window function','RANK'],
    sql: `SELECT p.project_name, r.run_label, m.metric_value AS psnr_db,
       RANK() OVER (PARTITION BY p.project_id
                    ORDER BY m.metric_value DESC) AS quality_rank
FROM   run_metrics m
JOIN   experiment_runs r ON r.run_id = m.run_id
JOIN   projects p        ON p.project_id = r.project_id
WHERE  m.metric_name = 'psnr_db';`,
    fmt: { psnr_db: 4 },
    note: `The window ranks inside each partition without collapsing rows — aggregation would lose the per-run detail. Helios-2's FP8 pilot ranking last (33.45 dB) is the banding artifact made visible in data.`,
  },
  {
    id: 'Q9', title: 'CTE (WITH) + ROW_NUMBER()', short: 'Release artifact picker',
    q: 'For every project, which single checkpoint should we archive as the release artifact (largest released checkpoint of its best GREEN run)?',
    concepts: ['CTE','ROW_NUMBER'],
    sql: `WITH released AS (
    SELECT r.project_id, c.file_path, c.size_gb,
           ROW_NUMBER() OVER (PARTITION BY r.project_id
                              ORDER BY c.size_gb DESC) AS rn
    FROM   checkpoints c
    JOIN   experiment_runs r ON r.run_id = c.run_id
    WHERE  c.is_release = TRUE
      AND  r.status = 'GREEN'
)
SELECT p.project_name, rel.file_path, rel.size_gb
FROM   released rel
JOIN   projects p ON p.project_id = rel.project_id
WHERE  rel.rn = 1;`,
    fmt: { size_gb: 2 },
    note: `The CTE stages the ranked candidates and the outer query keeps rank 1 — a two-step logic that would be unreadable as nested subqueries.`,
  },
  {
    id: 'Q10', title: 'CASE expression in the SELECT list', short: 'Budget tiers',
    q: "Label each project's GPU spend as a budget tier for the monthly report.",
    concepts: ['searched CASE'],
    sql: `SELECT p.project_name,
       ROUND(SUM(r.duration_min / 60.0 * g.hourly_usd), 2) AS spend_usd,
       CASE
           WHEN SUM(r.duration_min / 60.0 * g.hourly_usd) >= 55 THEN 'HEAVY'
           WHEN SUM(r.duration_min / 60.0 * g.hourly_usd) >= 25 THEN 'MODERATE'
           ELSE 'LIGHT'
       END AS budget_tier
FROM   experiment_runs r
JOIN   projects  p ON p.project_id = r.project_id
JOIN   gpu_nodes g ON g.node_id    = r.node_id
GROUP BY p.project_name
ORDER BY spend_usd DESC;`,
    fmt: { spend_usd: 2 },
    note: `The searched CASE maps continuous spend onto ordinal tiers directly in SQL, so the report needs no application-side post-processing.`,
  },
  {
    id: 'Q11', title: 'VIEW: project_dashboard', short: 'The lab lead’s one-stop view',
    q: 'Give the lab lead a live per-project summary without rewriting the joins every time.',
    concepts: ['VIEW','LEFT JOIN','fan-out'],
    sql: `CREATE OR REPLACE VIEW project_dashboard AS
SELECT p.project_name,
       p.status                                            AS project_status,
       COUNT(r.run_id)                                     AS runs,
       SUM(CASE WHEN r.status = 'GREEN' THEN 1 ELSE 0 END) AS green_runs,
       ROUND(SUM(r.duration_min / 60.0 * g.hourly_usd), 2) AS spend_usd,
       (SELECT COUNT(*)
        FROM   checkpoints c
        JOIN   experiment_runs r2 ON r2.run_id = c.run_id
        WHERE  r2.project_id = p.project_id)               AS checkpoints
FROM   projects p
LEFT JOIN experiment_runs r ON r.project_id = p.project_id
LEFT JOIN gpu_nodes g       ON g.node_id    = r.node_id
GROUP BY p.project_id, p.project_name, p.status;

SELECT * FROM project_dashboard ORDER BY spend_usd DESC;`,
    exec: `SELECT * FROM project_dashboard ORDER BY spend_usd DESC;`,
    fmt: { spend_usd: 2 },
    note: `Checkpoints are deliberately counted via a correlated subquery, not a fourth join — joining checkpoints directly would duplicate every run row once per checkpoint and silently inflate runs, green_runs and spend_usd (join fan-out). The view itself is created at database load; the SELECT below queries it live.`,
  },
];

/* =============================================================================
   Page 1 — hero: chaos → tables particle animation
   ============================================================================= */
function demoHero() {
  const c = $('#hero-canvas'); if (!c) return;
  const ctx = c.getContext('2d');
  let W = 0, H = 0;

  const N = 96;
  let pts = [];
  let phase = 0;
  function init() {
    pts = Array.from({ length: N }, (_, i) => {
      const table = i % 4;
      return {
        x: Math.random() * W, y: Math.random() * H,
        tx: 0, ty: 0,
        table,
        color: [PALETTE[0], PALETTE[1], PALETTE[2], PALETTE[7]][table],
        r: 1.5 + Math.random() * 1.6,
        vx: 0, vy: 0,
      };
    });
  }
  function setTargets() {
    const cx = W / 2, cy = H / 2;
    if (phase === 0) {
      pts.forEach(p => { p.tx = Math.random() * W; p.ty = Math.random() * H; });
    } else {
      // snap into 4 tidy "tables": grids of rows × columns
      const gw = Math.min(W * 0.86, 840), gh = Math.min(H * 0.62, 380);
      const x0 = cx - gw / 2, y0 = cy - gh / 2;
      const perTable = N / 4, cols = 4;
      pts.forEach((p, i) => {
        const k = Math.floor(i / 4);           // index within its table
        const tx0 = x0 + (p.table % 2) * (gw / 2) + 20;
        const ty0 = y0 + Math.floor(p.table / 2) * (gh / 2) + 16;
        p.tx = tx0 + (k % cols) * ((gw / 2 - 60) / cols) + 10;
        p.ty = ty0 + Math.floor(k / cols) * 22;
      });
    }
  }
  setupCanvas(c, {
    ratio: 0.6,
    height: Math.max(500, window.innerHeight - 56),
    onResize: (w,h) => { W = w; H = h; init(); setTargets(); }
  });
  setInterval(() => { phase = 1 - phase; setTargets(); }, 4200);

  let lastT = performance.now();
  function frame(t) {
    const dt = Math.min(33, t - lastT) / 16; lastT = t;
    ctx.clearRect(0, 0, W, H);

    // row lines between same-table neighbours when organised
    ctx.strokeStyle = 'rgba(16,185,129,.10)';
    ctx.lineWidth = 1;
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        if (pts[i].table !== pts[j].table) continue;
        const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y;
        const d2 = dx*dx + dy*dy;
        if (d2 < 70*70) {
          ctx.globalAlpha = (1 - d2 / (70*70)) * 0.5;
          ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[j].x, pts[j].y); ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 1;

    pts.forEach(p => {
      p.vx += (p.tx - p.x) * 0.012 * dt;
      p.vy += (p.ty - p.y) * 0.012 * dt;
      p.vx *= 0.86; p.vy *= 0.86;
      p.x += p.vx; p.y += p.vy;

      ctx.beginPath();
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 4);
      grad.addColorStop(0, p.color); grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.arc(p.x, p.y, p.r * 4, 0, TAU); ctx.fill();
      ctx.beginPath();
      ctx.fillStyle = p.color;
      ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
    });
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

/* =============================================================================
   Page 3 — interactive ER diagram (Crow's Foot)
   ============================================================================= */
const ER = {
  entities: {
    researchers: {
      x: 30, y: 70, w: 205, title: 'researchers',
      cols: [['researcher_id','pk'],['full_name',''],['email','uq'],['lab_role','en'],['joined_date','']],
      desc: 'The people who launch experiment runs.',
      rules: ['Leads many projects (1:N)', 'Executes many runs (1:N)', 'May exist with no runs — optional participation'],
    },
    projects: {
      x: 470, y: 34, w: 225, title: 'projects',
      cols: [['project_id','pk'],['project_name','uq'],['focus_area',''],['status','en'],['started_date',''],['lead_researcher_id','fk']],
      desc: 'One row per research project / paper effort.',
      rules: ['Exactly one lead researcher (total)', 'Contains many runs (1:N)', 'Tracks many claims (1:N)'],
    },
    claims: {
      x: 950, y: 52, w: 220, title: 'claims',
      cols: [['claim_id','pk'],['project_id','fk'],['claim_code','uq'],['statement',''],['verdict','en']],
      desc: 'Falsifiable scientific claims a project tracks.',
      rules: ['Belongs to exactly one project', 'Tested by many runs via run_claims (M:N)', 'Verdict: SUPPORTED / REFUTED / OPEN'],
    },
    gpu_nodes: {
      x: 30, y: 330, w: 205, title: 'gpu_nodes',
      cols: [['node_id','pk'],['provider',''],['gpu_model',''],['vram_gb','ck'],['hourly_usd','ck'],['region','df']],
      desc: 'Cloud GPU machines the lab rents by the hour.',
      rules: ['Hosts many runs over its lifetime (1:N)', 'May exist with no runs yet — the reserved B200 (partial participation)'],
    },
    experiment_runs: {
      x: 452, y: 262, w: 250, title: 'experiment_runs',
      cols: [['run_id','pk'],['project_id','fk'],['node_id','fk'],['researcher_id','fk'],['run_label',''],['started_at',''],['duration_min','ck'],['status','en'],['notes','nn']],
      desc: 'The central fact table: one GPU experiment. Carries three mandatory foreign keys — total participation on the run side.',
      rules: ['Belongs to exactly one project, node, researcher', 'Produces metrics + checkpoints (1:N, CASCADE)', 'Tests many claims via run_claims (M:N)'],
    },
    run_claims: {
      x: 950, y: 280, w: 220, title: 'run_claims',
      cols: [['run_id','pkfk'],['claim_id','pkfk'],['evidence_note','nn']],
      desc: 'Associative entity resolving the M:N between runs and claims — also stores the evidence note.',
      rules: ['Composite PK (run_id, claim_id)', 'The same run cannot record evidence against the same claim twice'],
    },
    run_metrics: {
      x: 950, y: 452, w: 220, title: 'run_metrics',
      cols: [['metric_id','pk'],['run_id','fk'],['metric_name','uq'],['metric_value','']],
      desc: 'Named measurements a run produced — the highest-volume table.',
      rules: ['UNIQUE (run_id, metric_name): one value per metric per run', 'ON DELETE CASCADE from runs'],
    },
    checkpoints: {
      x: 452, y: 508, w: 250, title: 'checkpoints',
      cols: [['checkpoint_id','pk'],['run_id','fk'],['file_path',''],['size_gb','ck'],['is_release','df']],
      desc: 'Model artifacts a run wrote to storage.',
      rules: ['Each checkpoint belongs to exactly one run', 'A run may produce zero or more (optional)', 'ON DELETE CASCADE from runs'],
    },
  },
  edges: [
    { from: 'researchers', to: 'projects',        label: 'leads',     fs: 'r', ts: 'l' },
    { from: 'researchers', to: 'experiment_runs', label: 'executes',  fs: 'b', ts: 'l' },
    { from: 'projects',    to: 'experiment_runs', label: 'contains',  fs: 'b', ts: 't' },
    { from: 'projects',    to: 'claims',          label: 'tracks',    fs: 'r', ts: 'l' },
    { from: 'gpu_nodes',   to: 'experiment_runs', label: 'hosts',     fs: 'r', ts: 'l' },
    { from: 'experiment_runs', to: 'run_metrics', label: 'measures',  fs: 'r', ts: 'l' },
    { from: 'experiment_runs', to: 'checkpoints', label: 'produces',  fs: 'b', ts: 't' },
    { from: 'experiment_runs', to: 'run_claims',  label: 'tested_by', fs: 'r', ts: 'l' },
    { from: 'claims',      to: 'run_claims',      label: 'resolves',  fs: 'b', ts: 't' },
  ],
};

function erAnchor(ent, side, offset=0.5) {
  const h = 24 + ent.cols.length * 15 + 8;
  switch (side) {
    case 'l': return { x: ent.x,          y: ent.y + h * offset };
    case 'r': return { x: ent.x + ent.w,  y: ent.y + h * offset };
    case 't': return { x: ent.x + ent.w * offset, y: ent.y };
    case 'b': return { x: ent.x + ent.w * offset, y: ent.y + h };
  }
}

function demoER() {
  const stage = $('#er-svg'); if (!stage) return;
  const NS = 'http://www.w3.org/2000/svg';
  const panel = $('#er-panel-body');

  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  // spread multi-edge anchors so lines to experiment_runs don't overlap
  const sideCount = {}, sideIdx = {};
  ER.edges.forEach(ed => {
    const kf = ed.from + ed.fs, kt = ed.to + ed.ts;
    sideCount[kf] = (sideCount[kf] || 0) + 1;
    sideCount[kt] = (sideCount[kt] || 0) + 1;
  });
  function nextOffset(key) {
    sideIdx[key] = (sideIdx[key] || 0) + 1;
    const n = sideCount[key];
    return n === 1 ? 0.5 : sideIdx[key] / (n + 1);
  }

  const edgeGroups = [];
  ER.edges.forEach(ed => {
    const A = ER.entities[ed.from], B = ER.entities[ed.to];
    const a = erAnchor(A, ed.fs, nextOffset(ed.from + ed.fs));
    const b = erAnchor(B, ed.ts, nextOffset(ed.to + ed.ts));
    const g = el('g', {}, stage);

    const dirs = { l: [-1,0], r: [1,0], t: [0,-1], b: [0,1] };
    const [fdx, fdy] = dirs[ed.fs], [tdx, tdy] = dirs[ed.ts];
    const ext = 46;
    const path = el('path', {
      class: 'er-edge',
      d: `M ${a.x} ${a.y} C ${a.x + fdx*ext} ${a.y + fdy*ext}, ${b.x + tdx*ext} ${b.y + tdy*ext}, ${b.x + tdx*10} ${b.y + tdy*10} L ${b.x} ${b.y}`,
    }, g);

    // "one" end: double tick perpendicular to exit direction
    const t1 = 10, t2 = 16;
    for (const t of [t1, t2]) {
      const px = a.x + fdx * t, py = a.y + fdy * t;
      el('line', { class: 'er-mark',
        x1: px - fdy * 5, y1: py - fdx * 5, x2: px + fdy * 5, y2: py + fdx * 5 }, g);
    }
    // "many" end: crow's foot converging on the table edge
    const fx = b.x + tdx * 14, fy = b.y + tdy * 14;
    [[-6],[0],[6]].forEach(([s]) => {
      el('line', { class: 'er-mark',
        x1: fx, y1: fy, x2: b.x - tdy * s, y2: b.y - tdx * s }, g);
    });

    const midx = (a.x + b.x) / 2, midy = (a.y + b.y) / 2;
    el('text', { class: 'er-elabel', x: midx, y: midy - 5, 'text-anchor': 'middle' }, g).textContent = ed.label;
    edgeGroups.push({ ed, g });
  });

  const entEls = {};
  for (const key in ER.entities) {
    const ent = ER.entities[key];
    const h = 24 + ent.cols.length * 15 + 8;
    const g = el('g', { class: 'er-entity', 'data-ent': key }, stage);
    el('rect', { class: 'body', x: ent.x, y: ent.y, width: ent.w, height: h, rx: 8 }, g);
    el('rect', { class: 'head', x: ent.x + 1, y: ent.y + 1, width: ent.w - 2, height: 22, rx: 7 }, g);
    el('text', { class: 'tname', x: ent.x + 10, y: ent.y + 16 }, g).textContent = ent.title;
    ent.cols.forEach(([cname, kind], i) => {
      const cls = kind === 'pk' || kind === 'pkfk' ? 'col pk' : kind === 'fk' ? 'col fk' : 'col';
      const t = el('text', { class: cls, x: ent.x + 10, y: ent.y + 38 + i * 15 }, g);
      t.textContent = cname;
      const badge = { pk: 'PK', fk: 'FK', pkfk: 'PK·FK', uq: 'UQ', en: 'ENUM', ck: 'CHK', df: 'DFT', nn: 'NULL✓' }[kind];
      if (badge) {
        const bt = el('text', { class: 'col', x: ent.x + ent.w - 10, y: ent.y + 38 + i * 15, 'text-anchor': 'end' }, g);
        bt.textContent = badge;
        if (kind === 'pk' || kind === 'pkfk') bt.setAttribute('class', 'col pk');
        if (kind === 'fk') bt.setAttribute('class', 'col fk');
      }
    });
    entEls[key] = g;
  }

  function setFocus(key) {
    if (!key) {
      for (const k in entEls) entEls[k].classList.remove('dim', 'hot');
      edgeGroups.forEach(({ g }) => $$('.er-edge,.er-mark,.er-elabel', g).forEach(x => x.classList.remove('dim','hot')));
      if (panel) panel.innerHTML = defaultPanel();
      return;
    }
    const linked = new Set([key]);
    edgeGroups.forEach(({ ed }) => {
      if (ed.from === key) linked.add(ed.to);
      if (ed.to === key) linked.add(ed.from);
    });
    for (const k in entEls) {
      entEls[k].classList.toggle('hot', k === key);
      entEls[k].classList.toggle('dim', !linked.has(k));
    }
    edgeGroups.forEach(({ ed, g }) => {
      const on = ed.from === key || ed.to === key;
      $$('.er-edge,.er-mark,.er-elabel', g).forEach(x => {
        x.classList.toggle('hot', on);
        x.classList.toggle('dim', !on);
      });
    });
    const ent = ER.entities[key];
    if (panel) panel.innerHTML = `
      <div class="card glow">
        <div class="card-title">${esc(ent.title)}</div>
        <p style="margin-top:0">${esc(ent.desc)}</p>
        ${ent.rules.map(r => `<p style="margin:6px 0;font-size:12.5px">· ${esc(r)}</p>`).join('')}
      </div>`;
  }
  function defaultPanel() {
    return `
      <div class="card">
        <div class="card-title">The model</div>
        <p style="margin-top:0"><b class="fg">7 strong entities + 1 associative</b> (run_claims). <b class="fg">experiment_runs</b> is the hub: three mandatory FKs — total participation on the run side; the reverse directions are optional.</p>
        <p style="font-size:12.5px" class="muted">Hover any table to trace its relationships. Crow's foot = many · double tick = exactly one.</p>
      </div>`;
  }
  if (panel) panel.innerHTML = defaultPanel();

  for (const key in entEls) {
    entEls[key].addEventListener('mouseenter', () => setFocus(key));
    entEls[key].addEventListener('mouseleave', () => setFocus(null));
    entEls[key].addEventListener('click', () => setFocus(key));
  }
}

/* =============================================================================
   Page 4 — normalization stepper
   ============================================================================= */
const NF_FLAT_ROWS = [
  ['1','vae-stage0-blockprune','GREEN','Helios-2','active','H100 SXM','2.99','Hudeifa Hassan','psnr_db','38.42'],
  ['1','vae-stage0-blockprune','GREEN','Helios-2','active','H100 SXM','2.99','Hudeifa Hassan','decode_fps','21.70'],
  ['2','trt-fp16-pilot','GREEN','Helios-2','active','H100 SXM','2.99','Tomas Keller','decode_fps','25.12'],
  ['2','trt-fp16-pilot','GREEN','Helios-2','active','H100 SXM','2.99','Tomas Keller','psnr_db','38.10'],
  ['9','sla-k5-repro-freeze','GREEN','SLA-Ablation','closed','A100 80GB','1.89','Lena Okafor','rel_err_median','0.118'],
  ['9','sla-k5-repro-freeze','GREEN','SLA-Ablation','closed','A100 80GB','1.89','Lena Okafor','sparsity_pct','95.00'],
];
const NF_FLAT_COLS = ['run_id','run_label','status','project_name','project_status','gpu_model','hourly_usd','researcher_name','metric_name','metric_value'];

function miniTable(name, cols, rows, dupCells=new Set(), keyCols=new Set()) {
  let h = `<div class="mini-table"><div class="mt-name">${esc(name)}</div><table><thead><tr>`;
  cols.forEach(c => h += `<th>${esc(c)}</th>`);
  h += '</tr></thead><tbody>';
  rows.forEach((row, ri) => {
    h += '<tr>';
    row.forEach((v, ci) => {
      const cls = dupCells.has(ri + ':' + ci) ? 'dup' : (keyCols.has(ci) ? 'keycell' : '');
      h += `<td class="${cls}">${esc(v)}</td>`;
    });
    h += '</tr>';
  });
  return h + '</tbody></table></div>';
}

const NF_STATES = {
  unf: {
    label: 'flat notebook',
    build() {
      const rows = [
        ['1','vae-stage0-blockprune','GREEN','Helios-2','active','H100 SXM','2.99','Hudeifa Hassan','psnr=38.42; fps=21.7'],
        ['2','trt-fp16-pilot','GREEN','Helios-2','active','H100 SXM','2.99','Tomas Keller','fps=25.12; psnr=38.1'],
        ['9','sla-k5-repro-freeze','GREEN','SLA-Ablation','closed','A100 80GB','1.89','Lena Okafor','rel=0.118; sp=95'],
      ];
      const dup = new Set();
      rows.forEach((_, ri) => dup.add(ri + ':8'));
      return miniTable('LAB_LOG — the lab notebook, as actually kept', NF_FLAT_COLS.slice(0,8).concat(['metrics (packed!)']), rows, dup);
    },
    note: `<b class="fg">The violation:</b> the metrics cell packs several values into one field — not atomic. You cannot SELECT a run's PSNR, index it, or constrain it. This flat sheet is how the lab actually kept records before LabOps.`,
    count: '—',
  },
  nf1: {
    label: '1NF',
    build() {
      const dup = new Set();
      // run-level cols repeat for every metric row of the same run
      [[1,0],[1,1],[1,2],[1,3],[1,4],[1,5],[1,6],[1,7],
       [3,0],[3,1],[3,2],[3,3],[3,4],[3,5],[3,6],[3,7],
       [5,0],[5,1],[5,2],[5,3],[5,4],[5,5],[5,6],[5,7]].forEach(([r,c]) => dup.add(r + ':' + c));
      return miniTable('LAB_LOG — key (run_id, metric_name)', NF_FLAT_COLS, NF_FLAT_ROWS, dup, new Set([0,8]));
    },
    note: `<b class="fg">1NF:</b> one atomic value per field — each measurement becomes its own row keyed by <span class="mono cyan">(run_id, metric_name)</span>. But now every run-level attribute <span class="red">repeats per metric</span> (highlighted): a partial dependency on run_id alone.`,
    count: '24 redundant cells in 6 rows',
  },
  nf2: {
    label: '2NF',
    build() {
      const runRows = [
        ['1','vae-stage0-blockprune','GREEN','Helios-2','active','H100 SXM','2.99','Hudeifa Hassan'],
        ['2','trt-fp16-pilot','GREEN','Helios-2','active','H100 SXM','2.99','Tomas Keller'],
        ['9','sla-k5-repro-freeze','GREEN','SLA-Ablation','closed','A100 80GB','1.89','Lena Okafor'],
      ];
      const dup = new Set(['1:3','1:4','1:5','1:6']); // Helios-2 info still duplicated across runs 1,2
      const t1 = miniTable('experiment_runs — key run_id', NF_FLAT_COLS.slice(0,8), runRows, dup, new Set([0]));
      const t2 = miniTable('run_metrics — key (run_id, metric_name)',
        ['run_id','metric_name','metric_value'],
        NF_FLAT_ROWS.map(r => [r[0], r[8], r[9]]), new Set(), new Set([0,1]));
      return t1 + t2;
    },
    note: `<b class="fg">2NF:</b> run-level attributes split out; only <span class="mono cyan">metric_value</span> (which needs the whole key) stays in run_metrics. But transitive dependencies remain: run_id → project_name → project_status, and gpu_model → hourly_usd. Project and node facts <span class="red">still repeat</span> across runs.`,
    count: '4 redundant cells remain',
  },
  nf3: {
    label: '3NF',
    build() {
      const t1 = miniTable('experiment_runs', ['run_id','project_id','node_id','researcher_id','run_label','status'],
        [['1','1','1','1','vae-stage0-blockprune','GREEN'],
         ['2','1','1','3','trt-fp16-pilot','GREEN'],
         ['9','3','2','2','sla-k5-repro-freeze','GREEN']], new Set(), new Set([0]));
      const t2 = miniTable('projects', ['project_id','project_name','status'],
        [['1','Helios-2','active'],['3','SLA-Ablation','closed']], new Set(), new Set([0]));
      const t3 = miniTable('gpu_nodes', ['node_id','gpu_model','hourly_usd'],
        [['1','H100 SXM','2.99'],['2','A100 80GB','1.89']], new Set(), new Set([0]));
      const t4 = miniTable('researchers', ['researcher_id','full_name'],
        [['1','Hudeifa Hassan'],['2','Lena Okafor'],['3','Tomas Keller']], new Set(), new Set([0]));
      const t5 = miniTable('run_metrics', ['run_id','metric_name','metric_value'],
        NF_FLAT_ROWS.map(r => [r[0], r[8], r[9]]), new Set(), new Set([0,1]));
      return t1 + t2 + t3 + t4 + t5;
    },
    note: `<b class="fg">3NF:</b> every non-key attribute depends on the key, the whole key, and nothing but the key. A node price correction is now a <b class="green">single-row UPDATE</b>; deleting a run's last metric no longer erases knowledge of the run. At scale: a 20-run project with 5 metrics per run stored its name and status <b class="red">100×</b> in the flat form — now <b class="green">once</b>.`,
    count: '0 redundant cells',
  },
};

function demoNF() {
  const stage = $('#nf-stage'); if (!stage) return;
  const btns = $$('#nf-steps button');
  const note = $('#nf-note'), count = $('#nf-count');
  function show(key) {
    btns.forEach(b => b.classList.toggle('on', b.dataset.nf === key));
    const st = NF_STATES[key];
    stage.innerHTML = `<div class="nf-view"><div class="nf-tables">${st.build()}</div></div>`;
    if (note) note.innerHTML = st.note;
    if (count) count.innerHTML = `redundant cells: <b class="${key === 'nf3' ? 'green' : 'red'}">${st.count}</b>`;
  }
  btns.forEach(b => b.addEventListener('click', () => show(b.dataset.nf)));
  show('unf');
}

/* =============================================================================
   Page 5 — implementation: live row counts
   ============================================================================= */
async function demoSchema() {
  const host = $('#schema-live'); if (!host) return;
  await dbInit();
  const tables = ['researchers','projects','gpu_nodes','experiment_runs','run_metrics','checkpoints','claims','run_claims','run_audit'];
  const counts = tables.map(t => [t, db.exec(`SELECT COUNT(*) FROM ${t}`)[0].values[0][0]]);
  host.innerHTML = renderTable([{ columns: ['table_name','rows_present'], values: counts }]);
  const idx = db.exec(`SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'`)[0].values[0][0];
  const s = $('#schema-stats');
  if (s) s.innerHTML = `
    <div class="stat"><div class="k">tables</div><div class="v">9</div></div>
    <div class="stat"><div class="k">foreign keys</div><div class="v">9</div></div>
    <div class="stat"><div class="k">secondary indexes</div><div class="v">${idx}</div></div>
    <div class="stat"><div class="k">sample rows</div><div class="v">${counts.reduce((a, [,c]) => a + c, 0)}</div></div>`;
}

/* =============================================================================
   Page 6 — live query runner
   ============================================================================= */
async function demoQueries() {
  const list = $('#qlist'); if (!list) return;

  list.innerHTML = QUERIES.map((q, i) => `
    <button class="qbtn${i === 0 ? ' on' : ''}" data-i="${i}">
      <span class="qid">${q.id} · ${esc(q.short)}</span>
      <span class="qt">${esc(q.title)}</span>
      <span class="qc">${q.concepts.join(' · ')}</span>
    </button>`).join('');

  const qq = $('#q-question'), code = $('#q-sql'), out = $('#q-out'), stat = $('#q-stat'), note = $('#q-note');
  let cur = 0;

  function select(i) {
    cur = i;
    $$('.qbtn', list).forEach((b, j) => b.classList.toggle('on', j === i));
    const q = QUERIES[i];
    qq.textContent = q.q;
    code.innerHTML = hlSQL(q.sql);
    note.innerHTML = `<b class="fg">Analysis.</b> ${q.note}`;
    out.innerHTML = '<div class="muted" style="padding:14px;font-family:var(--mono);font-size:12px">…</div>';
    stat.textContent = '';
    run();
  }

  async function run() {
    await dbInit();
    const q = QUERIES[cur];
    try {
      const { res, ms } = runSQL(q.exec || q.sql);
      out.innerHTML = renderTable(res, q.fmt || {});
      const n = res.length ? res[0].values.length : 0;
      stat.innerHTML = `<b>${n}</b> row${n === 1 ? '' : 's'} · <b>${ms.toFixed(1)}</b> ms · live`;
    } catch (e) {
      out.innerHTML = `<div class="errbox">${esc(e.message)}</div>`;
    }
  }

  $$('.qbtn', list).forEach(b => b.addEventListener('click', () => select(+b.dataset.i)));
  $('#q-run')?.addEventListener('click', run);
  $('#q-reset')?.addEventListener('click', async () => { await dbInit(); dbReset(); run(); });

  // free console
  const cin = $('#console-in'), cout = $('#console-out');
  $('#console-run')?.addEventListener('click', async () => {
    await dbInit();
    try {
      const { res, ms } = runSQL(cin.value);
      cout.innerHTML = renderTable(res) +
        `<div class="runstat" style="margin-top:8px">${res.length ? res[0].values.length : 0} rows · ${ms.toFixed(1)} ms</div>`;
    } catch (e) {
      cout.innerHTML = `<div class="errbox">${esc(e.message)}</div>`;
    }
  });

  await dbInit();
  select(0);
}

/* =============================================================================
   Page 7 — guardrails: trigger + stored procedure, both live
   ============================================================================= */
async function demoGuardrails() {
  const trigBtn = $('#trig-run'); if (!trigBtn) return;
  await dbInit();

  const TRIAGE = [
    ['batch2-throughput-probe', 'GREEN',  'B=2 confirmed viable'],
    ['mass-aware-ref-k97',      'GREEN',  'quality holds at 97%'],
    ['trt-fp8-pilot',           'FAILED', 'banding disqualifies FP8'],
    ['wkde2-real-traces',       'FAILED', 'mass-blind sampler'],
    ['prune-cap0-gate',         'FAILED', 'G3 formal fail'],
  ];
  const plan = $('#trig-plan');
  if (plan) plan.innerHTML = renderTable([{
    columns: ['run_label','new_status','reason'],
    values: TRIAGE,
  }]);

  function refreshAudit() {
    const res = db.exec('SELECT audit_id, run_id, old_status, new_status, changed_at FROM run_audit');
    $('#trig-out').innerHTML = renderTable(res);
    const n = res.length ? res[0].values.length : 0;
    $('#trig-stat').innerHTML = `run_audit rows: <b>${n}</b> — ${n === 0 ? 'empty until the trigger fires; no direct INSERTs exist' : 'every row written by the trigger, none by hand'}`;
  }

  trigBtn.addEventListener('click', () => {
    TRIAGE.forEach(([label, status]) => {
      db.run('UPDATE experiment_runs SET status = ? WHERE run_label = ?', [status, label]);
    });
    refreshAudit();
  });
  $('#trig-reset')?.addEventListener('click', () => { dbReset(); refreshAudit(); populateNodes(); refreshRunCount(); $('#proc-out').innerHTML = ''; });
  refreshAudit();

  // stored procedure — register_run semantics executed as one transaction
  const sel = $('#proc-node');
  function populateNodes() {
    const nodes = db.exec('SELECT node_id, provider, gpu_model, vram_gb FROM gpu_nodes')[0].values;
    sel.innerHTML = nodes.map(([id, prov, model, vram]) =>
      `<option value="${id}" data-vram="${vram}">${esc(model)} · ${esc(prov)} · ${vram} GB</option>`).join('');
  }
  function refreshRunCount() {
    const n = db.exec('SELECT COUNT(*) FROM experiment_runs')[0].values[0][0];
    $('#proc-count').innerHTML = `experiment_runs rows: <b>${n}</b>`;
  }
  populateNodes();
  refreshRunCount();

  $('#proc-run').addEventListener('click', () => {
    const nodeId = +sel.value;
    const label = $('#proc-label').value.trim() || 'cap0-nll-recheck';
    const out = $('#proc-out');
    const vram = db.exec('SELECT vram_gb FROM gpu_nodes WHERE node_id = ' + nodeId)[0].values[0][0];
    if (vram < 40) {
      out.innerHTML = `<div class="errbox">ERROR 1644 (45000): Node has insufficient VRAM for a training run<br><span class="muted">SIGNAL raised before any write — the database is untouched (row count unchanged).</span></div>`;
      refreshRunCount();
      return;
    }
    try {
      db.run('BEGIN');
      db.run(`INSERT INTO experiment_runs (project_id, node_id, researcher_id, run_label, started_at, duration_min, status)
              VALUES (2, ?, 1, ?, datetime('now'), 95, 'GREEN')`, [nodeId, label]);
      db.run(`INSERT INTO run_metrics (run_id, metric_name, metric_value)
              VALUES (last_insert_rowid(), 'nll_delta', 0.198)`);
      db.run('COMMIT');
      const res = db.exec('SELECT run_id, run_label, status FROM experiment_runs ORDER BY run_id DESC LIMIT 1');
      out.innerHTML = `<div class="okbox">✓ committed — run and its first metric inserted in ONE transaction</div>` + renderTable(res);
    } catch (e) {
      db.run('ROLLBACK');
      out.innerHTML = `<div class="errbox">rolled back: ${esc(e.message)}<br><span class="muted">EXIT HANDLER semantics — a half-registered run can never exist.</span></div>`;
    }
    refreshRunCount();
  });
}

/* =============================================================================
   Page 8 — growth model chart
   ============================================================================= */
function demoPerf() {
  const c = $('#perf-canvas'); if (!c) return;
  const ctx = c.getContext('2d');
  let W = 0, H = 0;
  setupCanvas(c, { ratio: 0.42, onResize: (w,h) => { W = w; H = h; draw(); } });

  const slider = $('#perf-n');
  const ROWS_PER_PAGE = 64, FANOUT = 200;

  function fmtN(n) {
    if (n >= 1e6) return (n/1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M';
    if (n >= 1e3) return (n/1e3).toFixed(0) + 'K';
    return String(Math.round(n));
  }

  function draw() {
    if (!W) return;
    const exp = +slider.value; // 3..8 (log10 n)
    const n = Math.pow(10, exp);
    ctx.clearRect(0, 0, W, H);
    const pad = { l: 56, r: 20, t: 16, b: 30 };
    const x0 = pad.l, y0 = H - pad.b, x1 = W - pad.r, y1 = pad.t;

    // y axis: log page-reads 1..10^6.2
    const ymaxL = 6.2;
    const X = e => x0 + (e - 3) / 5 * (x1 - x0);
    const Y = v => y0 - (Math.log10(Math.max(1, v)) / ymaxL) * (y0 - y1);

    ctx.strokeStyle = 'rgba(255,255,255,.06)';
    for (let i = 0; i <= 6; i++) {
      const y = Y(Math.pow(10, i));
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
      ctx.fillStyle = '#64796d'; ctx.font = '10px JetBrains Mono';
      ctx.fillText(i === 0 ? '1' : '10^' + i, 12, y + 3);
    }
    for (let e = 3; e <= 8; e++) {
      const x = X(e);
      ctx.fillStyle = '#64796d'; ctx.font = '10px JetBrains Mono';
      ctx.fillText(fmtN(Math.pow(10, e)), x - 10, H - 10);
    }
    ctx.fillStyle = '#a5b8ad'; ctx.font = '600 10px JetBrains Mono';
    ctx.save(); ctx.translate(14, y1 + 60); ctx.rotate(-Math.PI/2);
    ctx.fillText('page reads', 0, 0); ctx.restore();
    ctx.fillText('rows in run_metrics →', x1 - 150, H - 10);

    function plot(fn, color) {
      ctx.strokeStyle = color; ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let e = 3; e <= 8; e += 0.05) {
        const v = fn(Math.pow(10, e));
        const x = X(e), y = Y(v);
        if (e === 3) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    const scan = nn => nn / ROWS_PER_PAGE;
    const probe = nn => Math.max(1, Math.ceil(Math.log(nn) / Math.log(FANOUT))) + 1;
    plot(scan, '#f87171');
    plot(probe, '#34d399');

    // marker at current n
    const mx = X(exp);
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.setLineDash([2,3]);
    ctx.beginPath(); ctx.moveTo(mx, y0); ctx.lineTo(mx, y1); ctx.stroke(); ctx.setLineDash([]);
    [[scan, '#f87171'], [probe, '#34d399']].forEach(([fn, col]) => {
      const y = Y(fn(n));
      ctx.beginPath(); ctx.fillStyle = col; ctx.arc(mx, y, 5, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
    });

    $('#perf-nval').textContent = fmtN(n) + ' rows';
    $('#perf-scan').textContent = fmtN(scan(n)) + ' page reads';
    $('#perf-probe').textContent = probe(n) + ' page reads';
    $('#perf-ratio').textContent = fmtN(scan(n) / probe(n)) + '×';
  }
  slider.addEventListener('input', draw);
  draw();
}

/* =============================================================================
   Page 9 — CAP picker
   ============================================================================= */
function demoCAP() {
  const btns = $$('#cap-pick button'); if (!btns.length) return;
  const out = $('#cap-out');
  const TXT = {
    CA: `<b class="fg">CA — where LabOps lives today.</b> A single MySQL node has no partition to tolerate; ACID transactions give strong consistency and the node is available as long as it is up. The theorem is dormant — until the lab distributes.`,
    CP: `<b class="fg">CP — refuse rather than lie.</b> Under a partition, reads wait until replicas catch up. Right choice for the <span class="cyan">audit trail and claim verdicts</span>: a wrong verdict read is worse than a delayed one.`,
    AP: `<b class="fg">AP — answer, possibly stale.</b> Under a partition, serve from the replica anyway. Acceptable for <span class="cyan">financial dashboards (Q3, Q10)</span>: spend numbers a few minutes stale still steer the budget correctly.`,
  };
  btns.forEach(b => b.addEventListener('click', () => {
    btns.forEach(x => x.classList.toggle('on', x === b));
    out.innerHTML = TXT[b.dataset.cap];
  }));
  btns[0].classList.add('on');
  out.innerHTML = TXT.CA;
}

/* =============================================================================
   Init
   ============================================================================= */
function initPage() {
  initChrome();
  const page = +document.body.dataset.page || 1;
  switch (page) {
    case 1: demoHero(); break;
    case 3: demoER(); break;
    case 4: demoNF(); break;
    case 5: demoSchema(); break;
    case 6: demoQueries(); break;
    case 7: demoGuardrails(); break;
    case 8: demoPerf(); break;
    case 9: demoCAP(); break;
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPage);
} else {
  initPage();
}

})();
