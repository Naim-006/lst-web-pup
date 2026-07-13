'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';

type PaymentData = {
  amount: number;
  description: string;
  status: string;
  payment_method: string;
  payment_date: string;
  instructor: { name: string; email: string } | null;
  subscription: {
    plan_type: string;
    status: string;
    start_date: string;
    end_date: string;
    payment_status: string;
  } | null;
};

export default function PaymentSuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="w-8 h-8 border-2 border-[var(--sunset)] border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <PaymentSuccessContent />
    </Suspense>
  );
}

function PaymentSuccessContent() {
  const params = useSearchParams();
  const paymentId = params.get('payment');
  const sessionId = params.get('session_id');
  const [data, setData] = useState<PaymentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!paymentId && !sessionId) {
      setLoading(false);
      return;
    }
    const id = paymentId ? `payment=${paymentId}` : `session_id=${sessionId}`;
    fetch(`/api/payment?${id}`)
      .then(r => r.json())
      .then(res => {
        if (res.error) setError(res.error);
        else setData(res);
      })
      .catch(() => setError('Failed to load payment details'))
      .finally(() => setLoading(false));
  }, [paymentId, sessionId]);

  const fmt = (iso: string) => {
    try { return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }); }
    catch { return iso; }
  };

  const success = data?.status === 'completed' || data?.status === 'paid';
  const pending = data?.status === 'pending';
  const title = success ? 'Payment Successful!' : (pending ? 'Processing...' : (error ? 'Check Your Email or app' : 'Processing...'));

  const [retrying, setRetrying] = useState(false);
  const retry = () => {
    setRetrying(true);
    window.location.reload();
  };

  const iconType = success ? 'check' : (pending ? 'clock' : (error ? '✓' : 'clock'));
  const icon = success ? 'check' : (error ? '✓' : 'clock');

  return (
    <div className={`auth-page ${success ? 'payment-success-glow' : 'payment-cancelled-glow'} min-h-screen flex items-center justify-center p-6`}>
      {success && [...Array(12)].map((_, i) => <div key={i} className="confetti-piece" />)}

      <div className="relative w-full max-w-[480px]">
        <div className={`absolute -inset-1 bg-gradient-to-br ${success ? 'from-[#10b981]/20 via-transparent to-[#f3751f]/10' : 'from-[#ef4444]/10 via-transparent to-[#f3751f]/5'} rounded-[40px] blur-xl`} />

        <div className="relative bg-white/90 backdrop-blur-xl border border-white/60 rounded-[32px] shadow-2xl p-8 md:p-10 animate-fade-in-up">
          <div className="text-center">
            <div className={`w-20 h-20 mx-auto mb-6 rounded-[24px] border-2 flex items-center justify-center shadow-lg ${success ? 'bg-gradient-to-br from-[#f0fdf4] to-[#dcfce7] border-[#bbf7d0] shadow-[#10b981]/10' : pending ? 'bg-gradient-to-br from-[#fffbeb] to-[#fef3c7] border-[#fde68a] shadow-[#f59e0b]/10' : 'bg-gradient-to-br from-[#fef2f2] to-[#fee2e2] border-[#fecaca] shadow-[#ef4444]/10'}`}>
              {iconType === 'check' ? (
                <svg className="w-10 h-10 text-[#166534]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : iconType === 'clock' ? (
                <svg className="w-10 h-10 text-[#92400e]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2" />
                  <circle cx="12" cy="12" r="10" />
                </svg>
              ) : (
                <svg className="w-10 h-10 text-[#991b1b]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
            </div>

            <h1 className="text-3xl font-black text-[var(--text-primary)] mb-2 tracking-tight">{title}</h1>
            <p className="text-[var(--text-secondary)] text-sm leading-relaxed mb-8 max-w-sm mx-auto">
              {success ? 'Your payment was processed successfully. Your subscription is now active.' :
               pending ? 'Your payment is confirmed. Your subscription will activate in a moment.' :
               error ? 'It may still be processing.' :
               'Your payment is being processed. This page will update automatically.'}
            </p>

            {data && (
              <div className="bg-[var(--surface-2)] rounded-[20px] p-5 mb-8 border border-[var(--border)] text-left">
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm font-medium text-[var(--text-secondary)]">Status</span>
                  <span className={`badge ${success ? 'badge-green' : 'badge-gray'}`}>
                    {success ? 'Completed' : data.status}
                  </span>
                </div>
                <div className="border-t border-[var(--border)] my-3" />
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm font-medium text-[var(--text-secondary)]">Description</span>
                  <span className="text-sm font-bold text-[var(--text-primary)]">{data.description}</span>
                </div>
                <div className="border-t border-[var(--border)] my-3" />
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm font-medium text-[var(--text-secondary)]">Amount</span>
                  <span className="text-lg font-black text-[var(--sunset)]">&pound;{data.amount.toFixed(2)}</span>
                </div>
                {data.subscription && (
                  <>
                    <div className="border-t border-[var(--border)] my-3" />
                    <div className="flex items-center justify-between py-2">
                      <span className="text-sm font-medium text-[var(--text-secondary)]">Plan</span>
                      <span className="text-sm font-semibold text-[var(--text-primary)]">{data.subscription.plan_type}</span>
                    </div>
                    <div className="border-t border-[var(--border)] my-3" />
                    <div className="flex items-center justify-between py-2">
                      <span className="text-sm font-medium text-[var(--text-secondary)]">Start date</span>
                      <span className="text-sm text-[var(--text-primary)]">{fmt(data.subscription.start_date)}</span>
                    </div>
                    <div className="border-t border-[var(--border)] my-3" />
                    <div className="flex items-center justify-between py-2">
                      <span className="text-sm font-medium text-[var(--text-secondary)]">Next billing</span>
                      <span className="text-sm text-[var(--text-primary)]">{fmt(data.subscription.end_date)}</span>
                    </div>
                  </>
                )}
                {data.payment_date && (
                  <>
                    <div className="border-t border-[var(--border)] my-3" />
                    <div className="flex items-center justify-between py-2">
                      <span className="text-sm font-medium text-[var(--text-secondary)]">Paid on</span>
                      <span className="text-sm text-[var(--text-primary)]">{fmt(data.payment_date)}</span>
                    </div>
                  </>
                )}
                {data.payment_method && (
                  <>
                    <div className="border-t border-[var(--border)] my-3" />
                    <div className="flex items-center justify-between py-2">
                      <span className="text-sm font-medium text-[var(--text-secondary)]">Method</span>
                      <span className="text-sm font-semibold uppercase text-[var(--text-primary)]">{data.payment_method}</span>
                    </div>
                  </>
                )}
              </div>
            )}

            {loading && (
              <div className="bg-[var(--surface-2)] rounded-[20px] p-8 mb-8 border border-[var(--border)]">
                <div className="flex items-center justify-center gap-3">
                  <div className="w-5 h-5 border-2 border-[var(--sunset)] border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm text-[var(--text-secondary)]">Loading invoice details...</span>
                </div>
              </div>
            )}

            {error && (
              <div className="flex flex-col gap-3 mt-6">
                
              </div>
            )}
            <Link
              href="/"
              className="btn-primary w-full justify-center text-base py-3"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              Return Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
