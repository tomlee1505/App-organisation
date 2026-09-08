/* Regression test for the hosted page (artifact/daily-hub.html).

   It stands up a fake artifact store that behaves like the real one in the
   way that matters: snapshot bodies come back DEEP FROZEN and survive
   reloads. Putting a frozen body into app state throws on the next edit
   under 'use strict' — which is exactly what made ticks revert and the
   check-in changes fail to apply.

     npm install --no-save playwright
     node tests/artifact-db.mjs
*/
const { chromium } = await import('playwright').catch(function () {
  console.error('Playwright is not installed. Run: npm install --no-save playwright');
  process.exit(1);
});
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const page_html = readFileSync(new URL('../artifact/daily-hub.html', import.meta.url), 'utf8');
const dir = mkdtempSync(join(tmpdir(), 'daily-hub-'));
const file = join(dir, 'page.html');
writeFileSync(file, `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>html{color-scheme:light dark}body{margin:0}[hidden]{display:none!important}</style>
</head><body>${page_html}</body></html>`);

/* the store as the account already holds it: the pre-change check-in */
const SEEDED = {
  'app/config': {
    routines: {
      placement: [
        { id: 'a1', text: 'Check clinic emails' },
        { id: 'a2', text: 'Check the activity list for today' },
        { id: 'a3', text: 'Read yesterday’s handover notes' },
        { id: 'a4', text: 'Set my top 3 priorities' },
        { id: 'a5', text: 'Check in with supervisor' },
        { id: 'a6', text: 'Log placement hours' }
      ],
      university: [
        { id: 'b1', text: 'Check announcements' },
        { id: 'b2', text: 'Check what’s due this week' },
        { id: 'b3', text: '30 minutes of reading' },
        { id: 'b4', text: 'Write up today’s lecture notes' }
      ]
    },
    metrics: [
      { id: 'm1', name: 'Gym', mark: 'G', kind: 'check', target: 1, unit: '' },
      { id: 'm2', name: 'Steps', mark: 'S', kind: 'number', target: 10000, unit: 'steps' },
      { id: 'm3', name: 'Water', mark: 'W', kind: 'counter', target: 8, unit: 'glasses' },
      { id: 'm4', name: 'Meditation', mark: 'M', kind: 'number', target: 10, unit: 'min' },
      { id: 'm5', name: 'Sleep', mark: 'Z', kind: 'number', target: 7, unit: 'hrs' }
    ]
  }
};

function fakeStore(seed) {
  // runs in the page, on every load, before the page's own script
  localStorage.setItem('__fakedb', localStorage.getItem('__fakedb') || JSON.stringify(seed));
  const read = () => JSON.parse(localStorage.getItem('__fakedb'));
  const write = (s) => localStorage.setItem('__fakedb', JSON.stringify(s));
  const freeze = (o) => {
    if (o && typeof o === 'object') { Object.values(o).forEach(freeze); Object.freeze(o); }
    return o;
  };
  const snap = (path) => {
    const raw = read()[path];
    return {
      id: path.split('/').pop(),
      exists: !!raw,
      data: () => raw ? freeze(raw) : undefined,
      metadata: { fromCache: false, hasPendingWrites: false }
    };
  };
  const db = {
    doc: (path) => ({
      id: path.split('/').pop(), path,
      get: () => Promise.resolve(snap(path)),
      set: (d) => { const s = read(); s[path] = JSON.parse(JSON.stringify(d)); write(s); return Promise.resolve(); },
      update: (d) => { const s = read(); s[path] = Object.assign({}, s[path], d); write(s); return Promise.resolve(); },
      delete: () => { const s = read(); delete s[path]; write(s); return Promise.resolve(); }
    }),
    collection: (path) => {
      let order = null, dir = 'asc', cap = 0;
      const api = {
        orderBy: (f, d) => { order = f; dir = d || 'asc'; return api; },
        limit: (n) => { cap = n; return api; },
        get: () => {
          const depth = path.split('/').length + 1;
          let docs = Object.keys(read())
            .filter((k) => k.startsWith(path + '/') && k.split('/').length === depth)
            .map(snap);
          if (order) docs.sort((a, b) => {
            const av = a.data()[order] ?? '', bv = b.data()[order] ?? '';
            const c = av < bv ? -1 : av > bv ? 1 : 0;
            return dir === 'desc' ? -c : c;
          });
          if (cap) docs = docs.slice(0, cap);
          return Promise.resolve({ docs, size: docs.length, empty: !docs.length, docChanges: () => [] });
        }
      };
      return api;
    }
  };
  // the real one resolves late, never during the page's first synchronous run
  window.claude = { use: (n) => new Promise((r) => setTimeout(() => r(n === 'db' ? db : null), 60)) };
}

const errs = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
await ctx.addInitScript(fakeStore, SEEDED);
const page = await ctx.newPage();
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('ERR_')) errs.push('console: ' + m.text());
});
const assert = (c, m) => { if (!c) errs.push('FAIL: ' + m); };
const rows = (sel) => page.$$eval(sel, (ns) => ns.map((n) => n.textContent.trim()));
const load = async () => { await page.goto('file://' + file); await page.waitForTimeout(400); };

await load();

/* 1. the stored check-in is migrated, not just the defaults */
assert(JSON.stringify(await rows('#routinePlacement .row-text')) === JSON.stringify(
  ['Check clinic emails', 'Submit logbook', 'Check phone notes']),
  'placement check-in migrated in the store: ' + JSON.stringify(await rows('#routinePlacement .row-text')));

await page.click('.tab[data-page="university"]');
assert(JSON.stringify(await rows('#routineUniversity .row-text')) === JSON.stringify(
  ['Finish weekly notes before Thursday class',
   'Update readings and put them into a podcast',
   'Listen to weekly podcast content']),
  'university check-in migrated: ' + JSON.stringify(await rows('#routineUniversity .row-text')));

await page.click('.tab[data-page="health"]');
const med = page.locator('.tile').filter({ hasText: 'Meditation' });
assert(await med.locator('.box').count() === 1, 'meditation became a tick');
assert((await med.locator('.tile-sub').textContent()).trim() === '', 'meditation has no target line');
assert((await page.locator('.tile').filter({ hasText: 'Gym' }).locator('.tile-sub').textContent()).trim() === '',
  'gym just says Gym');

/* 2. the migration was written back to the store */
const stored = JSON.parse(await page.evaluate(() => localStorage.getItem('__fakedb')));
assert(stored['app/config'].rev === 2, 'store carries the new revision');
assert(stored['app/config'].routines.placement.length === 3, 'store holds the new placement list');

/* 3. THE REPORTED BUG: a tick must stick, on the page and across a reload */
await page.click('.tab[data-page="placement"]');
await page.locator('#routinePlacement .box').first().click();
await page.waitForTimeout(100);
assert(await page.locator('#routinePlacement .box').first().getAttribute('aria-checked') === 'true',
  'the tick registers');
assert((await page.locator('#countPlacementRoutine').textContent()).includes('1 of 3'), 'count follows the tick');

await load();
assert(await page.locator('#routinePlacement .box').first().getAttribute('aria-checked') === 'true',
  'the tick survives a reload — it must not revert');
assert(JSON.stringify(await rows('#routinePlacement .row-text')) === JSON.stringify(
  ['Check clinic emails', 'Submit logbook', 'Check phone notes']),
  'the check-in does not revert to the old list after a reload');

/* 4. tasks, health values and notes all survive the round trip */
await page.fill('[data-add-task="placement"] input[name=text]', 'Ring the ward');
await page.click('[data-add-task="placement"] button[type=submit]');
await page.click('.tab[data-page="health"]');
const water = page.locator('.tile').filter({ hasText: 'Water' });
for (let i = 0; i < 3; i++) await water.locator('.step').last().click();
await med.locator('.box').click();
await page.click('.tab[data-page="university"]');
await page.click('#addNote');
await page.fill('#fld_title', 'Week 5 pharmacology');
await page.fill('#fld_body', 'beta blockers');
await page.click('#dialogForm button[type=submit]');
await page.waitForTimeout(150);

await load();
await page.click('.tab[data-page="health"]');
assert((await water.locator('.tile-val').textContent()).trim() === '3 / 8', 'water count persisted');
assert(await med.locator('.box').getAttribute('aria-checked') === 'true', 'meditation tick persisted');
await page.click('.tab[data-page="placement"]');
assert((await rows('#tasksPlacement .row-text'))[0] === 'Ring the ward', 'task persisted');
await page.locator('#tasksPlacement .box').first().click();
await page.waitForTimeout(100);
assert((await page.locator('#countPlacementTasks').textContent()) === '0 open', 'completing a task works');
await page.click('.tab[data-page="university"]');
assert((await rows('#notes .note-head h3'))[0] === 'Week 5 pharmacology', 'note persisted');

/* 5. moving off today and back must not throw or lose the day */
await page.click('#prev');
await page.waitForTimeout(150);
await page.click('#dateBtn');
await page.waitForTimeout(150);
await page.click('.tab[data-page="placement"]');
assert(await page.locator('#routinePlacement .box').first().getAttribute('aria-checked') === 'true',
  'today is intact after navigating away and back');

const status = await page.locator('#statusText').textContent();
assert(status.includes('Synced'), 'status reports synced, got: ' + status);

await browser.close();
console.log(errs.length ? 'PROBLEMS:\n' + errs.join('\n') : 'ALL CHECKS PASSED');
process.exit(errs.length ? 1 : 0);
