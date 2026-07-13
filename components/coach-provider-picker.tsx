'use client';

import { useEffect, useState } from 'react';
import { COACH_MODELS } from '@/lib/coach/models';
import type { ApiCoachProvider, CoachProviderId } from '@/lib/types';

type ProviderCheckStatus = 'configured' | 'missing' | 'connected' | 'invalid_credentials' | 'model_unavailable' | 'rate_limited' | 'timeout' | 'provider_error' | 'oauth_access_refused';
type OAuthState = 'loading' | 'not-configured' | 'disconnected' | 'starting' | 'waiting' | 'connected' | 'expired' | 'denied' | 'error';

interface ProviderStatus {
  id: ApiCoachProvider;
  label: string;
  vendor: string;
  model: string;
  configured: boolean;
  status: ProviderCheckStatus;
  checkedAt?: string;
  latencyMs?: number;
}

interface OAuthDevice {
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
}

interface CoachProviderPickerProps {
  selected: CoachProviderId | null;
  onChange: (provider: CoachProviderId) => void;
  showCheck?: boolean;
  legend?: string;
  disabled?: boolean;
}

export function CoachProviderPicker({ selected, onChange, showCheck = true, legend = 'Coach provider', disabled = false }: CoachProviderPickerProps) {
  const [providerStatus, setProviderStatus] = useState<Record<ApiCoachProvider, ProviderStatus> | null>(null);
  const [checkingProviders, setCheckingProviders] = useState(false);
  const [providerCheckError, setProviderCheckError] = useState(false);
  const [oauthConfigured, setOauthConfigured] = useState<boolean | null>(null);
  const [oauthState, setOauthState] = useState<OAuthState>('loading');
  const [oauthDevice, setOauthDevice] = useState<OAuthDevice | null>(null);
  const [pollAttempt, setPollAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    void fetch('/api/coach/status', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Coach status unavailable');
        return response.json() as Promise<{ providers: ProviderStatus[]; oauthConfigured: boolean }>;
      })
      .then((body) => {
        if (!active) return;
        const indexed = indexProviderStatus(body.providers);
        setProviderStatus(indexed);
        setOauthConfigured(body.oauthConfigured);
        setOauthState(!body.oauthConfigured ? 'not-configured' : indexed['xai-oauth']?.configured ? 'connected' : 'disconnected');
      })
      .catch(() => {
        if (active) {
          setProviderCheckError(true);
          setOauthState('error');
        }
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (oauthState !== 'waiting' || !oauthDevice) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetch('/api/oauth/xai/poll', { method: 'POST', cache: 'no-store', signal: controller.signal })
        .then(async (response) => {
          const body = await response.json() as { status?: string; interval?: number };
          if (!response.ok && body.status !== 'expired') throw new Error('OAuth poll failed');
          return body;
        })
        .then((body) => {
          if (body.status === 'pending') {
            setPollAttempt((attempt) => attempt + 1);
          } else if (body.status === 'slow-down') {
            setOauthDevice((current) => current ? { ...current, interval: body.interval ?? current.interval + 5 } : current);
            setPollAttempt((attempt) => attempt + 1);
          } else if (body.status === 'connected') {
            setOauthState('connected');
            setOauthDevice(null);
            setProviderStatus((current) => current ? {
              ...current,
              'xai-oauth': { ...current['xai-oauth'], configured: true, status: 'configured' },
            } : current);
            if (!disabled) onChange('xai-oauth');
          } else if (body.status === 'expired') {
            setOauthState('expired');
            setOauthDevice(null);
          } else if (body.status === 'denied') {
            setOauthState('denied');
            setOauthDevice(null);
          } else {
            setOauthState('error');
            setOauthDevice(null);
          }
        })
        .catch((error: unknown) => {
          if (!(error instanceof DOMException && error.name === 'AbortError')) {
            setOauthState('error');
            setOauthDevice(null);
          }
        });
    }, oauthDevice.interval * 1000);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [disabled, oauthDevice, oauthState, onChange, pollAttempt]);

  async function checkConnections() {
    setCheckingProviders(true);
    setProviderCheckError(false);
    try {
      const response = await fetch('/api/coach/status', { method: 'POST', cache: 'no-store' });
      if (!response.ok) throw new Error('Connection check unavailable');
      const body = await response.json() as { providers: ProviderStatus[]; oauthConfigured: boolean };
      setProviderStatus(indexProviderStatus(body.providers));
      setOauthConfigured(body.oauthConfigured);
    } catch {
      setProviderCheckError(true);
    } finally {
      setCheckingProviders(false);
    }
  }

  async function startOAuth() {
    setOauthState('starting');
    setOauthDevice(null);
    try {
      const response = await fetch('/api/oauth/xai/start', { method: 'POST', cache: 'no-store' });
      const body = await response.json() as Partial<OAuthDevice> & { error?: string };
      if (response.status === 503 && body.error === 'oauth-not-configured') {
        setOauthConfigured(false);
        setOauthState('not-configured');
        return;
      }
      if (!response.ok
        || typeof body.userCode !== 'string'
        || typeof body.verificationUri !== 'string'
        || typeof body.expiresIn !== 'number'
        || typeof body.interval !== 'number') throw new Error('OAuth start failed');
      setOauthDevice(body as OAuthDevice);
      setPollAttempt(0);
      setOauthState('waiting');
    } catch {
      setOauthState('error');
    }
  }

  async function disconnectOAuth() {
    try {
      const response = await fetch('/api/oauth/xai', { method: 'DELETE', cache: 'no-store' });
      if (!response.ok) throw new Error('OAuth disconnect failed');
      setOauthState('disconnected');
      setOauthDevice(null);
      setProviderStatus((current) => current ? {
        ...current,
        'xai-oauth': { ...current['xai-oauth'], configured: false, status: 'missing' },
      } : current);
      if (selected === 'xai-oauth') onChange('scripted');
    } catch {
      setOauthState('error');
    }
  }

  return <>
    <fieldset className="provider-list"><legend className="sr-only">{legend}</legend>
      <ProviderOption id="scripted" checked={selected === 'scripted'} disabled={disabled} onChange={onChange} label="Tenzon scripted" detail="deterministic · offline · always available" />
      {COACH_MODELS.map((model) => {
        const status = providerStatus?.[model.id];
        return <ProviderOption
          key={model.id}
          id={model.id}
          checked={selected === model.id}
          disabled={disabled || !status?.configured}
          onChange={onChange}
          label={model.label}
          detail={model.id === 'xai-oauth' ? 'your xAI subscription' : `${model.vendor} · ${model.model}`}
          hint={providerHint(status, model.id === 'xai-oauth' ? oauthConfigured : null)}
          status={status?.status}
        />;
      })}
    </fieldset>
    <OAuthConnectRow state={oauthState} device={oauthDevice} onStart={startOAuth} onDisconnect={disconnectOAuth} disabled={disabled} />
    {showCheck && <div className="provider-check"><button type="button" className="button button-secondary" disabled={disabled || checkingProviders || (!providerStatus && !providerCheckError)} onClick={checkConnections}>{checkingProviders ? 'Checking connections' : providerCheckError && !providerStatus ? 'Retry connection status' : 'Check all connections'}</button><p aria-live="polite">{providerCheckError ? 'Connection status is unavailable. Try again.' : checkingProviders ? 'Sending one minimal, project-free request to each configured model.' : 'Checks are manual and never include your project content.'}</p></div>}
  </>;
}

function indexProviderStatus(providers: ProviderStatus[]): Record<ApiCoachProvider, ProviderStatus> {
  return Object.fromEntries(providers.map((provider) => [provider.id, provider])) as Record<ApiCoachProvider, ProviderStatus>;
}

function providerHint(status?: ProviderStatus, oauthConfigured: boolean | null = null): string {
  if (!status) return 'Checking runtime configuration';
  if (oauthConfigured === false) return 'OAuth is not configured in this environment';
  if (status.id === 'xai-oauth' && status.status === 'missing') return 'Connect your subscription below';
  if (status.status === 'missing') return 'Not configured in this environment';
  if (status.status === 'configured') return 'Configured · ready for a live check';
  if (status.status === 'connected') return `Connected${status.latencyMs ? ` in ${status.latencyMs} ms` : ''}`;
  const labels: Record<Exclude<ProviderCheckStatus, 'missing' | 'configured' | 'connected'>, string> = {
    invalid_credentials: 'Could not authenticate',
    model_unavailable: 'Model is unavailable to this account',
    rate_limited: 'Provider rate limit reached',
    timeout: 'Provider timed out',
    provider_error: 'Provider request failed',
    oauth_access_refused: 'Your xAI subscription tier was refused for OAuth API access',
  };
  return labels[status.status];
}

function OAuthConnectRow({ state, device, onStart, onDisconnect, disabled }: { state: OAuthState; device: OAuthDevice | null; onStart: () => Promise<void>; onDisconnect: () => Promise<void>; disabled: boolean }) {
  let content: React.ReactNode;
  if (state === 'not-configured') {
    content = <p className="oauth-message">Subscription connection is not enabled in this environment.</p>;
  } else if (state === 'connected') {
    content = <div className="oauth-actions"><span>Connected.</span><button type="button" className="quiet" disabled={disabled} onClick={() => void onDisconnect()}>Disconnect</button></div>;
  } else if (state === 'waiting' && device) {
    content = <div className="oauth-device"><code>{device.userCode}</code><a className="quiet" href={device.verificationUri} target="_blank" rel="noreferrer">Open accounts.x.ai</a><p aria-live="polite">Waiting for approval. This code expires in about {Math.max(1, Math.ceil(device.expiresIn / 60))} minutes.</p></div>;
  } else if (state === 'expired' || state === 'denied' || state === 'error') {
    const message = state === 'expired'
      ? 'That code expired before xAI approved it.'
      : state === 'denied'
        ? 'xAI declined that connection request.'
        : 'The connection could not be completed.';
    content = <div className="oauth-actions"><span>{message}</span><button type="button" className="quiet" disabled={disabled} onClick={() => void onStart()}>Start again</button></div>;
  } else {
    content = <button type="button" className="quiet" disabled={disabled || state === 'loading' || state === 'starting'} onClick={() => void onStart()}>{state === 'starting' ? 'Starting the connection' : 'Connect your Grok subscription'}</button>;
  }

  return <div className="oauth-connect-row"><div>{content}</div><p className="oauth-honesty">Uses the Grok CLI&apos;s public client. Tiers outside xAI&apos;s allowlist may be refused.</p></div>;
}

function ProviderOption({ id, checked, disabled = false, onChange, label, detail, hint, status }: { id: CoachProviderId; checked: boolean; disabled?: boolean; onChange: (provider: CoachProviderId) => void; label: string; detail: string; hint?: string; status?: ProviderCheckStatus }) {
  return <label className={`provider-option ${disabled ? 'disabled' : ''}`}><input type="radio" name="coach-provider" value={id} checked={checked} disabled={disabled} onChange={() => onChange(id)} /><span className="provider-copy"><span><strong>{label}</strong> — {detail}</span>{hint && <small className={status ? `provider-status ${status}` : ''}>{hint}</small>}</span></label>;
}
