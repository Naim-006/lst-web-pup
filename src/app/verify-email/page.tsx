'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

export default function VerifyEmailPage() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'verified' | 'error'>('loading');
  const [detail, setDetail] = useState('');

  useEffect(() => {
    const check = async () => {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) { setStatus('error'); setDetail(error.message); return; }
      if (session?.user?.email_confirmed_at) {
        setStatus('verified');
      } else if (searchParams.get('error')) {
        setStatus('error');
        setDetail('This confirmation link is invalid or has expired. Please request a new one.');
      } else {
        setStatus('error');
        setDetail('Unable to confirm your email. The link may be invalid or expired.');
      }
    };
    check();
  }, [searchParams]);

  if (status === 'loading') {
    return (
      <div className="auth-page">
        <div className="auth-card text-center">
          <div className="w-14 h-14 bg-[var(--sunset-light)] rounded-2xl flex items-center justify-center mx-auto mb-5">
            <span className="spinner spinner-sunset" style={{ width: 28, height: 28, borderWidth: 3 }} />
          </div>
          <h1 className="text-xl font-bold text-[var(--text-primary)] mb-2">Confirming your email…</h1>
          <p className="text-sm text-[var(--text-muted)]">Please wait while we verify your email address.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card text-center">
        {status === 'verified' ? (
          <>
            <div className="w-16 h-16 bg-[#f0fdf4] border border-[#bbf7d0] rounded-2xl flex items-center justify-center mx-auto mb-5">
              <svg className="w-8 h-8 text-[#166534]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">Email Confirmed!</h1>
            <p className="text-[var(--text-secondary)] text-sm mb-6">
              Your email address has been successfully verified. You can now sign in to your account.
            </p>
            <Link href="/" className="btn-primary w-full block">Go to Home</Link>
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