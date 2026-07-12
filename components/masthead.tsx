'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [{ href: '/', label: 'Today' }, { href: '/progress', label: 'Progress' }, { href: '/covenant', label: 'Covenant' }];

export function Masthead() {
  const pathname = usePathname();
  return (
    <header className="masthead">
      <div className="masthead-inner">
        <Link href="/" className="wordmark" aria-label="Whetstone home">Whetstone<span className="wordmark-dot">.</span></Link>
        <nav className="nav" aria-label="Primary navigation">
          {links.map((link) => <Link key={link.href} href={link.href} aria-current={pathname === link.href ? 'page' : undefined}>{link.label}</Link>)}
        </nav>
      </div>
    </header>
  );
}
