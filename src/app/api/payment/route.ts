import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const paymentId = searchParams.get('payment');
  const sessionId = searchParams.get('session_id');

  if (!paymentId && !sessionId) {
    return NextResponse.json({ error: 'Required: payment or session_id' }, { status: 400 });
  }

  // The status endpoint must read instructor_payments regardless of who is
  // asking (the instructor has not signed in again yet after Stripe Checkout),
  // so it MUST use the service-role client. Trying the anon client silently
  // falls back to RLS-blocked reads and surfaces as a misleading 404.
  let admin;
  try {
    admin = getSupabaseAdmin();
  } catch (err) {
    return NextResponse.json(
      { error: 'Server is not configured for payment verification. Contact support.' },
      { status: 500 },
    );
  }

  let data: Record<string, unknown> | null = null;

  if (paymentId) {
    const { data: d, error } = await admin
      .from('instructor_payments')
      .select('id, amount, description, status, failure_reason, expires_at, payment_method, payment_date, txn_id, instructor_id, subscription_id')
      .eq('id', paymentId)
      .maybeSingle();
    if (d) data = d;
  } else if (sessionId) {
    const { data: d, error } = await admin
      .from('instructor_payments')
      .select('id, amount, description, status, failure_reason, expires_at, payment_method, payment_date, txn_id, instructor_id, subscription_id')
      .eq('stripe_session_id', sessionId)
      .maybeSingle();
    if (d) data = d;
  }

  if (!data) {
    return NextResponse.json({
      error: 'Payment not found',
      debug: { paymentId, sessionId },
    }, { status: 404 });
  }

  // Only the payment's own (non-PII) fields are exposed. This route is
  // unauthenticated by design (the instructor lands here right after Stripe
  // Checkout, before signing back into the app), so never return the linked
  // instructor's name/email or the raw Stripe session id.
  let subscription = null;

  if (data.subscription_id) {
    const { data: s } = await admin
      .from('instructor_subscriptions')
      .select('id, plan_id, plan_type, status, start_date, end_date, payment_status, amount')
      .eq('id', data.subscription_id)
      .maybeSingle();
    subscription = s;
  }

  return NextResponse.json({
    id: data.id,
    amount: data.amount,
    description: data.description,
    status: data.status,
    failure_reason: data.failure_reason ?? null,
    expires_at: data.expires_at ?? null,
    payment_method: data.payment_method,
    payment_date: data.payment_date,
    txn_id: data.txn_id,
    subscription,
  });
}
