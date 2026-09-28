/** Regression tests for the Google API connection in M5; no real network/database writes. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';
import { buildSync } from 'esbuild';

function load(file) {
  const code = buildSync({ entryPoints: [file], bundle: true, platform: 'node', format: 'cjs',
    packages: 'external', write: false, logLevel: 'silent' }).outputFiles[0].text;
  const m = new Module(path.resolve('_ads_test.cjs'));
  m.filename = path.resolve('_ads_test.cjs'); m.paths = Module._nodeModulePaths(process.cwd());
  m._compile(code, m.filename); return m.exports;
}
let checks = 0;
const test = async (label, fn) => { await fn(); checks++; console.log('PASS', label); };
const env = { GADS_CLIENT_ID: 'test-client', GADS_CLIENT_SECRET: 'test-secret', GADS_REFRESH_TOKEN: 'test-refresh',
  GADS_CUSTOMER_IDS: '123-456-7890', GADS_LOGIN_CUSTOMER_ID: '111-222-3333' };
const g = load('api/ads/_google.ts');
await test('Explorer project works without developer token', () => assert.equal(g.isGoogleConfigured(env), true));
await test('missing OAuth is rejected', () => assert.equal(g.isGoogleConfigured({ ...env, GADS_REFRESH_TOKEN: '' }), false));
await test('customer IDs normalize hyphens', () => assert.deepEqual(g.customerList(env), ['1234567890']));
let calls = [];
let payload = [{ campaign: { id: '1', name: 'NCB', status: 'ENABLED' }, segments: { date: '2026-08-01' },
  metrics: { costMicros: '12500000', impressions: '100', clicks: '4', conversions: 1.25 } }];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  calls.push({ url, init });
  if (url.includes('oauth2')) return Response.json({ access_token: 'test-access', expires_in: 3600 });
  const query = JSON.parse(init.body).query;
  return Response.json([{ results: query.includes('FROM customer') ? [{ customer: { id: '1234567890', currencyCode: 'VND' } }] : payload }]);
};
try {
  const rows = await g.fetchCampaignDaily('1234567890', '2026-08-01', '2026-08-31', env);
  await test('micros, decimal conversions and unavailable reach', () => {
    assert.equal(rows[0].spend, 12.5); assert.equal(rows[0].conversions, 1.25); assert.equal(rows[0].reach, null);
  });
  await test('only read-only searchStream sent with normalized MCC', () => {
    const req = calls.at(-1); assert.match(req.url, /googleAds:searchStream$/);
    assert.equal(req.init.headers['login-customer-id'], '1112223333');
    assert.equal(req.init.headers['developer-token'], undefined); assert.match(JSON.parse(req.init.body).query, /FROM campaign/);
  });
  await g.fetchCampaignDaily('1234567890', '2026-08-01', '2026-08-31', { ...env, GADS_DEVELOPER_TOKEN: 'optional-token' });
  await test('configured developer token is sent for accounts that require it', () =>
    assert.equal(calls.at(-1).init.headers['developer-token'], 'optional-token'));
  payload = ['0901234567', '0912345678'].map(searchTerm => ({ campaign: { id: '1' }, segments: { date: '2026-08-01' },
    campaignSearchTermView: { searchTerm }, metrics: { costMicros: '1000000', clicks: 1, impressions: 2, conversions: 0.5 } }));
  payload.push({ campaign: { id: '1' }, segments: { date: '2026-08-01' }, campaignSearchTermView: { searchTerm: 'no activity' }, metrics: {} });
  const terms = await g.fetchSearchTermDaily('1234567890', '2026-08-01', '2026-08-31', env);
  await test('PMax uses campaign_search_term_view', () => assert.match(JSON.parse(calls.at(-1).init.body).query, /FROM campaign_search_term_view/));
  await test('privacy redaction merges values; zero activity omitted', () => {
    assert.equal(terms.rows.length, 1); assert.equal(terms.redacted, 2); assert.equal(terms.rows[0].spend, 2);
    assert.equal(terms.rows[0].conversions, 1); assert.equal(terms.rows[0].searchTerm, '[đã lược]');
  });
  await test('one token refresh per sync', () => assert.equal(calls.filter(r => r.url.includes('oauth2')).length, 1));
  const manager = load('api/ads/_google.ts');
  globalThis.fetch = async url => Response.json(url.includes('oauth2') ? { access_token: 'test-access' } : [{ results: [{ customer: { manager: true } }] }]);
  await test('MCC cannot be configured as reporting customer', () => assert.rejects(() => manager.fetchCustomer('1112223333', env), /GADS_CUSTOMER_IS_MANAGER/));
  const denied = load('api/ads/_google.ts'); let adsCalls = 0;
  globalThis.fetch = async url => {
    if (url.includes('oauth2')) return Response.json({ access_token: 'test-access' });
    adsCalls++; return Response.json({ error: { message: 'The caller does not have permission',
      details: [{ errors: [{ errorCode: { authorizationError: 'CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION' } }] }] } }, { status: 403 });
  };
  await test('403 retains actionable error and stops version retries', async () => {
    await assert.rejects(() => denied.fetchCustomer('1234567890', env), /CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION/); assert.equal(adsCalls, 1);
  });
} finally { globalThis.fetch = originalFetch; }
const shared = load('api/ads/_shared.ts');
await test('Google facts batch 1201 rows into three upserts without double encoding', async () => {
  for (const fn of [shared.upsertNetworkDaily, shared.upsertSearchTermDaily]) {
    const batches = []; const sql = async (_s, ...args) => { batches.push(args[0]); return []; };
    const rows = Array.from({ length: 1201 }, (_, i) => ({ campaignId: String(i), statDate: '2026-08-01',
      network: 'MAPS', searchTerm: 'noire', spend: 2.5, clicks: 1, impressions: 2, conversions: 0.5, hasBrandTerm: true }));
    assert.equal(await fn(sql, rows), 1201); assert.deepEqual(batches.map(x => x.length), [500, 500, 201]);
    assert.equal(typeof batches[0][0], 'object'); assert.equal(batches[0][0].spend, 2.5);
  }
});
const dashboard = load('api/ads/_dashboard.ts');
await test('Meta aggregates and freshness remain isolated from Google', async () => {
  const queries = []; const sql = async (parts, ...args) => { queries.push(parts.reduce((s, p, i) => s + p + (args[i] ?? ''), '')); return []; };
  sql.unsafe = s => s;
  await dashboard.dashboardExtras(sql, '2026-08-01', '2026-08-31');
  const meta = queries.filter(q => q.includes('ads_daily_segment'));
  assert.equal(meta.length, 5); for (const q of meta) assert.match(q, /platform = 'meta'/);
  const efficiency = queries.filter(q => q.includes('msg_spend')); for (const q of efficiency) assert.match(q, /f.platform = 'meta'/);
});
const model = load('src/views/ads/adsModel.ts');
await test('API Google replaces Excel and blended totals count it once', () => {
  const api = { segmentMonthly: [{ month: '2026-08', segment: 'NCB', spend: 100 }],
    google: { ready: true, monthly: [{ month: '2026-08', brand: 'NCB', spend: 25, conv: 1, clicks: 2, impr: 10 }] } };
  assert.equal(model.googleMonthly(api).length, 1);
  assert.equal(model.mediaSpend(model.monthSegmentSpend(api)[0], null), 125);
  assert.equal(model.googleMonthly({ google: { ready: false } }).length > 0, true);
  assert.deepEqual(model.googleMonthly({ google: { ready: true, monthly: [] } }), []);
});
console.log(`RESULT: ${checks} checks passed.`);
