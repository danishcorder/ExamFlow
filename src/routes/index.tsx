import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Building2,
  Check,
  ClipboardCheck,
  Eye,
  FileText,
  Lock,
  Menu,
  ShieldCheck,
  Sparkles,
  Timer,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Brand } from "@/components/app/brand";
import { SampleBadge } from "@/components/app/states";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ExamFlow — Examination platform for institutions" },
      { name: "description", content: "Run MCQ and descriptive exams, grade faster and proctor with confidence. Built for schools, colleges and universities." },
      { property: "og:title", content: "ExamFlow — Secure online examinations" },
      { property: "og:description", content: "Exams, grading and proctoring in one platform for institutions." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const features = [
  { icon: FileText, title: "MCQ & descriptive exams", body: "Build balanced assessments with timed sections and randomized question order." },
  { icon: ClipboardCheck, title: "Clear, consistent grading", body: "Score objective questions automatically and review written work with confidence." },
  { icon: Eye, title: "Proctoring & review", body: "Give invigilators a focused view of live sessions and a clear incident trail." },
  { icon: Lock, title: "Private by institution", body: "Keep each institution’s records within its own database access boundary." },
  { icon: Timer, title: "Reliable exam windows", body: "Validate availability, timing and submissions on the server." },
  { icon: ShieldCheck, title: "The right access for every role", body: "Give administrators, teachers, students and invigilators the workspace they need." },
];

const roles = [
  { key: "admin", label: "Institution Admin", points: ["Organise departments, teachers and students", "Coordinate exam windows across the term", "Review participation and institutional activity"] },
  { key: "teacher", label: "Teacher", points: ["Author exams from reusable question banks", "Grade descriptive responses with care", "Publish results when review is complete"] },
  { key: "student", label: "Student", points: ["See assigned exams and availability", "Complete a focused, timed exam session", "Review published results and feedback"] },
  { key: "invigilator", label: "Invigilator", points: ["Review active session status", "Document incidents with context", "Hand off a clear review trail"] },
];

const plans = [
  { name: "Starter", price: "$49", note: "per month", desc: "For a single school or training centre.", items: ["Up to 300 students", "MCQ & descriptive exams", "Email support"] },
  { name: "Institution", price: "$199", note: "per month", desc: "For colleges running exams every term.", items: ["Up to 3,000 students", "Proctoring & invigilator console", "Rubric grading", "Priority support"], featured: true },
  { name: "University", price: "Custom", note: "annual contract", desc: "For multi-campus universities.", items: ["Unlimited students", "Multiple campuses", "SSO & audit exports", "Dedicated success manager"] },
];

function Landing() {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);

  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      <div className="portal-ribbon">
        <div className="mx-auto flex min-h-9 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <p className="flex items-center gap-2"><Building2 className="h-3.5 w-3.5 text-gold" /><span>Assessment, thoughtfully managed</span></p>
          <div className="hidden items-center gap-5 sm:flex"><a href="#security">Trust & security</a><Link to="/auth/login">Student / teacher login</Link></div>
          <Link className="sm:hidden" to="/auth/login">Sign in</Link>
        </div>
      </div>

      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/95 backdrop-blur-xl">
        <div className="mx-auto flex h-[76px] max-w-7xl items-center gap-6 px-4 sm:px-6">
          <Brand />
          <nav aria-label="Main navigation" className="hidden flex-1 items-center justify-center gap-7 text-sm font-semibold text-muted-foreground lg:flex">
            <a className="portal-nav-link" href="#features">Platform</a>
            <a className="portal-nav-link" href="#roles">Who it’s for</a>
            <a className="portal-nav-link" href="#exam-types">Exam types</a>
            <a className="portal-nav-link" href="#security">Security</a>
            <a className="portal-nav-link" href="#pricing">Plans</a>
          </nav>
          <div className="ml-auto hidden items-center gap-3 lg:flex">
            <Button asChild variant="outline" className="border-navy/20 bg-transparent px-5 hover:border-navy hover:bg-navy/5"><Link to="/auth/login">Log in</Link></Button>
            <Button asChild className="px-5 shadow-elegant"><Link to="/auth/register">Get started <ArrowUpRight className="h-4 w-4" /></Link></Button>
          </div>
          <button type="button" onClick={() => setMenuOpen((open) => !open)} aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"} aria-expanded={menuOpen} aria-controls="mobile-navigation" className="ml-auto inline-flex h-10 w-10 items-center justify-center rounded-xl border bg-card text-foreground lg:hidden">
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        {menuOpen && <nav id="mobile-navigation" aria-label="Mobile navigation" className="border-t bg-background px-4 py-4 lg:hidden"><div className="mx-auto grid max-w-7xl gap-1">
          {[["Platform", "#features"], ["Who it’s for", "#roles"], ["Exam types", "#exam-types"], ["Security", "#security"], ["Plans", "#pricing"]].map(([label, href]) => <a key={href} href={href} onClick={closeMenu} className="rounded-lg px-3 py-3 text-sm font-semibold hover:bg-muted">{label}</a>)}
          <div className="mt-2 grid grid-cols-2 gap-2 border-t pt-4"><Button asChild variant="outline"><Link to="/auth/login" onClick={closeMenu}>Log in</Link></Button><Button asChild><Link to="/auth/register" onClick={closeMenu}>Get started</Link></Button></div>
        </div></nav>}
      </header>

      <main>
        <section className="exam-hero">
          <div className="mx-auto grid max-w-7xl items-center gap-14 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[1.03fr_.97fr] lg:gap-10 lg:py-24 xl:py-28">
            <div className="relative z-10">
              <span className="hero-kicker"><Sparkles className="h-4 w-4" /> A complete examination workspace</span>
              <h1 className="mt-7 max-w-3xl font-display text-[clamp(3rem,6.2vw,5.4rem)] font-medium leading-[.99] tracking-[-.045em] text-white">Run exams with <span className="text-gold">integrity</span> and confidence.</h1>
              <p className="mt-6 max-w-xl text-base leading-8 text-white/70 sm:text-lg">From question authoring to published results, bring your institution’s examination workflow into one secure, considered space.</p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg" className="h-12 bg-gold px-6 text-navy hover:bg-gold-light"><Link to="/auth/register">Get started free <ArrowRight className="h-4 w-4" /></Link></Button>
                <Button asChild size="lg" variant="outline" className="h-12 border-white/35 bg-white/5 px-6 text-white hover:bg-white/10 hover:text-white"><a href="#features">Explore the platform</a></Button>
              </div>
              <div className="mt-9 flex flex-wrap gap-x-6 gap-y-3 text-xs font-medium text-white/65 sm:text-sm">
                {["Built for institutions", "Role-aware workspaces", "Database-level isolation"].map((item) => <span key={item} className="flex items-center gap-2"><Check className="h-4 w-4 text-gold" />{item}</span>)}
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-[620px] lg:ml-auto">
              <div className="exam-preview-glow" />
              <div className="exam-preview-window">
                <div className="flex items-center justify-between border-b border-border/80 bg-paper-muted px-4 py-3.5 sm:px-5">
                  <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-control-muted" /><span className="h-2.5 w-2.5 rounded-full bg-control-muted" /><span className="h-2.5 w-2.5 rounded-full bg-control-muted" /><span className="ml-3 rounded-md border bg-white px-3 py-1 text-[11px] text-muted-foreground">Candidate view</span></div>
                  <span className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Secure session</span>
                </div>
                <div className="p-5 sm:p-7">
                  <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[.15em] text-muted-foreground">Physics · Mid-term</p><h2 className="mt-2 text-lg font-bold tracking-tight text-navy sm:text-xl">Question 04 <span className="font-medium text-muted-foreground">/ 20</span></h2></div><div className="rounded-lg bg-gold/15 px-3 py-2 text-right"><p className="text-[10px] font-semibold uppercase tracking-wide text-navy/65">Time left</p><p className="font-mono text-sm font-bold text-navy">42:18</p></div></div>
                  <div className="mt-6 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full w-[20%] rounded-full bg-gold-dark" /></div>
                  <p className="mt-7 text-sm font-semibold leading-6 text-foreground sm:text-base">Which quantity is a vector?</p>
                  <div className="mt-4 space-y-2.5">
                    {["Speed", "Velocity", "Distance", "Energy"].map((answer) => <div key={answer} className={`flex items-center gap-3 rounded-xl border px-3.5 py-3 text-sm transition-colors sm:px-4 ${answer === "Velocity" ? "border-navy bg-paper-selected text-navy ring-1 ring-navy/10" : "border-paper-border bg-white text-foreground"}`}><span className={`flex h-4 w-4 items-center justify-center rounded-full border ${answer === "Velocity" ? "border-navy" : "border-muted-foreground/40"}`}>{answer === "Velocity" && <span className="h-2 w-2 rounded-full bg-navy" />}</span>{answer}</div>)}
                  </div>
                  <div className="mt-6 flex items-center justify-between border-t pt-4"><p className="text-xs text-muted-foreground">Saved just now</p><span className="rounded-lg bg-navy px-4 py-2 text-xs font-semibold text-white">Next question <ArrowRight className="ml-1 inline h-3.5 w-3.5" /></span></div>
                </div>
              </div>
              <div className="exam-insight-card"><p className="text-xs font-medium text-muted-foreground">Participation</p><p className="mt-1 text-2xl font-bold tracking-tight text-navy">94<span className="text-base">%</span></p><div className="mt-3 flex h-7 items-end gap-1">{[10, 15, 12, 20, 17, 25, 21, 29].map((height, index) => <span key={index} className="w-2 rounded-t-sm bg-navy" style={{ height }} />)}</div></div>
              <div className="mt-4 flex justify-end"><SampleBadge className="border-white/20 bg-white/10 text-white/85 [&_svg]:text-gold" /></div>
            </div>
          </div>
          <div className="hero-bottom-rule" />
        </section>

        <section className="border-b bg-paper">
          <div className="mx-auto grid max-w-7xl gap-5 px-4 py-7 sm:grid-cols-3 sm:px-6 lg:gap-10">
            {[[BookOpen, "Author with structure", "Reusable question banks and exam versions"], [Users, "Coordinate with clarity", "Purpose-built spaces for every role"], [ShieldCheck, "Protect the process", "Server-validated access and submissions"]].map(([I, title, body]) => { const Icon = I as typeof BookOpen; return <div key={title as string} className="flex items-start gap-3 sm:justify-center"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gold/15 text-gold-dark"><Icon className="h-5 w-5" /></span><div><p className="text-sm font-bold text-navy">{title as string}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{body as string}</p></div></div>; })}
          </div>
        </section>

        <section id="features" className="scroll-mt-24 mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:py-24">
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between"><div className="max-w-2xl"><p className="section-eyebrow">One connected platform</p><h2 className="mt-3 font-display text-3xl font-medium leading-tight tracking-tight text-navy sm:text-4xl lg:text-[2.8rem]">Everything your examination office needs.</h2></div><p className="max-w-md text-sm leading-6 text-muted-foreground">Bring the full assessment lifecycle together, from academic setup and question banks to grading and review.</p></div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{features.map((f, index) => <article key={f.title} className="feature-card"><span className="feature-icon"><f.icon className="h-5 w-5" /></span><span className="feature-index">0{index + 1}</span><h3 className="mt-6 text-base font-bold tracking-tight text-navy">{f.title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{f.body}</p></article>)}</div>
        </section>

        <section id="exam-types" className="scroll-mt-24 border-y bg-paper-muted">
          <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:py-24">
            <div className="max-w-xl"><p className="section-eyebrow">Flexible assessment</p><h2 className="mt-3 font-display text-3xl font-medium leading-tight tracking-tight text-navy sm:text-4xl">Designed for the way your institution examines.</h2><p className="mt-4 text-sm leading-7 text-muted-foreground">Build assessments from your existing academic structure. Combine question formats, organise sections, and keep a versioned record when an exam is published.</p><a className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-navy hover:text-gold-dark" href="#roles">Explore role workspaces <ArrowRight className="h-4 w-4" /></a></div>
            <div className="grid gap-4 sm:grid-cols-2"><div className="exam-type-card"><span className="exam-type-number">01</span><FileText className="mt-6 h-6 w-6 text-gold-dark" /><h3 className="mt-4 font-bold text-navy">Objective questions</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">Create single or multiple choice questions with protected answer keys.</p></div><div className="exam-type-card sm:translate-y-8"><span className="exam-type-number">02</span><BookOpen className="mt-6 h-6 w-6 text-gold-dark" /><h3 className="mt-4 font-bold text-navy">Written responses</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">Collect descriptive responses and support teacher-led review.</p></div></div>
          </div>
        </section>

        <section id="roles" className="scroll-mt-24 mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:py-24">
          <div className="max-w-2xl"><p className="section-eyebrow">Built for every role</p><h2 className="mt-3 font-display text-3xl font-medium tracking-tight text-navy sm:text-4xl">One institution. The right view for everyone.</h2></div>
          <Tabs defaultValue="admin" className="mt-9"><TabsList className="flex h-auto flex-wrap justify-start gap-1 rounded-xl border bg-paper-muted p-1.5">{roles.map((r) => <TabsTrigger key={r.key} value={r.key} className="rounded-lg px-4 py-2.5">{r.label}</TabsTrigger>)}</TabsList>{roles.map((r) => <TabsContent key={r.key} value={r.key} className="mt-5"><div className="rounded-2xl border bg-card p-5 sm:p-8"><div className="mb-5 flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold/15 text-gold-dark"><Users className="h-5 w-5" /></span><div><h3 className="font-bold text-navy">{r.label} workspace</h3><p className="text-xs text-muted-foreground">Role-aware tools for the examination lifecycle</p></div></div><ul className="grid gap-3 sm:grid-cols-3">{r.points.map((p) => <li key={p} className="flex gap-3 rounded-xl bg-paper p-4 text-sm leading-6"><Check className="mt-0.5 h-4 w-4 shrink-0 text-gold-dark" />{p}</li>)}</ul></div></TabsContent>)}</Tabs>
        </section>

        <section id="security" className="scroll-mt-24 security-band">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[.9fr_1.1fr] lg:items-center lg:py-20">
            <div><p className="section-eyebrow text-gold">Trust is part of the product</p><h2 className="mt-3 font-display text-3xl font-medium tracking-tight text-white sm:text-4xl">Security built into every step.</h2><p className="mt-4 max-w-xl text-sm leading-7 text-white/65">Exam integrity depends on clear permissions and reliable records. ExamFlow checks access on the server and uses PostgreSQL row-level security to separate institution data.</p><Button asChild className="mt-6 bg-gold text-navy hover:bg-gold-light"><Link to="/auth/register">Create your workspace <ArrowRight className="h-4 w-4" /></Link></Button></div>
            <div className="grid gap-4 sm:grid-cols-2">{[[Building2, "Institution boundaries", "Database policies scope records to verified memberships."], [ShieldCheck, "Verified permissions", "Server functions check roles before protected actions."], [Lock, "Protected answer keys", "Published exam snapshots separate candidate content from scoring keys."], [ClipboardCheck, "Traceable review", "Keep membership, grading and invigilation work organised."]].map(([I, title, body]) => { const Icon = I as typeof Building2; return <div key={title as string} className="security-card"><Icon className="h-5 w-5 text-gold" /><h3 className="mt-4 text-sm font-bold text-white">{title as string}</h3><p className="mt-2 text-xs leading-5 text-white/60">{body as string}</p></div>; })}</div>
          </div>
        </section>

        <section id="pricing" className="scroll-mt-24 mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:py-24">
          <div className="mx-auto max-w-2xl text-center"><p className="section-eyebrow">Plans that can scale</p><h2 className="mt-3 font-display text-3xl font-medium tracking-tight text-navy sm:text-4xl">Room to grow with your institution.</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">Indicative pricing only. Subscriptions are not available for purchase in this version.</p></div>
          <div className="mt-10 grid gap-5 lg:grid-cols-3">{plans.map((p) => <article key={p.name} className={`plan-card ${p.featured ? "plan-card-featured" : ""}`}><div className="flex items-start justify-between gap-4"><div><h3 className="font-bold">{p.name}</h3><p className={`mt-1 text-xs leading-5 ${p.featured ? "text-white/65" : "text-muted-foreground"}`}>{p.desc}</p></div>{p.featured && <span className="rounded-full bg-gold/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-gold">Popular</span>}</div><p className="mt-7"><span className="text-4xl font-bold tracking-tight">{p.price}</span><span className={`ml-2 text-xs ${p.featured ? "text-white/60" : "text-muted-foreground"}`}>{p.note}</span></p><ul className="mt-6 flex-1 space-y-3 text-sm">{p.items.map((i) => <li key={i} className="flex gap-2.5"><Check className="h-4 w-4 shrink-0 text-gold-dark" />{i}</li>)}</ul><Button asChild className="mt-8 w-full" variant={p.featured ? "secondary" : "outline"}><Link to="/auth/register">Get started</Link></Button></article>)}</div>
        </section>

        <section className="closing-banner"><div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-7 px-4 py-12 sm:px-6 md:flex-row md:items-center lg:py-14"><div><p className="section-eyebrow text-gold">The next exam starts here</p><h2 className="mt-2 max-w-2xl font-display text-3xl font-medium tracking-tight text-white sm:text-4xl">Make every assessment feel more considered.</h2><p className="mt-3 text-sm text-white/65">Bring your institution’s team together in ExamFlow.</p></div><div className="flex shrink-0 flex-wrap gap-3"><Button asChild size="lg" className="bg-gold px-6 text-navy hover:bg-gold-light"><Link to="/auth/register">Get started <ArrowRight className="h-4 w-4" /></Link></Button><Button asChild size="lg" variant="outline" className="border-white/30 bg-white/5 text-white hover:bg-white/10 hover:text-white"><Link to="/auth/login">Log in</Link></Button></div></div></section>
      </main>

      <footer className="portal-footer"><div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr]"><div><Brand inverted /><p className="mt-4 max-w-xs text-sm leading-6 text-white/55">A secure examination workspace for schools, colleges and universities.</p></div><div><p className="footer-heading">Platform</p><a href="#features">Features</a><a href="#exam-types">Exam types</a><a href="#security">Security</a></div><div><p className="footer-heading">Institution</p><a href="#roles">Who it’s for</a><a href="#pricing">Plans</a><Link to="/auth/register">Get started</Link></div><div><p className="footer-heading">Account</p><Link to="/auth/login">Log in</Link><Link to="/auth/register">Create account</Link><a href="#security">Trust & security</a></div><div className="border-t border-white/10 pt-5 text-xs text-white/45 md:col-span-4 md:flex md:items-center md:justify-between md:pt-6"><span>© {new Date().getFullYear()} ExamFlow. All rights reserved.</span><span>Designed for secure assessment.</span></div></div></footer>
    </div>
  );
}
