/* Browser smoke test. Serve the folder, then run it:
     npx http-server -p 8123 -s .
     node tests/smoke.mjs
   Override the address with BASE_URL if you serve it elsewhere. */
const { chromium } = await import('playwright').catch(function () {
  console.error('Playwright is not installed. Run: npm install --no-save playwright');
  process.exit(1);
});

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8123';

const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));

await page.goto(BASE + '/index.html');
await page.waitForTimeout(300);

const assert = (c, m) => { if (!c) errors.push('FAIL: ' + m); };

// placement routine renders + ticking works
assert((await page.locator('#placementRoutine li').count()) === 3, 'placement routine has 3 items');
await page.locator('#placementRoutine .tick').first().click();
assert((await page.locator('#placementRoutineCount').textContent()) === '1/3', 'routine count updates');

// task add
await page.fill('[data-add-task="placement"] input[name=text]', 'Ring the ward');
await page.click('[data-add-task="placement"] button[type=submit]');
assert((await page.locator('#placementTasks li .item-text').first().textContent()) === 'Ring the ward', 'task added');
assert((await page.locator('#placementTaskCount').textContent()) === '1 open', 'task count');
await page.locator('#placementTasks .tick').first().click();
assert((await page.locator('#placementTaskCount').textContent()) === '0 open', 'task completes');

// day note
await page.fill('#placementNote', 'with Sarah today');
await page.waitForTimeout(600);

// university note modal
await page.click('.tab[data-page="university"]');
await page.click('[data-action="add-note"]');
await page.fill('#f_title', 'Week 5 pharmacology');
await page.selectOption('#f_kind', 'lecture');
await page.fill('#f_body', 'beta blockers');
await page.click('#modalForm button[type=submit]');
assert((await page.locator('#notesList .note').count()) === 1, 'note created');
await page.click('.chip[data-kind="reading"]');
assert((await page.locator('#notesList .note').count()) === 0, 'filter excludes lecture');
await page.click('.chip[data-kind="all"]');
await page.fill('#noteSearch', 'beta');
assert((await page.locator('#notesList .note').count()) === 1, 'search matches body');

// health metrics
await page.click('.tab[data-page="health"]');
assert((await page.locator('.metric').count()) === 5, '5 metrics');
const metric = (name) => page.locator('.metric').filter({ hasText: name });
await metric('Gym').locator('.tick').click();
for (let i = 0; i < 7; i++) await metric('Water').locator('.step-btn').last().click();  // 7 x 0.5L
assert((await metric('Water').locator('.metric-val').textContent()).trim() === '3.5 / 3.5',
  'water reaches 3.5 exactly: ' + (await metric('Water').locator('.metric-val').textContent()));
for (let i = 0; i < 8; i++) await metric('Steps').locator('.step-btn').last().click();  // 8 x 1000
assert((await metric('Steps').locator('.metric-val').textContent()).trim() === '8,000 / 8,000',
  'steps reach 8,000: ' + (await metric('Steps').locator('.metric-val').textContent()));
assert((await page.locator('#healthCount').textContent()) === '3/5', 'gym, water and steps met');
const sleepInput = metric('Sleep').locator('input[type=number]');
await sleepInput.fill('8');
await sleepInput.blur();
assert((await page.locator('#healthCount').textContent()) === '4/5', 'sleep met');
assert((await page.locator('.heat-day').count()) === 14, '14 day history');

// persistence across reload
await page.reload();
await page.waitForTimeout(300);
assert((await page.locator('#healthCount').textContent()) === '4/5', 'health persists');
assert((await page.locator('#placementNote').inputValue()) === 'with Sarah today', 'note persists');
assert((await page.locator('.tab.is-active').getAttribute('data-page')) === 'health', 'last tab remembered');

// date navigation: yesterday should be empty, today button returns
await page.click('#prevDay');
assert((await page.locator('#healthCount').textContent()) === '0/5', 'past day is empty');
await page.click('.tab[data-page="placement"]');
assert((await page.locator('#placementRoutineCount').textContent()) === '0/3', 'past routine empty');
await page.click('#dateLabel');
assert((await page.locator('#placementRoutineCount').textContent()) === '1/3', 'back to today keeps ticks');
assert((await page.locator('#placementTaskCount').textContent()) === '0 open', 'tasks carry across dates');

await page.screenshot({ path: 'tests/placement.png', fullPage: true });
await page.click('.tab[data-page="health"]');
await page.screenshot({ path: 'tests/health.png', fullPage: true });

await browser.close();
console.log(errors.length ? 'PROBLEMS:\n' + errors.join('\n') : 'ALL CHECKS PASSED');
process.exit(errors.length ? 1 : 0);
