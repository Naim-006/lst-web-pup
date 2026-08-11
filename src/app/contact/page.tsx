'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function ContactPage() {
  const [form, setForm] = useState({ name: '', email: '', message: '' });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) {
      setError('Please fill in all fields.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      if (!res.ok) throw new Error('Failed to send');
      setSubmitted(true);
    } catch {
      setError('Failed to send message. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] flex flex-col">
      {/* Header */}
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
            <Link href="/" className="hover:text-[var(--sunset)] transition-colors">Home</Link>
            <Link href="/help" className="hover:text-[var(--sunset)] transition-colors">Help</Link>
            <Link href="/contact" className="hover:text-[var(--sunset)] transition-colors">Contact</Link>
          </nav>
        </div>
      </header>

      <main className="flex-1 py-16 md:py-20">
        <div className="max-w-3xl mx-auto px-6">
          <div className="text-center mb-12 animate-fade-in-up">
            <h1 className="text-4xl font-black text-[var(--text-primary)] tracking-tight mb-4">Contact Us</h1>
            <p className="text-[var(--text-secondary)] max-w-xl mx-auto">
              Have a question about Lesson Tracker Pro? Send us a message and we&apos;ll get back to you as soon as possible.
            </p>
          </div>

          <div className="surface-card p-8 md:p-10 animate-fade-in-up animate-delay-100">
            {submitted ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-[#f0fdf4] border border-[#bbf7d0] rounded-2xl flex items-center justify-center mx-auto mb-5">
                  <svg className="w-8 h-8 text-[#166534]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-xl font-bold text-[#166534] mb-2">Message sent!</p>
                <p className="text-sm text-[#15803d] mb-6">We&apos;ll reply to you at {form.email} as soon as possible.</p>
                <button
                  onClick={() => { setForm({ name: '', email: '', message: '' }); setSubmitted(false); }}
                  className="btn-secondary"
                >
                  Send another message
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                {error && <div className="alert-error">{error}</div>}
                <div className="grid md:grid-cols-2 gap-5">
                  <div>
                    <label className="field-label">Your Name</label>
                    <input
                      type="text"
                      placeholder="Jane Doe"
                      value={form.name}
                      onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                      className="field-input"
                    />
                  </div>
                  <div>
                    <label className="field-label">Your Email</label>
                    <input
                      type="email"
                      placeholder="jane@example.com"
                      value={form.email}
                      onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                      className="field-input"
                    />
                  </div>
                </div>
                <div>
                  <label className="field-label">Message</label>
                  <textarea
                    rows={5}
                    placeholder="How can we help you?"
                    value={form.message}
                    onChange={(e) => setForm((p) => ({ ...p, message: e.target.value }))}
                    className="field-input resize-y min-h-[120px]"
                  />
                </div>
                <button type="submit" disabled={submitting} className="btn-primary w-full">
                  {submitting ? <><span className="spinner" /> Sending…</> : 'Send Message'}
                </button>
              </form>
            )}
          </div>

          <div className="text-center mt-10">
            <Link href="/" className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors font-medium">
              ← Back to Home
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}