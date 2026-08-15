import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { activateSubscription } from '@/lib/activateSubscription';

/**
 * Secure re-confirmation for the payment success page.
 *
 * Used when the instructor lands back on /payment/success but the Stripe
 * webhook has not yet been delivered. This route never trusts the browser:
 * it asks Stripe directly whether the checkout session was paid, verifies the
 * session metadata ties it to the correct payment + instructor, then performs
 * the same idempotent activation as the webhook.
 */
export async function POST(req: NextRequest) {
  const admin = getSupabaseAdmin();
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const paymentId = (body.payment_id as string) || '';
  const requestedSessionId = (body.session_id as string) || '';
  if (!paymentId && !requestedSessionId) {
    return NextResponse.json({ error: 'payment_id or session_id required' }, { status: 400 });
  }

  // 1. Load the payment row (source of truth for subscription/amount).
  let query = admin.from('instructor_payments').select('*');
  if (paymentId) {
    query = query.eq('id', paymentId);
  } else {
    query = query.eq('stripe_session_id', requestedSessionId);
  }
  const { data: payment } = await query.maybeSingle();
  if (!payment) {
    return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
  }

  // 2. Need a Stripe session id to verify server-side.
  const sessionId = (payment.stripe_session_id as string) || requestedSessionId;
  if (!sessionId) {
    return NextResponse.json({
      error: 'Not yet verifiable',
      payment: { id: payment.id, status: payment.status },
    }, { status: 409 });
  }

  const { data: configRow } = await admin
    .from('app_settings')
    .select('value')
    .eq('key', 'payment_config')
    .single();
  const config = (configRow?.value as Record<string, unknown>) ?? {};
  const stripeSecretKey = config['stripe_secret_key'] as string;
  if (!stripeSecretKey) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 });
  }

  // 3. Verify with Stripe directly.
  let session: Record<string, unknown>;
  try {
    const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}`, {
      headers: { Authorization: `Bearer ${stripeSecretKey}` },
    });
    if (!res.ok) {
      return NextResponse.json({ error: 'Stripe verification failed' }, { status: 502 });
    }
    session = await res.json();
  } catch {
    return NextResponse.json({ error: 'Stripe verification failed' }, { status: 502 });
  }

  const meta = (session.metadata ?? {}) as Record<string, unknown>;
  const sessionPaid = session.payment_status === 'paid';
  const sessionComplete = session.status === 'complete' || session.status === 'paid';
  const metaPaymentMatches = !paymentId || meta.payment_id === paymentId;
  const metaInstructorMatches = !payment.instructor_id || meta.instructor_id === payment.instructor_id;
  const amountMatch = typeof session.amount_total === 'number'
    && Math.abs(session.amount_total / 100 - Number(payment.amount || 0)) < 0.01;

  if (!sessionPaid || !sessionComplete || !metaPaymentMatches || !metaInstructorMatches || !amountMatch) {
    return NextResponse.json({
      error: 'Payment not confirmed',
      payment: { id: payment.id, status: payment.status },
    }, { status: 409 });
  }

  // 4. Activate (idempotent).
  const subscriptionId = (meta.subscription_id as string) || (payment.subscription_id as string) || '';
  const instructorId = (meta.instructor_id as string) || (payment.instructor_id as string) || '';
  const durationMonths = Number(meta.duration_months) || 1;

  if (subscriptionId && instructorId) {
    await activateSubscription(admin, {
      subscriptionId,
      instructorId,
      durationMonths,
      paymentId: payment.id as string,
      stripeSessionId: sessionId,
    });
  }

  // 5. Return current state.
  const { data: sub } = subscriptionId
    ? await admin.from('instructor_subscriptions')
        .select('id, plan_type, status, start_date, end_date, payment_status, amount')
        .eq('id', subscriptionId)
        .maybeSingle()
    : { data: null };

  const { data: updatedPayment } = await admin
    .from('instructor_payments')
    .select('id, status, amount, description, payment_method, payment_date, txn_id')
    .eq('id', payment.id)
    .single();

  return NextResponse.json({
    payment: updatedPayment,
    subscription: sub,
    activated: sub?.status === 'active',
  });
}
