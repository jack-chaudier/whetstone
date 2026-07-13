'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useRef, useState } from 'react';
import { useApp } from '@/components/app-provider';
import { useModalDialog } from '@/components/use-modal-dialog';
import { COACH_MODELS } from '@/lib/coach/models';
import type { CoachProviderId } from '@/lib/types';

const links = [{ href: '/', label: 'Today' }, { href: '/progress', label: 'Progress' }, { href: '/covenant', label: 'Covenant' }];

export function Masthead() {
  const pathname = usePathname();
  const { state, project, selectProject } = useApp();
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const switcherTriggerRef = useRef<HTMLButtonElement>(null);
  const closeSwitcher = useCallback(() => setSwitcherOpen(false), []);
  const switcherDialogRef = useModalDialog(switcherOpen, closeSwitcher, switcherTriggerRef);

  function chooseProject(projectId: string) {
    selectProject(projectId);
    setSwitcherOpen(false);
  }

  return (
    <header className="masthead">
      <div className="masthead-inner">
        <div className="masthead-projects">
          <Link href="/" className="wordmark" aria-label="Tenzon home">Tenzon<span className="wordmark-dot">.</span></Link>
          {project && <button ref={switcherTriggerRef} type="button" className="project-switcher-trigger" aria-haspopup="dialog" aria-expanded={switcherOpen} onClick={() => setSwitcherOpen(true)}><span>{project.covenant.ambition}</span><span aria-hidden="true">⌄</span></button>}
          <Link href="/onboarding" className="project-new">New project</Link>
        </div>
        <nav className="nav" aria-label="Primary navigation">
          {links.map((link) => <Link key={link.href} href={link.href} aria-current={pathname === link.href ? 'page' : undefined}>{link.label}</Link>)}
        </nav>
      </div>
      {switcherOpen && <div className="dialog-backdrop project-switcher-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeSwitcher(); }}><section ref={switcherDialogRef} tabIndex={-1} className="dialog project-switcher-dialog enter" role="dialog" aria-modal="true" aria-labelledby="project-switcher-title"><div className="project-switcher-heading"><div><p className="eyebrow">Projects</p><h2 id="project-switcher-title" className="display">Choose the live edge</h2></div><button type="button" className="quiet" onClick={closeSwitcher}>Close</button></div><div className="project-switcher-list">{state.projects.map((item) => <button key={item.id} type="button" aria-pressed={item.id === project?.id} className={item.id === project?.id ? 'current' : ''} onClick={() => chooseProject(item.id)}><span><strong>{item.covenant.ambition}</strong><small>{item.covenant.shape} · {providerLabel(item.coachProvider)}</small></span><span aria-hidden="true">{item.id === project?.id ? 'Current' : 'Open'}</span></button>)}</div><Link href="/onboarding" className="button button-primary project-switcher-new" onClick={closeSwitcher}>Create a new project</Link></section></div>}
    </header>
  );
}

function providerLabel(provider: CoachProviderId): string {
  if (provider === 'scripted') return 'Tenzon scripted';
  const model = COACH_MODELS.find((entry) => entry.id === provider);
  return provider === 'xai-oauth' ? 'Grok 4.5 subscription' : model?.label ?? provider;
}
