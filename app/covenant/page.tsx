'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { useApp } from '@/components/app-provider';
import { useModalDialog } from '@/components/use-modal-dialog';
import * as repo from '@/lib/store/repo';
import { COACH_MODELS } from '@/lib/coach/models';
import type { ApiCoachProvider, CoachProviderId, Covenant } from '@/lib/types';

type EditKey = 'ambition' | 'why' | 'milestone' | 'ownership' | 'schedule' | 'tone' | null;
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
const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function CovenantPage() { return <AppShell><CovenantGate /></AppShell>; }

function CovenantGate() {
  const { project } = useApp();
  if (!project) return null;
  return <CovenantContent project={project} />;
}

function CovenantContent({ project }: { project: NonNullable<ReturnType<typeof useApp>['project']> }) {
  const { state, revise, clear, setCoachProvider } = useApp();
  const router = useRouter();
  const [draft, setDraft] = useState<Covenant>(project.covenant);
  const [editing, setEditing] = useState<EditKey>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [providerStatus, setProviderStatus] = useState<Record<ApiCoachProvider, ProviderStatus> | null>(null);
  const [checkingProviders, setCheckingProviders] = useState(false);
  const [providerCheckError, setProviderCheckError] = useState(false);
  const [oauthConfigured, setOauthConfigured] = useState<boolean | null>(null);
  const [oauthState, setOauthState] = useState<OAuthState>('loading');
  const [oauthDevice, setOauthDevice] = useState<OAuthDevice | null>(null);
  const [pollAttempt, setPollAttempt] = useState(0);
  const deleteTriggerRef = useRef<HTMLButtonElement>(null);
  const cancelDelete = useCallback(() => setConfirmDelete(false), []);
  const deleteDialogRef = useModalDialog(confirmDelete, cancelDelete, deleteTriggerRef);

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
      .catch(() => { if (active) { setProviderCheckError(true); setOauthState('error'); } });
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
  }, [oauthDevice, oauthState, pollAttempt]);

  function save() { revise(draft); setEditing(null); }
  function update<K extends keyof Covenant>(key: K, value: Covenant[K]) { setDraft((current) => ({ ...current, [key]: value })); }
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
      if (state.coachProvider === 'xai-oauth') setCoachProvider('scripted');
    } catch {
      setOauthState('error');
    }
  }

  return <main className="page covenant-page">
    <header className="covenant-header enter"><p className="eyebrow">The agreement beneath the plan</p><h1 className="display">Your covenant</h1><p>It can change. It should not become vague.</p></header>
    <article className="surface covenant-document enter">
      <CovenantSection label="The ambition" editing={editing === 'ambition'} onEdit={() => setEditing('ambition')} onSave={save}>{editing === 'ambition' ? <textarea className="field document-input" rows={2} value={draft.ambition} onChange={(event) => update('ambition', event.target.value)} /> : <h2 className="display">{draft.ambition}</h2>}</CovenantSection>
      <CovenantSection label="Why it matters" editing={editing === 'why'} onEdit={() => setEditing('why')} onSave={save}>{editing === 'why' ? <textarea className="field document-input" rows={3} value={draft.why} onChange={(event) => update('why', event.target.value)} /> : <p className="document-prose">{draft.why}</p>}</CovenantSection>
      <CovenantSection label="The near horizon" editing={editing === 'milestone'} onEdit={() => setEditing('milestone')} onSave={save}>{editing === 'milestone' ? <textarea className="field document-input" rows={2} value={draft.milestone} onChange={(event) => update('milestone', event.target.value)} /> : <p className="document-prose">For now, you are here to {draft.milestone}.</p>}</CovenantSection>
      <CovenantSection label="Authorship" editing={editing === 'ownership'} onEdit={() => setEditing('ownership')} onSave={save}>{editing === 'ownership' ? <div className="document-fields"><label><span>Human-owned</span><input className="field" value={draft.humanOwned.join(', ')} onChange={(event) => update('humanOwned', split(event.target.value))} /></label><label><span>Delegable</span><input className="field" value={draft.delegable.join(', ')} onChange={(event) => update('delegable', split(event.target.value))} /></label></div> : <div className="ownership-grid"><div><h3>Remains yours</h3><ul>{draft.humanOwned.map((item) => <li key={item}>{item}</li>)}</ul></div><div><h3>May be delegated</h3><ul>{draft.delegable.map((item) => <li key={item}>{item}</li>)}</ul></div></div>}</CovenantSection>
      <CovenantSection label="The honest schedule" editing={editing === 'schedule'} onEdit={() => setEditing('schedule')} onSave={save}>{editing === 'schedule' ? <div className="document-fields schedule-edit"><label><span>Days, 0–6</span><input className="field" value={draft.schedule.days.join(', ')} onChange={(event) => update('schedule', { ...draft.schedule, days: event.target.value.split(',').map(Number).filter((day) => day >= 0 && day <= 6) })} /></label><label><span>Window</span><select className="field" value={draft.schedule.window} onChange={(event) => update('schedule', { ...draft.schedule, window: event.target.value })}><option>morning</option><option>afternoon</option><option>evening</option></select></label><label><span>Minutes</span><input className="field" type="number" min={10} max={180} value={draft.schedule.minutes} onChange={(event) => update('schedule', { ...draft.schedule, minutes: Number(event.target.value) })} /></label></div> : <p className="document-prose">{draft.schedule.days.map((day) => dayNames[day]).join(', ')}, in the {draft.schedule.window}, for about {draft.schedule.minutes} minutes.</p>}</CovenantSection>
      <CovenantSection label="The coach" editing={editing === 'tone'} onEdit={() => setEditing('tone')} onSave={save}>{editing === 'tone' ? <select className="field" value={draft.tone} onChange={(event) => update('tone', event.target.value as Covenant['tone'])}><option>warm</option><option>dry</option><option>firm</option></select> : <p className="document-prose">Speak with a {draft.tone} voice. Defend the covenant without turning it into a punishment.</p>}</CovenantSection>
      <footer className="covenant-signature"><span className="display">Revised covenants are honest covenants.</span><time dateTime={draft.createdAt}>Made {new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(draft.createdAt))}</time></footer>
    </article>
    <section className="coach-voice" aria-labelledby="coach-voice-title">
      <div><p className="eyebrow">THE COACH&apos;S VOICE</p><h2 id="coach-voice-title" className="display">The steward&apos;s judgment. Different minds, same covenant.</h2></div>
      <fieldset className="provider-list"><legend className="sr-only">Coach provider</legend>
        <ProviderOption id="scripted" checked={state.coachProvider === 'scripted'} onChange={setCoachProvider} label="Tenzon scripted" detail="offline, always available" />
        {COACH_MODELS.map((model) => { const status = providerStatus?.[model.id]; return <ProviderOption key={model.id} id={model.id} checked={state.coachProvider === model.id} disabled={!status?.configured} onChange={setCoachProvider} label={model.label} detail={model.id === 'xai-oauth' ? 'your xAI subscription' : `${model.vendor} · ${model.model}`} hint={providerHint(status, model.id === 'xai-oauth' ? oauthConfigured : null)} status={status?.status} />; })}
      </fieldset>
      <OAuthConnectRow state={oauthState} device={oauthDevice} onStart={startOAuth} onDisconnect={disconnectOAuth} />
      <div className="provider-check"><button type="button" className="button button-secondary" disabled={checkingProviders || (!providerStatus && !providerCheckError)} onClick={checkConnections}>{checkingProviders ? 'Checking connections' : providerCheckError && !providerStatus ? 'Retry connection status' : 'Check all connections'}</button><p aria-live="polite">{providerCheckError ? 'Connection status is unavailable. Try again.' : checkingProviders ? 'Sending one minimal, project-free request to each configured model.' : 'Checks are manual and never include your project content.'}</p></div>
    </section>
    <section className="data-controls" aria-labelledby="data-title"><div><h2 id="data-title" className="display">Your data</h2><p>Your project is stored in this browser. A selected hosted coach receives only the context needed for that request.</p></div><div><button className="button button-secondary" onClick={() => repo.exportState(state)}>Export JSON</button><button ref={deleteTriggerRef} className="quiet danger" onClick={() => setConfirmDelete(true)}>Delete everything</button></div></section>
    {confirmDelete && <div className="dialog-backdrop"><section ref={deleteDialogRef} tabIndex={-1} className="dialog enter" role="dialog" aria-modal="true" aria-labelledby="delete-title"><p className="eyebrow">This cannot be undone</p><h2 id="delete-title" className="display delete-title">Delete the project and every session?</h2><p className="delete-copy">Export first if any part of the work should remain. Tenzon has no remote copy.</p><div className="delete-actions"><button className="quiet" onClick={cancelDelete}>Keep the project</button><button className="button delete-button" onClick={() => { clear(); router.push('/onboarding'); }}>Delete everything</button></div></section></div>}
  </main>;
}

function split(value: string): string[] { return value.split(',').map((item) => item.trim()).filter(Boolean); }

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

function OAuthConnectRow({ state, device, onStart, onDisconnect }: { state: OAuthState; device: OAuthDevice | null; onStart: () => Promise<void>; onDisconnect: () => Promise<void> }) {
  let content: React.ReactNode;
  if (state === 'not-configured') {
    content = <p className="oauth-message">add OAUTH_COOKIE_SECRET to the environment</p>;
  } else if (state === 'connected') {
    content = <div className="oauth-actions"><span>Connected.</span><button type="button" className="quiet" onClick={() => void onDisconnect()}>Disconnect</button></div>;
  } else if (state === 'waiting' && device) {
    content = <div className="oauth-device"><code>{device.userCode}</code><a className="quiet" href={device.verificationUri} target="_blank" rel="noreferrer">Open accounts.x.ai</a><p aria-live="polite">Waiting for approval. This code expires in about {Math.max(1, Math.ceil(device.expiresIn / 60))} minutes.</p></div>;
  } else if (state === 'expired' || state === 'denied' || state === 'error') {
    const message = state === 'expired'
      ? 'That code expired before xAI approved it.'
      : state === 'denied'
        ? 'xAI declined that connection request.'
        : 'The connection could not be completed.';
    content = <div className="oauth-actions"><span>{message}</span><button type="button" className="quiet" onClick={() => void onStart()}>Start again</button></div>;
  } else {
    content = <button type="button" className="quiet" disabled={state === 'loading' || state === 'starting'} onClick={() => void onStart()}>{state === 'starting' ? 'Starting the connection' : 'Connect your Grok subscription'}</button>;
  }

  return <div className="oauth-connect-row">
    <div>{content}</div>
    <p className="oauth-honesty">Uses the Grok CLI&apos;s public client. Tiers outside xAI&apos;s allowlist may be refused.</p>
  </div>;
}

function ProviderOption({ id, checked, disabled = false, onChange, label, detail, hint, status }: { id: CoachProviderId; checked: boolean; disabled?: boolean; onChange: (provider: CoachProviderId) => void; label: string; detail: string; hint?: string; status?: ProviderCheckStatus }) {
  return <label className={`provider-option ${disabled ? 'disabled' : ''}`}><input type="radio" name="coach-provider" value={id} checked={checked} disabled={disabled} onChange={() => onChange(id)} /><span className="provider-copy"><span><strong>{label}</strong> — {detail}</span>{hint && <small className={status ? `provider-status ${status}` : ''}>{hint}</small>}</span></label>;
}

function CovenantSection({ label, editing, onEdit, onSave, children }: { label: string; editing: boolean; onEdit: () => void; onSave: () => void; children: React.ReactNode }) { return <section className="document-section"><div className="document-label"><span>{label}</span><button className="quiet" onClick={editing ? onSave : onEdit}>{editing ? 'save' : 'revise'}</button></div>{children}</section>; }
