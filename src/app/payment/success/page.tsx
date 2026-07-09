'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

export default function PaymentSuccessPage() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!sessionId) {
      setStatus('error');
      setError('No session ID provided.');
      return;
    }

    const confirmPayment = async () => {
      try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const res = await fetch(`${supabaseUrl}/functions/v1/stripe-webhook`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId }),
        });

        const data = await res.json();

        if (data.success) {
          setStatus('success');
        } else {
          setStatus('error');
          setError(data.error || 'Payment could not be confirmed.');
        }
      } catch (err) {
        setStatus('error');
        setError('Failed to confirm payment. Please contact support.');
      }
    };

    confirmPayment();
  }, [sessionId]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[var(--sunset)] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[var(--text-secondary)]">Confirming your payment...</p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">Payment Error</h1>
          <p className="text-[var(--text-secondary)] mb-6">{error}</p>
          <a href="/" className="btn-primary px-6 py-3 inline-block">Return Home</a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">Payment Successful!</h1>
        <p className="text-[var(--text-secondary)] mb-2">Your subscription has been activated.</p>
        <p className="text-sm text-[var(--text-muted)] mb-8">You can now access all premium features in the app.</p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <a href="/" className="btn-secondary px-6 py-3 inline-block">Return Home</a>
          <a
            href={sessionId ? `lessontrackerpro://subscription?session_id=${sessionId}` : 'lessontrackerpro://subscription'}
            className="btn-primary px-6 py-3 inline-block"
          >
            Open App
          </a>
        </div>
      </div>
    </div>
  );
}
