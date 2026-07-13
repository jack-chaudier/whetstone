import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workerUrl = new URL('../dist/server/index.js', import.meta.url);
workerUrl.searchParams.set('test', `${process.pid}-${Date.now()}`);
const { default: worker } = await import(workerUrl.href);

const runtime = {
  ASSETS: { fetch: async () => new Response('Not found', { status: 404 }) },
};
const context = { waitUntil() {}, passThroughOnException() {} };

function request(path, init) {
  return worker.fetch(new Request(`http://localhost${path}`, init), runtime, context);
}

function cookiePair(response, name) {
  const setCookie = response.headers.get('set-cookie') ?? '';
  const match = setCookie.match(new RegExp(`(?:^|,\\s*)${name}=([^;]*)`));
  assert.ok(match, `Expected ${name} Set-Cookie header`);
  return `${name}=${match[1]}`;
}

const OAUTH_SECRET = 'test-only-oauth-cookie-secret-with-32-chars';
const XAI_CLIENT_ID = 'b1a00492-073a-47ea-816f-4c329264a828';
const XAI_SCOPES = 'openid profile email offline_access grok-cli:access api:access';

const project = {
  id: 'project-test',
  createdAt: '2026-07-12T00:00:00.000Z',
  covenant: {
    ambition: 'Test a connection',
    why: 'Verify behavior',
    shape: 'investigate',
    existing: '',
    obstacle: '',
    humanOwned: ['final judgment'],
    delegable: ['questions'],
    schedule: { days: [1], window: 'morning', minutes: 20 },
    tone: 'dry',
    milestone: 'Reach a verified result',
    createdAt: '2026-07-12T00:00:00.000Z',
  },
  invitations: [],
  sessions: [],
  threads: [],
};

const session = {
  id: 'session-test',
  projectId: project.id,
  invitationId: 'invitation-test',
  startedAt: '2026-07-12T00:00:00.000Z',
  work: '',
  sources: '',
  wordsProduced: 0,
  coachExchanges: [],
  kind: 'work',
};

function assistRequest(provider) {
  return request('/api/coach', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'assist', provider, project, session, ask: 'Ask one question', level: 'question' }),
  });
}

test('server-renders the Tenzon application', async () => {
  const response = await request('/');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /^text\/html\b/i);
  assert.match(await response.text(), /<title>Tenzon — Project steward<\/title>/i);
});

test('generated Worker enables runtime bindings in process.env', async () => {
  const config = JSON.parse(await readFile(new URL('../dist/server/wrangler.json', import.meta.url), 'utf8'));
  assert.ok(config.compatibility_flags.includes('nodejs_compat'));
  assert.ok(config.compatibility_date >= '2025-04-01');
});

test('reports all provider configuration without leaking secrets', async () => {
  const original = Object.fromEntries([
    'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'XAI_API_KEY',
  ].map((key) => [key, process.env[key]]));
  for (const key of Object.keys(original)) delete process.env[key];

  try {
    const response = await request('/api/coach/status');
    assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control') ?? '', /no-store/);
    const text = await response.text();
    const body = JSON.parse(text);
    assert.equal(body.providers.length, 4);
    assert.deepEqual(body.providers.map((provider) => provider.status), ['missing', 'missing', 'missing', 'missing']);
    assert.equal(body.oauthConfigured, false);
    assert.doesNotMatch(text, /API_KEY|authorization|Bearer/i);
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test('connection check reports missing secrets independently', async () => {
  const original = Object.fromEntries([
    'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'XAI_API_KEY',
  ].map((key) => [key, process.env[key]]));
  for (const key of Object.keys(original)) delete process.env[key];

  try {
    const response = await request('/api/coach/status', { method: 'POST' });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control') ?? '', /no-store/);
    const text = await response.text();
    const body = JSON.parse(text);
    assert.equal(body.providers.length, 4);
    assert.deepEqual(body.providers.map((provider) => provider.status), ['missing', 'missing', 'missing', 'missing']);
    assert.doesNotMatch(text, /API_KEY|authorization|Bearer/i);
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test('connection check isolates mixed outcomes and never serializes secrets or upstream details', async () => {
  const keys = {
    ANTHROPIC_API_KEY: 'sentinel-anthropic-secret',
    OPENAI_API_KEY: 'sentinel-openai-secret',
    XAI_API_KEY: 'sentinel-xai-secret',
  };
  const originalEnv = Object.fromEntries(Object.keys(keys).map((key) => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  const requests = [];
  Object.assign(process.env, keys);

  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    const body = input instanceof Request
      ? await input.clone().json()
      : JSON.parse(String(init?.body ?? '{}'));
    requests.push({ url, model: body.model, maxTokens: body.max_completion_tokens ?? body.max_tokens });

    if (url.includes('api.anthropic.com')) throw new DOMException('private-upstream-detail', 'TimeoutError');
    if (url.includes('api.openai.com')) {
      return Response.json({ choices: [{ message: { content: 'OK' } }] });
    }
    if (url.includes('api.x.ai')) {
      return Response.json({ error: { message: 'private-upstream-detail' } }, { status: 429 });
    }
    throw new Error(`Unexpected provider URL: ${url}`);
  };

  try {
    const response = await request('/api/coach/status', { method: 'POST' });
    assert.equal(response.status, 200);
    const text = await response.text();
    const body = JSON.parse(text);
    assert.deepEqual(body.providers.map((provider) => provider.status), ['timeout', 'connected', 'rate_limited', 'missing']);
    assert.deepEqual(requests.map((entry) => entry.model).sort(), ['claude-sonnet-5', 'gpt-5.6-luna', 'grok-4.5'].sort());
    assert.equal(requests.find((entry) => entry.model === 'grok-4.5')?.maxTokens, 300);
    for (const secret of Object.values(keys)) assert.doesNotMatch(text, new RegExp(secret));
    assert.doesNotMatch(text, /private-upstream-detail|authorization|Bearer/i);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test('empty provider output fails so the client can use its scripted fallback', async () => {
  const keys = {
    ANTHROPIC_API_KEY: 'sentinel-anthropic-secret',
    OPENAI_API_KEY: 'sentinel-openai-secret',
  };
  const originalEnv = Object.fromEntries(Object.keys(keys).map((key) => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  Object.assign(process.env, keys);

  globalThis.fetch = async (input) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.includes('api.anthropic.com')) {
      return Response.json({
        id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-sonnet-5',
        content: [{ type: 'text', text: '   ' }], stop_reason: 'end_turn', stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 0 },
      });
    }
    if (url.includes('api.openai.com')) {
      return Response.json({ choices: [{ message: { content: '' } }] });
    }
    throw new Error(`Unexpected provider URL: ${url}`);
  };

  try {
    for (const provider of ['anthropic', 'openai']) {
      const response = await assistRequest(provider);
      assert.equal(response.status, 502);
      assert.match((await response.json()).error, /coach request failed$/);
    }
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test('xAI OAuth start reports 503 when cookie encryption is not configured', async () => {
  const originalSecret = process.env.OAUTH_COOKIE_SECRET;
  delete process.env.OAUTH_COOKIE_SECRET;
  try {
    const response = await request('/api/oauth/xai/start', { method: 'POST' });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'oauth-not-configured' });
  } finally {
    if (originalSecret === undefined) delete process.env.OAUTH_COOKIE_SECRET;
    else process.env.OAUTH_COOKIE_SECRET = originalSecret;
  }
});

test('sealed device cookie roundtrips through polling and rejects tampering', async () => {
  const originalSecret = process.env.OAUTH_COOKIE_SECRET;
  const originalFetch = globalThis.fetch;
  process.env.OAUTH_COOKIE_SECRET = OAUTH_SECRET;
  let tokenPolls = 0;

  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    const form = new URLSearchParams(String(init?.body ?? ''));
    if (url === 'https://auth.x.ai/oauth2/device/code') {
      assert.equal(form.get('client_id'), XAI_CLIENT_ID);
      assert.equal(form.get('scope'), XAI_SCOPES);
      return Response.json({
        device_code: 'private-device-code', user_code: 'ABCD-EFGH',
        verification_uri: 'https://accounts.x.ai/activate', expires_in: 600, interval: 5,
      });
    }
    if (url === 'https://auth.x.ai/oauth2/token') {
      tokenPolls += 1;
      assert.equal(form.get('grant_type'), 'urn:ietf:params:oauth:grant-type:device_code');
      assert.equal(form.get('client_id'), XAI_CLIENT_ID);
      assert.equal(form.get('device_code'), 'private-device-code');
      return Response.json({ error: 'authorization_pending' }, { status: 400 });
    }
    throw new Error(`Unexpected OAuth URL: ${url}`);
  };

  try {
    const start = await request('/api/oauth/xai/start', { method: 'POST' });
    assert.equal(start.status, 200);
    const startText = await start.clone().text();
    const startBody = JSON.parse(startText);
    assert.deepEqual(startBody, {
      userCode: 'ABCD-EFGH', verificationUri: 'https://accounts.x.ai/activate', expiresIn: 600, interval: 5,
    });
    assert.doesNotMatch(startText, /private-device-code/);
    assert.match(start.headers.get('set-cookie') ?? '', /HttpOnly; Secure; SameSite=Lax; Path=\/; Max-Age=/);

    const deviceCookie = cookiePair(start, 'xai_device');
    const pending = await request('/api/oauth/xai/poll', { method: 'POST', headers: { cookie: deviceCookie } });
    assert.equal(pending.status, 200);
    assert.deepEqual(await pending.json(), { status: 'pending', interval: 5 });
    assert.equal(tokenPolls, 1);

    const [name, value] = deviceCookie.split('=');
    const tampered = `${name}=${value[0] === 'A' ? 'B' : 'A'}${value.slice(1)}`;
    const rejected = await request('/api/oauth/xai/poll', { method: 'POST', headers: { cookie: tampered } });
    assert.equal(rejected.status, 410);
    assert.deepEqual(await rejected.json(), { status: 'expired' });
    assert.equal(tokenPolls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalSecret === undefined) delete process.env.OAUTH_COOKIE_SECRET;
    else process.env.OAUTH_COOKIE_SECRET = originalSecret;
  }
});

test('xAI OAuth poll maps pending, slow down, denial, expiry, and success without leaking tokens', async () => {
  const originalSecret = process.env.OAUTH_COOKIE_SECRET;
  const originalFetch = globalThis.fetch;
  process.env.OAUTH_COOKIE_SECRET = OAUTH_SECRET;
  let pollPayload = { error: 'authorization_pending' };
  let pollStatus = 400;

  globalThis.fetch = async (input) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === 'https://auth.x.ai/oauth2/device/code') {
      return Response.json({
        device_code: 'mapping-device-code', user_code: 'MAPS-CODE',
        verification_uri_complete: 'https://accounts.x.ai/activate?code=MAPS-CODE',
        verification_uri: 'https://accounts.x.ai/activate', expires_in: 600, interval: 5,
      });
    }
    if (url === 'https://auth.x.ai/oauth2/token') return Response.json(pollPayload, { status: pollStatus });
    throw new Error(`Unexpected OAuth URL: ${url}`);
  };

  try {
    const start = await request('/api/oauth/xai/start', { method: 'POST' });
    const originalDeviceCookie = cookiePair(start, 'xai_device');
    assert.equal((await start.json()).verificationUri, 'https://accounts.x.ai/activate?code=MAPS-CODE');

    const cases = [
      [{ error: 'authorization_pending' }, 400, 'pending'],
      [{ error: 'slow_down' }, 400, 'slow-down'],
      [{ error: 'access_denied' }, 400, 'denied'],
      [{ error: 'expired_token' }, 400, 'expired'],
    ];
    for (const [payload, status, expected] of cases) {
      pollPayload = payload;
      pollStatus = status;
      const response = await request('/api/oauth/xai/poll', {
        method: 'POST', headers: { cookie: originalDeviceCookie },
      });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.status, expected);
      if (expected === 'slow-down') {
        assert.equal(body.interval, 10);
        assert.match(response.headers.get('set-cookie') ?? '', /^xai_device=/);
      }
    }

    pollPayload = { access_token: 'private-access-token', refresh_token: 'private-refresh-token', expires_in: 3600 };
    pollStatus = 200;
    const connected = await request('/api/oauth/xai/poll', {
      method: 'POST', headers: { cookie: originalDeviceCookie },
    });
    assert.equal(connected.status, 200);
    const connectedText = await connected.text();
    assert.deepEqual(JSON.parse(connectedText), { status: 'connected' });
    assert.doesNotMatch(connectedText, /private-access-token|private-refresh-token/);
    assert.match(connected.headers.get('set-cookie') ?? '', /xai_oauth=.*HttpOnly; Secure; SameSite=Lax; Path=\/; Max-Age=2592000/);
    assert.match(connected.headers.get('set-cookie') ?? '', /xai_device=;.*Max-Age=0/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalSecret === undefined) delete process.env.OAUTH_COOKIE_SECRET;
    else process.env.OAUTH_COOKIE_SECRET = originalSecret;
  }
});

test('subscription token inside the refresh skew is refreshed and persisted by coach status', async () => {
  const originalSecret = process.env.OAUTH_COOKIE_SECRET;
  const originalFetch = globalThis.fetch;
  process.env.OAUTH_COOKIE_SECRET = OAUTH_SECRET;
  let refreshCalls = 0;

  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    const form = new URLSearchParams(String(init?.body ?? ''));
    if (url === 'https://auth.x.ai/oauth2/device/code') {
      return Response.json({
        device_code: 'refresh-device', user_code: 'NEAR-EXPIRY',
        verification_uri: 'https://accounts.x.ai/activate', expires_in: 600, interval: 5,
      });
    }
    if (url === 'https://auth.x.ai/oauth2/token' && form.get('grant_type')?.includes('device_code')) {
      return Response.json({ access_token: 'expiring-access', refresh_token: 'durable-refresh', expires_in: 60 });
    }
    if (url === 'https://auth.x.ai/oauth2/token' && form.get('grant_type') === 'refresh_token') {
      refreshCalls += 1;
      assert.equal(form.get('client_id'), XAI_CLIENT_ID);
      assert.equal(form.get('refresh_token'), 'durable-refresh');
      return Response.json({ access_token: 'fresh-access', refresh_token: 'rotated-refresh', expires_in: 3600 });
    }
    throw new Error(`Unexpected refresh URL: ${url}`);
  };

  try {
    const start = await request('/api/oauth/xai/start', { method: 'POST' });
    const deviceCookie = cookiePair(start, 'xai_device');
    const connected = await request('/api/oauth/xai/poll', { method: 'POST', headers: { cookie: deviceCookie } });
    const oauthCookie = cookiePair(connected, 'xai_oauth');

    const status = await request('/api/coach/status', { headers: { cookie: oauthCookie } });
    assert.equal(status.status, 200);
    const body = await status.json();
    const subscription = body.providers.find((provider) => provider.id === 'xai-oauth');
    assert.equal(subscription.configured, true);
    assert.equal(subscription.status, 'configured');
    assert.equal(refreshCalls, 1);
    assert.match(status.headers.get('set-cookie') ?? '', /^xai_oauth=/);
    assert.doesNotMatch(JSON.stringify(body), /fresh-access|rotated-refresh|durable-refresh/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalSecret === undefined) delete process.env.OAUTH_COOKIE_SECRET;
    else process.env.OAUTH_COOKIE_SECRET = originalSecret;
  }
});

test('subscription probes sanitize OAuth allowlist refusal and coach retries one 401 after refresh', async () => {
  const originalSecret = process.env.OAUTH_COOKIE_SECRET;
  const originalFetch = globalThis.fetch;
  const envKeys = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'XAI_API_KEY'];
  const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  process.env.OAUTH_COOKIE_SECRET = OAUTH_SECRET;
  for (const key of envKeys) delete process.env[key];
  let mode = 'connect';
  const bearerTokens = [];

  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    const form = new URLSearchParams(String(init?.body ?? ''));
    if (url === 'https://auth.x.ai/oauth2/device/code') {
      return Response.json({
        device_code: 'probe-device', user_code: 'PROBE-CODE',
        verification_uri: 'https://accounts.x.ai/activate', expires_in: 600, interval: 5,
      });
    }
    if (url === 'https://auth.x.ai/oauth2/token' && form.get('grant_type')?.includes('device_code')) {
      return Response.json({ access_token: 'initial-oauth-access', refresh_token: 'probe-refresh', expires_in: 3600 });
    }
    if (url === 'https://auth.x.ai/oauth2/token' && form.get('grant_type') === 'refresh_token') {
      assert.equal(form.get('refresh_token'), 'probe-refresh');
      return Response.json({ access_token: 'refreshed-oauth-access', expires_in: 3600 });
    }
    if (url === 'https://api.x.ai/v1/chat/completions') {
      bearerTokens.push(init?.headers?.authorization);
      if (mode === 'allowlist') {
        return Response.json({ error: 'private-tier-detail' }, { status: 403 });
      }
      return Response.json({ error: 'private-auth-detail' }, { status: 401 });
    }
    throw new Error(`Unexpected subscription URL: ${url}`);
  };

  try {
    const start = await request('/api/oauth/xai/start', { method: 'POST' });
    const deviceCookie = cookiePair(start, 'xai_device');
    const connected = await request('/api/oauth/xai/poll', { method: 'POST', headers: { cookie: deviceCookie } });
    const oauthCookie = cookiePair(connected, 'xai_oauth');

    mode = 'allowlist';
    const check = await request('/api/coach/status', { method: 'POST', headers: { cookie: oauthCookie } });
    const checkText = await check.text();
    const subscription = JSON.parse(checkText).providers.find((provider) => provider.id === 'xai-oauth');
    assert.equal(subscription.status, 'oauth_access_refused');
    assert.doesNotMatch(checkText, /private-tier-detail|initial-oauth-access|Bearer/i);

    mode = 'reconnect';
    bearerTokens.length = 0;
    const coach = await request('/api/coach', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: oauthCookie },
      body: JSON.stringify({
        action: 'assist', provider: 'xai-oauth', project, session,
        ask: 'Ask one question', level: 'question',
      }),
    });
    assert.equal(coach.status, 401);
    const coachText = await coach.text();
    assert.deepEqual(JSON.parse(coachText), { error: 'Reconnect Grok to continue.' });
    assert.deepEqual(bearerTokens, ['Bearer initial-oauth-access', 'Bearer refreshed-oauth-access']);
    assert.match(coach.headers.get('set-cookie') ?? '', /^xai_oauth=/);
    assert.doesNotMatch(coachText, /private-auth-detail|initial-oauth-access|refreshed-oauth-access|probe-refresh/);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    if (originalSecret === undefined) delete process.env.OAUTH_COOKIE_SECRET;
    else process.env.OAUTH_COOKIE_SECRET = originalSecret;
  }
});
