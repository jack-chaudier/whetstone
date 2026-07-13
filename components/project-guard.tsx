'use client';

import { Fragment, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/components/app-provider';

export function ProjectGuard({ children }: { children: React.ReactNode }) {
  const { ready, project } = useApp();
  const router = useRouter();
  useEffect(() => { if (ready && !project) router.replace('/onboarding'); }, [ready, project, router]);
  if (!ready || !project) return <main className="page"><p className="display" style={{ fontSize: 24 }}>Finding the live edge.</p></main>;
  return <Fragment key={project.id}>{children}</Fragment>;
}
