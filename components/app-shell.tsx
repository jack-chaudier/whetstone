import { Masthead } from '@/components/masthead';
import { ProjectGuard } from '@/components/project-guard';

export function AppShell({ children }: { children: React.ReactNode }) {
  return <ProjectGuard><Masthead />{children}</ProjectGuard>;
}
