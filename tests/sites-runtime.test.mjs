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
    assert.equal(body.providers.length, 3);
    assert.deepEqual(body.providers.map((provider) => provider.status), ['missing', 'missing', 'missing']);
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
    assert.equal(body.providers.length, 3);
    assert.deepEqual(body.providers.map((provider) => provider.status), ['missing', 'missing', 'missing']);
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
    assert.deepEqual(body.providers.map((provider) => provider.status), ['timeout', 'connected', 'rate_limited']);
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
