#!/usr/bin/env node
/**
 * Layout QA for the deck. Loads the assembled HTML in headless Chrome and
 * reports, per page:
 *   - content that overflows the 1280x720 page box
 *   - elements that break the document margins
 *   - text set below the minimum legible size
 *   - images that failed to load
 * Exits non-zero if anything is flagged, so the deck cannot be shipped broken.
 */

const path = require('path');
const puppeteer = require('puppeteer-core');

const HTML = 'file://' + path.resolve(__dirname, '..', 'deck', 'index.html');
const CHROME = '/usr/local/bin/google-chrome';

const PAGE_W = 1280;
const PAGE_H = 720;
const MIN_FONT = 9.5;   // px — nothing smaller is legible in print
const MARGIN_X = 76;
const MARGIN_TOP = 20;
const MARGIN_BOTTOM = 14;

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    args: ['--no-sandbox', '--disable-gpu', '--allow-file-access-from-files',
      '--disable-dev-shm-usage', '--font-render-hinting=none'],
    defaultViewport: { width: PAGE_W, height: PAGE_H },
  });
  const page = await browser.newPage();
  await page.goto(HTML, { waitUntil: 'networkidle0', timeout: 60000 });

  const report = await page.evaluate((cfg) => {
    const out = [];
    document.querySelectorAll('.page').forEach((el, i) => {
      const n = i + 1;
      const pr = el.getBoundingClientRect();
      const issues = [];

      // vertical / horizontal overflow of the page box itself
      if (el.scrollHeight > cfg.PAGE_H + 1) {
        issues.push(`overflow-y by ${el.scrollHeight - cfg.PAGE_H}px`);
      }
      if (el.scrollWidth > cfg.PAGE_W + 1) {
        issues.push(`overflow-x by ${el.scrollWidth - cfg.PAGE_W}px`);
      }

      const bleed = el.classList.contains('no-chrome');
      el.querySelectorAll('*').forEach((c) => {
        const r = c.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        const top = r.top - pr.top;
        const bottom = r.bottom - pr.top;
        const left = r.left - pr.left;
        const right = r.right - pr.left;

        if (!bleed) {
          if (bottom > cfg.PAGE_H - cfg.MARGIN_BOTTOM + 1) {
            issues.push(`"${(c.textContent || '').trim().slice(0, 26)}" crosses the bottom margin (${Math.round(bottom)}px)`);
          }
          if (left < cfg.MARGIN_X - 1 && !c.closest('.rh, .folio, .folio-ar')) {
            issues.push(`"${(c.textContent || '').trim().slice(0, 26)}" crosses the left margin (${Math.round(left)}px)`);
          }
          if (right > cfg.PAGE_W - cfg.MARGIN_X + 1 && !c.closest('.rh, .folio, .folio-ar')) {
            issues.push(`"${(c.textContent || '').trim().slice(0, 26)}" crosses the right margin (${Math.round(right)}px)`);
          }
          if (top < cfg.MARGIN_TOP - 1) {
            issues.push(`"${(c.textContent || '').trim().slice(0, 26)}" crosses the top margin (${Math.round(top)}px)`);
          }
        }

        // legibility
        const hasOwnText = Array.from(c.childNodes)
          .some((k) => k.nodeType === 3 && k.textContent.trim().length > 1);
        if (hasOwnText && !c.closest('.qa-ignore, .lockup')) {
          const fs = parseFloat(getComputedStyle(c).fontSize);
          if (fs < cfg.MIN_FONT) {
            issues.push(`font-size ${fs}px on "${c.textContent.trim().slice(0, 22)}"`);
          }
        }

        if (c.tagName === 'IMG' && !c.complete) issues.push(`image failed: ${c.src}`);
      });

      if (issues.length) out.push({ page: n, section: el.dataset.section || '', issues: [...new Set(issues)] });
    });
    return out;
  }, { PAGE_W, PAGE_H, MIN_FONT, MARGIN_X, MARGIN_TOP, MARGIN_BOTTOM });

  const total = await page.evaluate(() => document.querySelectorAll('.page').length);
  await browser.close();

  console.log(`QA over ${total} pages`);
  if (!report.length) { console.log('  clean'); return; }
  report.forEach((r) => {
    console.log(`\n  page ${String(r.page).padStart(2, '0')}  [${r.section}]`);
    r.issues.slice(0, 6).forEach((i) => console.log(`    - ${i}`));
    if (r.issues.length > 6) console.log(`    ... and ${r.issues.length - 6} more`);
  });
  console.log(`\n${report.length} page(s) flagged`);
  process.exitCode = 1;
})().catch((e) => { console.error(e); process.exit(2); });
