'use client';

import Link from 'next/link';

export default function PaymentCancelledPage() {
  return (
    <div className="auth-page payment-cancelled-glow min-h-screen flex items-center justify-center p-6">
      <div className="relative w-full max-w-[480px]">
        <div className="absolute -inset-1 bg-gradient-to-br from-[#ef4444]/10 via-transparent to-[#f3751f]/5 rounded-[40px] blur-xl" />

        <div className="relative bg-white/90 backdrop-blur-xl border border-white/60 rounded-[32px] shadow-2xl p-8 md:p-10 animate-fade-in-up">
          <div className="text-center">
            <div className="w-20 h-20 mx-auto mb-6 rounded-[24px] bg-gradient-to-br from-[#fef2f2] to-[#fee2e2] border-2 border-[#fecaca] flex items-center justify-center shadow-lg shadow-[#ef4444]/10">
              <svg className="w-10 h-10 text-[#991b1b]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>

            <h1 className="text-3xl font-black text-[var(--text-primary)] mb-2 tracking-tight">
              Payment Cancelled
            </h1>
            <p className="text-[var(--text-secondary)] text-sm leading-relaxed mb-8 max-w-sm mx-auto">
              No charges were made. Your account remains on the current plan. You can try again whenever you&apos;re ready.
            </p>

            <div className="bg-[var(--surface-2)] rounded-[20px] p-5 mb-8 border border-[var(--border)]">
              <div className="flex items-center justify-between py-2">
                <span className="text-sm font-medium text-[var(--text-secondary)]">Status</span>
                <span className="badge badge-gray">No changes</span>
              </div>
              <div className="border-t border-[var(--border)] my-3" />
              <div className="flex items-center justify-between py-2">
                <span className="text-sm font-medium text-[var(--text-secondary)]">Charges</span>
                <span className="text-sm font-bold text-[var(--text-primary)]">&pound;0.00</span>
              </div>
              <div className="border-t border-[var(--border)] my-3" />
              <div className="flex items-center justify-between py-2">
                <span className="text-sm font-medium text-[var(--text-secondary)]">Need help?</span>
                <span className="text-sm font-semibold text-[var(--sunset)]">Contact support</span>
              </div>
            </div>

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
              <Link
                href="/help"
                className="btn-ghost w-full justify-center text-sm"
              >
                Need assistance? Visit Help Centre
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
