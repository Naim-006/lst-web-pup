import Link from 'next/link';

const features = [
  {
    title: 'Lesson Diary & Scheduling',
    description: 'Plan your diary, schedule lessons, and keep every appointment organised in one simple view.',
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
      </svg>
    ),
  },
  {
    title: 'Pupil Progress Tracking',
    description: 'Invite pupils by link, record their progress, and keep reports where they matter most.',
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
  },
  {
    title: 'Payments & Billing',
    description: 'Handle lesson payments and billing simply, without the paperwork piling up.',
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    title: 'Notes & Reminders',
    description: 'Keep notes on every lesson and never miss an appointment again.',
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.35 3.836c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m8.9-4.414c.376.023.75.05 1.124.08 1.131.094 1.976 1.057 1.976 2.192V16.5A2.25 2.25 0 0118 18.75h-2.25m-7.5-10.5H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V18.75m-7.5-10.5h6.375c.621 0 1.125.504 1.125 1.125v9.375m-8.25-3l1.5 1.5 3-3.75" />
      </svg>
    ),
  },
  {
    title: 'Reports & Insights',
    description: 'Understand your week at a glance with clean summaries of lessons and activity.',
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
  },
  {
    title: 'Pupil Self-Service',
    description: 'Pupils receive an invite link to register, view their status, and stay up to date.',
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM3 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 019.374 21c-2.331 0-4.512-.645-6.374-1.766z" />
      </svg>
    ),
  },
];

const steps = [
  {
    step: '01',
    title: 'Your instructor sends an invite',
    description: "If you're a pupil, simply wait for your driving instructor to send you an invite link.",
  },
  {
    step: '02',
    title: 'Open the link & register',
    description: 'Open the invite link, fill in your details, and submit your registration.',
  },
  {
    step: '03',
    title: 'Instructor approves & lessons begin',
    description: 'Once approved, start tracking your lessons through the Lesson Tracker Pro app.',
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[var(--bg)] flex flex-col font-sans">
      {/* ─── Header ──────────────────────────── */}
      <header className="sticky top-0 z-50 bg-[var(--surface)]/90 backdrop-blur-md border-b border-[var(--border)]">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-sunset-500 to-sunset-700 rounded-xl flex items-center justify-center shadow-md">
              <span className="text-white font-bold">L</span>
            </div>
            <div className="leading-tight">
              <p className="font-bold text-[var(--text-primary)] text-sm leading-none">Lesson Tracker</p>
              <p className="text-[11px] text-[var(--text-muted)] leading-none mt-0.5">Pro</p>
            </div>
          </Link>
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-[var(--text-secondary)]">
            <a href="#features" className="hover:text-[var(--sunset)] transition-colors">Features</a>
            <a href="#how-it-works" className="hover:text-[var(--sunset)] transition-colors">How it works</a>
            <Link href="/help" className="hover:text-[var(--sunset)] transition-colors">Help</Link>
            <Link href="/contact" className="btn-primary px-5 py-2.5 text-sm">Contact</Link>
          </nav>
        </div>
      </header>

      {/* ─── Hero Section ────────────────────── */}
      <section className="relative overflow-hidden bg-[var(--surface)] border-b border-[var(--border)] pt-20 pb-24 md:pt-28 md:pb-32">
        <div className="absolute top-0 right-1/4 w-[400px] h-[400px] bg-[var(--sunset)] opacity-10 rounded-full blur-[100px] -z-10" />
        <div className="absolute -bottom-20 left-1/4 w-[300px] h-[300px] bg-[#e05a0c] opacity-10 rounded-full blur-[120px] -z-10" />

        <div className="max-w-4xl mx-auto px-6 text-center animate-fade-in-up">
          <div className="inline-flex items-center justify-center p-[2px] rounded-full bg-gradient-to-r from-[var(--sunset)] to-[#e05a0c] mb-8 shadow-[var(--shadow-sunset)] animate-scale-in">
            <div className="bg-white px-5 py-2 rounded-full text-sm font-bold text-[var(--sunset)] tracking-wide">
              LESSON TRACKER PRO
            </div>
          </div>

          <h1 className="text-5xl md:text-6xl font-black text-[var(--text-primary)] tracking-tight leading-[1.1] mb-6">
            Run your driving business from{' '}
            <span className="bg-gradient-to-br from-[var(--sunset)] to-[#e05a0c] bg-clip-text text-transparent">
              one simple app
            </span>
          </h1>

          <p className="text-lg md:text-xl text-[var(--text-secondary)] max-w-2xl mx-auto mb-10 leading-relaxed">
            Lesson Tracker Pro helps driving instructors manage their diary, track pupil progress, handle payments, and stay organised — entirely from their phone.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-fade-in-up animate-delay-100">
            <Link href="/contact" className="btn-primary px-8 py-3.5 text-lg w-full sm:w-auto">Get in Touch</Link>
            <a href="https://lessontrackerpro.vercel.app/confirm?code=50fc1131-d273-4cd3-a527-8b97390ba103" className="btn-secondary px-8 py-3.5 text-lg w-full sm:w-auto">Explore the App</a>
          </div>
        </div>
      </section>

      {/* ─── Features ────────────────────────── */}
      <section id="features" className="py-20 bg-[var(--surface-2)]">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold text-[var(--text-primary)]">Everything you need. Nothing you don't.</h2>
            <p className="text-[var(--text-secondary)] mt-3 max-w-2xl mx-auto">
              Built for driving instructors, with the tools that matter most for running a smooth and professional driving school.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature) => (
              <div key={feature.title} className="surface-card p-7 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_40px_rgba(243,117,31,0.10)]">
                <div className="w-12 h-12 bg-[var(--sunset-light)] rounded-xl flex items-center justify-center text-[var(--sunset)] mb-5">
                  {feature.icon}
                </div>
                <h3 className="text-lg font-bold text-[var(--text-primary)] mb-2">{feature.title}</h3>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── How It Works ────────────────────── */}
      <section id="how-it-works" className="py-20 bg-[var(--surface)] border-y border-[var(--border)]">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold text-[var(--text-primary)]">How it works</h2>
            <p className="text-[var(--text-secondary)] mt-3">Getting started with Lesson Tracker Pro is simple.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {steps.map((s) => (
              <div key={s.step} className="relative text-center">
                <div className="mx-auto w-14 h-14 bg-gradient-to-br from-sunset-500 to-sunset-700 rounded-2xl flex items-center justify-center text-white font-black text-lg shadow-[var(--shadow-sunset)] mb-5">
                  {s.step}
                </div>
                <h3 className="text-lg font-bold text-[var(--text-primary)] mb-2">{s.title}</h3>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{s.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA ─────────────────────────────── */}
      <section className="py-20 bg-[var(--surface-2)] text-center">
        <div className="max-w-2xl mx-auto px-6">
          <h2 className="text-3xl md:text-4xl font-bold text-[var(--text-primary)] mb-5">Questions? We're here to help.</h2>
          <p className="text-[var(--text-secondary)] mb-8">
            Whether you're an instructor or a pupil, reach out to us and we'll get back to you as soon as possible.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/contact" className="btn-primary px-8 py-3.5 text-lg w-full sm:w-auto">Contact Us</Link>
            <Link href="/help" className="btn-secondary px-8 py-3.5 text-lg w-full sm:w-auto">Visit Help Centre</Link>
          </div>
        </div>
      </section>

      {/* ─── Footer ──────────────────────────── */}
      <footer className="mt-auto py-12 bg-[var(--surface)] border-t border-[var(--border)]">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-sunset-500 to-sunset-700 rounded-xl flex items-center justify-center">
              <span className="text-white font-bold">L</span>
            </div>
            <div className="text-sm text-[var(--text-muted)]">
              <p className="font-semibold text-[var(--text-primary)]">Lesson Tracker Pro</p>
              <p>&copy; {new Date().getFullYear()}. All rights reserved.</p>
            </div>
          </div>
          <nav className="flex items-center gap-6 text-sm text-[var(--text-secondary)]">
            <Link href="/" className="hover:text-[var(--sunset)] transition-colors">Home</Link>
            <Link href="/help" className="hover:text-[var(--sunset)] transition-colors">Help</Link>
            <Link href="/contact" className="hover:text-[var(--sunset)] transition-colors">Contact</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
