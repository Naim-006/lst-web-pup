import Link from 'next/link';

export default function PaymentCancelPage() {
  return (
    <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center">
        <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">Payment Cancelled</h1>
        <p className="text-[var(--text-secondary)] mb-6">Your payment was cancelled. No charges have been made.</p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link href="/" className="btn-secondary px-6 py-3 inline-block">Return Home</Link>
          <Link href="lessontrackerpro://subscription" className="btn-primary px-6 py-3 inline-block">Back to App</Link>
        </div>
      </div>
    </div>
  );
}
