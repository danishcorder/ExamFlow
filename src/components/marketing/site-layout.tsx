import { useState, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowUpRight, Building2, Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Brand } from '@/components/app/brand';

const NAV = [
  { to: '/', label: 'Home' },
  { to: '/features', label: 'Features' },
  { to: '/roles', label: 'Who it’s for' },
  { to: '/security', label: 'Security' },
  { to: '/pricing', label: 'Plans' },
] as const;

const linkBase = 'rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground';
const linkActive = 'rounded-md bg-navy/5 px-3 py-2 text-sm font-semibold text-navy';

export function MarketingLayout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      <div className="portal-ribbon">
        <div className="mx-auto flex min-h-9 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <p className="flex items-center gap-2"><Building2 className="h-3.5 w-3.5 text-gold" /><span>Assessment, thoughtfully managed</span></p>
          <div className="hidden items-center gap-5 sm:flex">
            <Link to="/demo">Explore the demo</Link>
            <Link to="/auth/login">Student / teacher login</Link>
          </div>
        </div>
      </div>
      <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <Brand />
          <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
            {NAV.map((n) => (
              <Link key={n.to} to={n.to} className={linkBase} activeProps={{ className: linkActive, 'aria-current': 'page' }}
                activeOptions={{ exact: true }}>{n.label}</Link>
            ))}
          </nav>
          <div className="hidden items-center gap-2 lg:flex">
            <Button asChild variant="outline" className="border-navy/20 bg-transparent px-5"><Link to="/auth/login">Log in</Link></Button>
            <Button asChild className="px-5 shadow-elegant"><Link to="/auth/register">Get started <ArrowUpRight className="h-4 w-4" /></Link></Button>
          </div>
          <button type="button" className="rounded-md p-2 lg:hidden" aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open} aria-controls="mobile-nav" onClick={() => setOpen((o) => !o)}>
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        {open && (
          <nav id="mobile-nav" aria-label="Mobile" className="border-t bg-background px-4 pb-4 lg:hidden">
            <div className="flex flex-col py-2">
              {NAV.map((n) => (
                <Link key={n.to} to={n.to} onClick={() => setOpen(false)} className={linkBase} activeProps={{ className: linkActive }}
                  activeOptions={{ exact: true }}>{n.label}</Link>
              ))}
              <Link to="/demo" onClick={() => setOpen(false)} className={linkBase}>Explore the demo</Link>
            </div>
            <div className="grid grid-cols-2 gap-2 border-t pt-4">
              <Button asChild variant="outline"><Link to="/auth/login" onClick={() => setOpen(false)}>Log in</Link></Button>
              <Button asChild><Link to="/auth/register" onClick={() => setOpen(false)}>Get started</Link></Button>
            </div>
          </nav>
        )}
      </header>
      <main>{children}</main>
      <footer className="portal-footer">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div><Brand inverted /><p className="mt-4 max-w-xs text-sm leading-6 text-white/55">A secure examination workspace for schools, colleges and universities.</p></div>
          <div><p className="footer-heading">Product</p><Link to="/features">Features</Link><Link to="/roles">Who it’s for</Link><Link to="/pricing">Plans</Link></div>
          <div><p className="footer-heading">Try it</p><Link to="/demo-exam">Sample ICT exam</Link><Link to="/demo">Demo workspace</Link><Link to="/security">Trust & security</Link></div>
          <div><p className="footer-heading">Account</p><Link to="/auth/login">Log in</Link><Link to="/auth/register">Create account</Link></div>
          <div className="border-t border-white/10 pt-5 text-xs text-white/45 md:col-span-4 md:flex md:items-center md:justify-between md:pt-6">
            <span>© {new Date().getFullYear()} ExamFlow. All rights reserved.</span><span>Designed for secure assessment.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export function PageIntro({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <section className="border-b bg-gradient-to-b from-navy/[0.04] to-transparent">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20">
        <p className="section-eyebrow">{eyebrow}</p>
        <h1 className="mt-3 max-w-3xl font-display text-4xl font-medium tracking-tight sm:text-5xl">{title}</h1>
        {children && <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">{children}</p>}
      </div>
    </section>
  );
}

export function CtaBand() {
  return (
    <section className="closing-banner">
      <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-7 px-4 py-12 sm:px-6 md:flex-row md:items-center lg:py-14">
        <div>
          <p className="section-eyebrow text-gold">The next exam starts here</p>
          <h2 className="mt-2 max-w-2xl font-display text-3xl font-medium tracking-tight text-white sm:text-4xl">Make every assessment feel more considered.</h2>
        </div>
        <div className="flex shrink-0 flex-wrap gap-3">
          <Button asChild size="lg" className="bg-gold px-6 text-navy hover:bg-gold-light"><Link to="/auth/register">Get started</Link></Button>
          <Button asChild size="lg" variant="outline" className="border-white/30 bg-white/5 text-white hover:bg-white/10 hover:text-white"><Link to="/demo">Explore the demo</Link></Button>
        </div>
      </div>
    </section>
  );
}
