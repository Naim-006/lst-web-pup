'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
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

type View =
  | { kind: 'loading' }
  | { kind: 'success'; data: PaymentData }
  | { kind: 'activating'; data: PaymentData }
  | { kind: 'processing'; data: PaymentData }
  | { kind: 'timeout'; data: PaymentData | null }
  | { kind: 'failed'; data: PaymentData | null; message: string };

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

  const [view, setView] = useState<View>({ kind: 'loading' });
  const [retrying, setRetrying] = useState(false);
  const hasConfirmed = useRef(false);

  useEffect(() => {
    if (!paymentId && !sessionId) {
      setView({ kind: 'failed', data: null, message: 'Missing payment reference.' });
      return;
    }
    let stopped = false;
    const id = paymentId ? `payment=${paymentId}` : `session_id=${sessionId}`;
    const started = Date.now();

    const tick = async () => {
      if (stopped) return;

      let res: PaymentData | null = null;
      try {
        const r = await fetch(`/api/payment?${id}`);
        const json = await r.json();
        if (!r.ok || json.error) throw new Error(json.error || 'Failed to load payment details');
        res = json;
      } catch (e) {
        if (stopped) return;
        // A failed /api/payment fetch is not proof the payment failed. Keep
        // polling until the 90s timeout so a slow webhook or DB hiccup never
        // shows a false "not verified" state; the timeout view offers Refresh.
        if (Date.now() - started > 90000) {
          setView({ kind: 'timeout', data: null });
          stopped = true;
          return;
        }
        setTimeout(tick, 2500);
        return;
      }
      if (stopped) return;

      const current = res as PaymentData;
      const subActive = current.subscription?.status === 'active';
      const payCompleted =
        current.status === 'completed' || current.status === 'paid'
        || current.subscription?.payment_status === 'completed'
        || current.subscription?.payment_status === 'paid';
      const payFailed = current.status === 'failed' || current.subscription?.status === 'rejected';
      const payPending = current.status === 'pending';

      // The payment being confirmed (Stripe has the money) is a success even
      // if the webhook hasn't flipped the subscription row to 'active' yet.
      if (subActive || payCompleted) {
        setView({ kind: 'success', data: current });
        stopped = true;
        return;
      }
      if (payFailed) {
        setView({ kind: 'failed', data: current, message: 'Your payment could not be confirmed.' });
        stopped = true;
        return;
      }
      if (Date.now() - started > 90000) {
        setView({ kind: 'timeout', data: current });
        stopped = true;
        return;
      }

      // If the money has been received but the webhook has not activated the
      // subscription yet (~30s), ask the server to re-confirm directly with
      // Stripe. Safe: the server verifies the session is paid.
      if (payCompleted && !hasConfirmed.current && Date.now() - started > 30000) {
        hasConfirmed.current = true;
        fetch('/api/payment/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(paymentId ? { payment_id: paymentId } : { session_id: sessionId }),
        })
          .then(r => r.json())
          .then(confirmRes => {
            if (stopped) return;
            const confirmed =
              confirmRes?.subscription?.status === 'active'
              || confirmRes?.subscription?.payment_status === 'completed'
              || confirmRes?.subscription?.payment_status === 'paid'
              || confirmRes?.payment?.status === 'completed'
              || confirmRes?.payment?.status === 'paid';
            if (confirmed) {
              setView({ kind: 'success', data: { ...current, subscription: confirmRes.subscription } });
              stopped = true;
            } else if (confirmRes?.payment?.status === 'failed') {
              setView({ kind: 'failed', data: current, message: 'Your payment could not be confirmed.' });
              stopped = true;
            }
          })
          .catch(() => { /* webhook may still arrive; keep polling */ });
      }

      setView(payPending ? { kind: 'processing', data: current } : { kind: 'activating', data: current });
      setTimeout(tick, 2500);
    };

    tick();
    return () => { stopped = true; };
  }, [paymentId, sessionId]);

  const retry = () => {
    setRetrying(true);
    window.location.reload();
  };

  const fmt = (iso: string) => {
    try { return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }); }
    catch { return iso; }
  };

  const success = view.kind === 'success';
  const activating = view.kind === 'activating';
  const processing = view.kind === 'processing';
  const timedOut = view.kind === 'timeout';
  const failed = view.kind === 'failed';

  const title = success
    ? 'Subscription Active!'
    : activating
      ? 'Activating your subscription…'
      : processing
        ? 'Processing Payment…'
        : timedOut
          ? 'Still Processing…'
          : 'Something Went Wrong';

  const message = success
    ? 'Your payment was received and your subscription is now active. Welcome to Lesson Tracker Pro.'
    : activating
      ? 'Payment received. Your subscription activates automatically — just a moment.'
      : processing
        ? 'Your payment is being processed. This page updates automatically when confirmed.'
        : timedOut
          ? 'Your payment is taking longer than expected. Check your email or the app — you can also refresh to re-check.'
          : failed
            ? view.message
            : 'We could not verify your payment.';

  const iconType = success ? 'check' : (failed ? 'x' : 'clock');

  const data = (view as { data?: PaymentData | null }).data ?? null;
  const sub = data?.subscription;
  const showPlanDetails = success && sub && sub.start_date && sub.end_date;

  return (
    <div className={`auth-page ${success ? 'payment-success-glow' : 'payment-cancelled-glow'} min-h-screen flex items-center justify-center p-6`}>
      {success && [...Array(12)].map((_, i) => <div key={i} className="confetti-piece" />)}

      <div className="relative w-full max-w-[480px]">
        <div className={`absolute -inset-1 bg-gradient-to-br ${success ? 'from-[#10b981]/20 via-transparent to-[#f3751f]/10' : 'from-[#ef4444]/10 via-transparent to-[#f3751f]/5'} rounded-[40px] blur-xl`} />

        <div className="relative bg-white/90 backdrop-blur-xl border border-white/60 rounded-[32px] shadow-2xl p-8 md:p-10 animate-fade-in-up">
          <div className="text-center">
            <div className={`w-20 h-20 mx-auto mb-6 rounded-[24px] border-2 flex items-center justify-center shadow-lg ${success ? 'bg-gradient-to-br from-[#f0fdf4] to-[#dcfce7] border-[#bbf7d0] shadow-[#10b981]/10' : activating || processing || timedOut ? 'bg-gradient-to-br from-[#fffbeb] to-[#fef3c7] border-[#fde68a] shadow-[#f59e0b]/10' : 'bg-gradient-to-br from-[#fef2f2] to-[#fee2e2] border-[#fecaca] shadow-[#ef4444]/10'}`}>
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
            <p className="text-[var(--text-secondary)] text-sm leading-relaxed mb-8 max-w-sm mx-auto">{message}</p>

            {activating && (
              <div className="flex items-center justify-center gap-3 mb-8">
                <div className="w-5 h-5 border-2 border-[var(--sunset)] border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-[var(--text-secondary)]">Confirming with Stripe…</span>
              </div>
            )}

            {data && (
              <div className="bg-[var(--surface-2)] rounded-[20px] p-5 mb-8 border border-[var(--border)] text-left">
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm font-medium text-[var(--text-secondary)]">Status</span>
                  <span className={`badge ${success ? 'badge-green' : 'badge-gray'}`}>
                    {success ? 'Active' : data.status === 'completed' || data.status === 'paid' ? 'Payment received' : data.status}
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
                {showPlanDetails && sub && (
                  <>
                    <div className="border-t border-[var(--border)] my-3" />
                    <div className="flex items-center justify-between py-2">
                      <span className="text-sm font-medium text-[var(--text-secondary)]">Plan</span>
                      <span className="text-sm font-semibold text-[var(--text-primary)]">{sub.plan_type}</span>
                    </div>
                    <div className="border-t border-[var(--border)] my-3" />
                    <div className="flex items-center justify-between py-2">
                      <span className="text-sm font-medium text-[var(--text-secondary)]">Start date</span>
                      <span className="text-sm text-[var(--text-primary)]">{fmt(sub.start_date)}</span>
                    </div>
                    <div className="border-t border-[var(--border)] my-3" />
                    <div className="flex items-center justify-between py-2">
                      <span className="text-sm font-medium text-[var(--text-secondary)]">Active until</span>
                      <span className="text-sm text-[var(--text-primary)]">{fmt(sub.end_date)}</span>
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

            <div className="flex flex-col gap-3">
              <Link
                href="/"
                className="btn-primary w-full justify-center text-base py-3"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
                Return Home
              </Link>
              {(activating || processing || timedOut) && (
                <button
                  onClick={retry}
                  disabled={retrying}
                  className="btn-ghost w-full justify-center text-sm"
                >
                  {retrying ? 'Checking…' : 'Refresh Status'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
