'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export default function ConfirmEmailPage() {
  const [status, setStatus] = useState<'loading' | 'confirmed' | 'error'>('loading');
  const [detail, setDetail] = useState('');
  const [email, setEmail] = useState('');
  const fired = useRef(false);

  useEffect(() => {
    const check = async () => {
      if (fired.current) return;
      fired.current = true;

      const params = new URLSearchParams(window.location.search);
      const tokenHash = params.get('token_hash');
      const type = params.get('type');

      let session = null;

      if (tokenHash) {
        // New-style confirmation links carry the token in the query string.
        // The SDK does not auto-exchange these, so verify it explicitly.
        const { data, error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: (type ?? 'email') as Parameters<typeof supabase.auth.verifyOtp>[0]['type'],
        });
        if (!error) session = data.session;
      } else {
        // Legacy links put tokens in the URL fragment; the SDK exchanges them
        // during module load, so give it a moment before reading the session.
        for (let i = 0; i < 5; i++) {
          await new Promise((r) => setTimeout(r, 400));
          const { data } = await supabase.auth.getSession();
          if (data.session) { session = data.session; break; }
        }
      }

      if (session?.user?.email_confirmed_at) {
        setEmail(session.user.email ?? '');
        setStatus('confirmed');
      } else {
        setStatus('error');
        setDetail('This confirmation link is invalid or has expired. Please sign up again or contact support for a new verification email.');
      }
    };
    check();
  }, []);

  if (status === 'loading') {
    return (
      <div className="auth-page">
        <div className="auth-card text-center">
          <div className="w-14 h-14 bg-[var(--sunset-light)] rounded-2xl flex items-center justify-center mx-auto mb-5">
            <span className="spinner spinner-sunset" style={{ width: 28, height: 28, borderWidth: 3 }} />
          </div>
          <h1 className="text-xl font-bold text-[var(--text-primary)] mb-2">Confirming your email…</h1>
          <p className="text-sm text-[var(--text-muted)]">Please wait a moment.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card text-center">
        {status === 'confirmed' ? (
          <>
            <div className="w-16 h-16 bg-[#f0fdf4] border border-[#bbf7d0] rounded-2xl flex items-center justify-center mx-auto mb-5">
              <svg className="w-8 h-8 text-[#166534]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">Email Confirmed!</h1>
            <p className="text-[var(--text-secondary)] text-sm mb-2">
              Your email{email ? ` (${email})` : ''} has been successfully verified.
            </p>
            <p className="text-[var(--text-secondary)] text-sm mb-6">
              Your account is ready. You can now log in to the app.
            </p>
            <Link href="/" className="btn-primary w-full block">Try to Login Now</Link>
          </>
        ) : (
          <>
            <div className="w-16 h-16 bg-[#fef2f2] border border-[#fecaca] rounded-2xl flex items-center justify-center mx-auto mb-5">
              <svg className="w-8 h-8 text-[#991b1b]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">Unable to Confirm Email</h1>
            <p className="text-[var(--text-secondary)] text-sm mb-6">{detail}</p>
            <Link href="/" className="btn-secondary w-full block">Back to Home</Link>
          </>
        )}
      </div>
    </div>
  );
}