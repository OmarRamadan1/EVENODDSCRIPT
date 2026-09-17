#!/usr/bin/env node
/**
 * Assembles the Zajal brand deck from deck/parts/*.html into a single
 * index.html, then renders it to PDF with headless Chrome.
 *
 * Page numbers and the table of contents are generated from the pages
 * themselves at render time, so the contents page can never drift out of sync
 * with the document.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync, spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PARTS = path.join(ROOT, 'deck', 'parts');
const OUT_HTML = path.join(ROOT, 'deck', 'index.html');
const OUT_PDF = path.join(ROOT, 'build', 'Zajal-Brand-Guidelines-v2.0.pdf');

const ORDER = [
  '00-cover.html',
  '10-strategy.html',
  '20-personality.html',
  '30-audience.html',
  '40-voice.html',
  '50-logo.html',
  '60-colour.html',
  '70-type.html',
  '80-assets.html',
  '90-product.html',
  '95-applications.html',
  '99-governance.html',
];

const RUNTIME = `
(function () {
  // ---- stamp folios + running headers -----------------------------------
  var pages = Array.prototype.slice.call(document.querySelectorAll('.page'));
  var n = 0;
  pages.forEach(function (p) {
    n += 1;
    p.dataset.page = n;
    if (p.classList.contains('no-chrome')) return;
    var sec = p.dataset.section || '';
    var rh = document.createElement('div');
    rh.className = 'rh';
    rh.innerHTML = '<span>' + sec + '</span><span class="rh-en">Zajal Brand Guidelines v2.0</span>';
    p.appendChild(rh);
    var f = document.createElement('div');
    f.className = 'folio';
    f.textContent = String(n).padStart(2, '0');
    p.appendChild(f);
  });

  // ---- build the contents from the pages that opted in ------------------
  var hosts = ['toc', 'toc2'].map(function (id) { return document.getElementById(id); })
    .filter(Boolean);
  if (!hosts.length) return;

  var groups = [];
  pages.forEach(function (p) {
    if (!p.dataset.toc) return;
    var sec = p.dataset.section || '—';
    var g = groups[groups.length - 1];
    if (!g || g.name !== sec) { g = { name: sec, items: [] }; groups.push(g); }
    g.items.push({ title: p.dataset.toc, page: p.dataset.page });
  });

  // split the sections across the available contents pages by estimated height
  var cost = groups.map(function (g) { return 52 + g.items.length * 22; });
  var total = cost.reduce(function (a, b) { return a + b; }, 0);
  var perHost = total / hosts.length;
  var buckets = hosts.map(function () { return []; });
  var run = 0;
  var k = 0;
  groups.forEach(function (g, i) {
    if (k < hosts.length - 1 && buckets[k].length && run + cost[i] > perHost) { k += 1; run = 0; }
    buckets[k].push(g);
    run += cost[i];
  });

  function renderGroup(g) {
    return '<div class="sec"><div class="h4">' + g.name + '</div>' +
      g.items.map(function (i) {
        return '<div class="it"><span>' + i.title + '</span>' +
               '<span class="dots"></span>' +
               '<span class="pg">' + String(i.page).padStart(2, '0') + '</span></div>';
      }).join('') + '</div>';
  }
  hosts.forEach(function (h, i) { h.innerHTML = buckets[i].map(renderGroup).join(''); });
  document.documentElement.dataset.ready = '1';
})();
`;

function assemble() {
  const strict = !process.argv.includes('--lenient');
  const parts = ORDER.map((f) => {
    const p = path.join(PARTS, f);
    if (!fs.existsSync(p)) {
      if (strict) throw new Error('missing part: ' + f);
      console.warn('  ! skipping missing part: ' + f);
      return '';
    }
    return `<!-- ==== ${f} ==== -->\n` + fs.readFileSync(p, 'utf8').trim();
  }).filter(Boolean).join('\n\n');

  const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<title>زَجَل — دليل الهوية البصرية واللفظية</title>
<meta name="description" content="Zajal Brand Guidelines v2.0">
<link rel="stylesheet" href="../fonts/fonts.css">
<link rel="stylesheet" href="deck.css">
</head>
<body>
${parts}
<script>${RUNTIME}<\/script>
</body>
</html>
`;
  fs.writeFileSync(OUT_HTML, html, 'utf8');
  const pageCount = (parts.match(/class="page/g) || []).length;
  console.log(`assembled ${OUT_HTML}  (${pageCount} pages, ${Math.round(html.length / 1024)} KB)`);
  return pageCount;
}

function renderPdf() {
  fs.mkdirSync(path.dirname(OUT_PDF), { recursive: true });
  if (fs.existsSync(OUT_PDF)) fs.unlinkSync(OUT_PDF);
  const bin = ['/usr/local/bin/google-chrome', '/usr/bin/google-chrome', '/usr/bin/chromium']
    .find((b) => fs.existsSync(b));
  if (!bin) throw new Error('no chrome binary found');

  // Headless Chrome writes the PDF and then does not always exit cleanly in a
  // container, so it is polled for the output file and killed once it lands.
  // --allow-file-access-from-files is required for CSS mask-image over file://.
  const child = spawn(bin, [
    '--headless',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--allow-file-access-from-files',
    '--font-render-hinting=none',
    '--no-pdf-header-footer',
    `--print-to-pdf=${OUT_PDF}`,
    'file://' + OUT_HTML,
  ], { stdio: 'ignore', detached: true });

  const deadline = Date.now() + 150000;
  let stable = 0;
  let last = -1;
  while (Date.now() < deadline) {
    execFileSync('sleep', ['1']);
    if (!fs.existsSync(OUT_PDF)) continue;
    const size = fs.statSync(OUT_PDF).size;
    stable = size > 0 && size === last ? stable + 1 : 0;
    last = size;
    if (stable >= 2) break;
  }
  try { process.kill(-child.pid, 'SIGKILL'); } catch (_) { /* already gone */ }

  if (!fs.existsSync(OUT_PDF) || fs.statSync(OUT_PDF).size === 0) {
    throw new Error('chrome produced no PDF');
  }
  const kb = Math.round(fs.statSync(OUT_PDF).size / 1024);
  console.log(`rendered ${OUT_PDF}  (${kb} KB)`);
}

const count = assemble();
if (!process.argv.includes('--html-only')) renderPdf();
if (count < 1) process.exit(1);
