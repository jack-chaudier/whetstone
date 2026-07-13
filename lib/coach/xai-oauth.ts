const XAI_CLIENT_ID = 'b1a00492-073a-47ea-816f-4c329264a828';
const XAI_TOKEN_ENDPOINT = 'https://auth.x.ai/oauth2/token';
const XAI_SCOPES = 'openid profile email offline_access grok-cli:access api:access';
const OAUTH_COOKIE_NAME = 'xai_oauth';
const DEVICE_COOKIE_NAME = 'xai_device';
const OAUTH_COOKIE_MAX_AGE = 30 * 24 * 60 * 60;
const REFRESH_SKEW_MS = 120_000;

export const XAI_OAUTH = {
  clientId: XAI_CLIENT_ID,
  deviceEndpoint: 'https://auth.x.ai/oauth2/device/code',
  tokenEndpoint: XAI_TOKEN_ENDPOINT,
  scopes: XAI_SCOPES,
} as const;

export interface XaiDeviceState {
  device_code: string;
  interval: number;
  expires_at: number;
}

interface XaiOAuthState {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

export interface SubscriptionToken {
  token: string;
  setCookie?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function oauthSecret(): string | null {
  const secret = process.env.OAUTH_COOKIE_SECRET;
  return secret && secret.length >= 32 ? secret : null;
}

export function isXaiOAuthConfigured(): boolean {
  return oauthSecret() !== null;
}

async function cookieKey(): Promise<CryptoKey> {
  const secret = oauthSecret();
  if (!secret) throw new Error('OAuth cookie secret is not configured');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

function base64urlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64urlDecode(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export async function sealJson(value: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await cookieKey(), plaintext));
  const sealed = new Uint8Array(iv.length + ciphertext.length);
  sealed.set(iv);
  sealed.set(ciphertext, iv.length);
  return base64urlEncode(sealed);
}

export async function openJson(value: string): Promise<unknown | null> {
  try {
    const sealed = base64urlDecode(value);
    if (sealed.length <= 12) return null;
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: sealed.slice(0, 12) },
      await cookieKey(),
      sealed.slice(12),
    );
    return JSON.parse(new TextDecoder().decode(plaintext)) as unknown;
  } catch {
    return null;
  }
}

export function cookieValue(request: Request, name: string): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

function serializeCookie(name: string, value: string, maxAge: number): string {
  return `${name}=${encodeURIComponent(value)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${Math.max(0, Math.floor(maxAge))}`;
}

export function clearDeviceCookie(): string {
  return serializeCookie(DEVICE_COOKIE_NAME, '', 0);
}

export function clearOAuthCookie(): string {
  return serializeCookie(OAUTH_COOKIE_NAME, '', 0);
}

export async function deviceCookie(state: XaiDeviceState): Promise<string> {
  return serializeCookie(DEVICE_COOKIE_NAME, await sealJson(state), Math.ceil((state.expires_at - Date.now()) / 1000));
}

async function oauthCookie(state: XaiOAuthState): Promise<string> {
  return serializeCookie(OAUTH_COOKIE_NAME, await sealJson(state), OAUTH_COOKIE_MAX_AGE);
}

export async function getDeviceState(request: Request): Promise<XaiDeviceState | null> {
  const value = cookieValue(request, DEVICE_COOKIE_NAME);
  const state = value ? await openJson(value) : null;
  if (!isRecord(state)
    || typeof state.device_code !== 'string'
    || typeof state.interval !== 'number'
    || !Number.isFinite(state.interval)
    || typeof state.expires_at !== 'number'
    || !Number.isFinite(state.expires_at)) return null;
  return state as unknown as XaiDeviceState;
}

function validOAuthState(value: unknown): value is XaiOAuthState {
  return isRecord(value)
    && typeof value.access_token === 'string'
    && value.access_token.length > 0
    && typeof value.refresh_token === 'string'
    && value.refresh_token.length > 0
    && typeof value.expires_at === 'number'
    && Number.isFinite(value.expires_at);
}

async function readOAuthState(request: Request): Promise<XaiOAuthState | null> {
  const value = cookieValue(request, OAUTH_COOKIE_NAME);
  const state = value ? await openJson(value) : null;
  return validOAuthState(state) ? state : null;
}

function tokenLifetime(payload: Record<string, unknown>): number | null {
  return typeof payload.expires_in === 'number' && Number.isFinite(payload.expires_in) && payload.expires_in > 0
    ? payload.expires_in
    : null;
}

async function refreshedToken(state: XaiOAuthState): Promise<SubscriptionToken | null> {
  let response: Response;
  try {
    response = await fetch(XAI_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: XAI_CLIENT_ID,
        refresh_token: state.refresh_token,
      }),
    });
  } catch {
    return null;
  }

  if (!response.ok) return null;
  const payload: unknown = await response.json().catch(() => null);
  if (!isRecord(payload) || typeof payload.access_token !== 'string' || !payload.access_token) return null;
  const expiresIn = tokenLifetime(payload);
  if (!expiresIn) return null;
  const nextState: XaiOAuthState = {
    access_token: payload.access_token,
    refresh_token: typeof payload.refresh_token === 'string' && payload.refresh_token
      ? payload.refresh_token
      : state.refresh_token,
    expires_at: Date.now() + expiresIn * 1000,
  };
  return { token: nextState.access_token, setCookie: await oauthCookie(nextState) };
}

async function subscriptionToken(request: Request, forceRefresh: boolean): Promise<SubscriptionToken | null> {
  const state = await readOAuthState(request);
  if (!state) return null;
  if (!forceRefresh && state.expires_at - Date.now() > REFRESH_SKEW_MS) return { token: state.access_token };
  return refreshedToken(state);
}

export function getSubscriptionToken(request: Request): Promise<SubscriptionToken | null> {
  return subscriptionToken(request, false);
}

export function refreshSubscriptionToken(request: Request): Promise<SubscriptionToken | null> {
  return subscriptionToken(request, true);
}

export async function createOAuthCookie(accessToken: string, refreshToken: string, expiresIn: number): Promise<string> {
  return oauthCookie({
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: Date.now() + expiresIn * 1000,
  });
}
