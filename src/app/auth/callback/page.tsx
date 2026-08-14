'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function AuthCallbackPage() {
  const router = useRouter();
  const handled = useRef(false);

  useEffect(() => {
    // If this is a password recovery link, send the user to the reset page.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' && !handled.current) {
        handled.current = true;
        router.replace('/reset-password');
      }
    });

    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (handled.current) return;
      handled.current = true;
      if (session) {
        // Email confirmed (or already signed in) – show the confirmation page.
        router.replace('/verify-email');
      } else {
        // No session – might be a magic link / email confirmation
        // Wait a moment for SDK to process the URL hash
        setTimeout(async () => {
          const { data: { session: s2 } } = await supabase.auth.getSession();
          if (s2) {
            router.replace('/verify-email');
          } else {
            router.replace('/verify-email?error=invalid');
          }
        }, 1500);
      }
    };
    checkSession();

    return () => subscription.unsubscribe();
  }, [router]);

  return (
    <div className="auth-page">
      <div className="auth-card text-center">
        <div className="w-14 h-14 bg-[var(--sunset-light)] rounded-2xl flex items-center justify-center mx-auto mb-5">
          <span className="spinner spinner-sunset" style={{width: 28, height: 28, borderWidth: 3}} />
        </div>
        <h1 className="text-xl font-bold text-[var(--text-primary)] mb-2">Verifying your account…</h1>
        <p className="text-sm text-[var(--text-muted)]">Please wait while we confirm your identity.</p>
      </div>
    </div>
  );
}