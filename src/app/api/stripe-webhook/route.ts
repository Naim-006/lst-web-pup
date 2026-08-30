import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { activateSubscription, createActiveSubscription } from '@/lib/activateSubscription';

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature') || '';

  let admin;
  try {
    admin = getSupabaseAdmin();
  } catch {
    return NextResponse.json({ error: 'Server is not configured.' }, { status: 500 });
  }

  const { data: configRow } = await admin
    .from('app_settings')
    .select('value')
    .eq('key', 'payment_config')
    .single();

  const config = (configRow?.value as Record<string, unknown>) ?? {};
  const webhookSecret = config['stripe_webhook_secret'] as string;

  // Never process events without a configured secret — otherwise anyone could
  // forge a request and activate subscriptions for free.
  if (!webhookSecret) {
    return NextResponse.json(
      { error: 'Stripe webhook not configured.' },
      { status: 500 },
    );
  }

  const crypto = await import('crypto');
  const parts = sig.split(',');
  let timestamp = '';
  let signature = '';
  for (const part of parts) {
    const [k, v] = part.split('=');
    if (k === 't') timestamp = v;
    if (k === 'v1') signature = v;
  }
  if (!timestamp || !signature) {
    return NextResponse.json({ error: 'Invalid signature format' }, { status: 401 });
  }

  // Replay protection: reject signatures older than 5 minutes.
  const tsMs = Number.parseInt(timestamp, 10) * 1000;
  if (!Number.isFinite(tsMs) || Math.abs(Date.now() - tsMs) > 5 * 60 * 1000) {
    return NextResponse.json({ error: 'Stale signature' }, { status: 401 });
  }

  const payload = `${timestamp}.${body}`;
  const expected = crypto.createHmac('sha256', webhookSecret).update(payload).digest('hex');
  if (expected !== signature) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let event;
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const session = event.data?.object ?? {};
  const meta = (session.metadata as Record<string, string>) ?? {};
  const sessionId = session.id as string;
  const subscriptionId = meta.subscription_id;
  const paymentId = meta.payment_id;
  const instructorId = meta.instructor_id;
  const planId = meta.plan_id;
  const planName = meta.plan_name ?? 'Subscription';
  const durationMonths = Number(meta.duration_months) || 1;
  const amount = session.amount_total ? session.amount_total / 100 : 0;

  if (event.type === 'checkout.session.completed') {
    // NEVER activate from metadata alone: only when Stripe confirms the
    // payment was captured AND the charged amount matches the payment row.
    const sessionPaid = session.payment_status === 'paid';
    const amountTotal = session.amount_total ? session.amount_total / 100 : 0;

    let expectedAmount: number | null = null;
    let instructorMatches = true;
    if (paymentId) {
      const { data: payRow } = await admin
        .from('instructor_payments')
        .select('amount, instructor_id')
        .eq('id', paymentId)
        .maybeSingle();
      if (payRow) {
        expectedAmount = Number(payRow.amount) ?? null;
        if (instructorId && payRow.instructor_id &&
            String(payRow.instructor_id) !== String(instructorId)) {
          instructorMatches = false;
        }
      }
    }

    if (!sessionPaid) {
      // Not captured yet (async method still processing). Leave pending; the
      // verify-on-return flow activates once Stripe reports paid.
      return NextResponse.json({ received: true, activated: false, reason: 'unpaid' });
    }
    if (!instructorMatches ||
        (expectedAmount != null && Math.abs(amountTotal - expectedAmount) >= 0.01)) {
      console.error('Webhook validation failed: instructor_match=', instructorMatches,
        'expected_amount=', expectedAmount, 'charged=', amountTotal);
      return NextResponse.json({ received: true, activated: false, reason: 'validation_failed' });
    }

    // Payment was confirmed by Stripe. Activate the subscription so the
    // instructor gets access automatically. Idempotent: an already-active
    // subscription is left untouched.

    if (subscriptionId && instructorId) {
      await activateSubscription(admin, {
        subscriptionId,
        instructorId,
        durationMonths,
        paymentId,
        stripeSessionId: sessionId,
        amount,
      });
    } else if (instructorId && planId) {
      // Legacy fallback: create an active subscription from plan metadata.
      const sub = await createActiveSubscription(admin, {
        instructorId,
        planId,
        planName,
        durationMonths,
        amount,
      });
      if (sub && paymentId) {
        await admin.from('instructor_payments').update({
          status: 'completed',
          payment_date: new Date().toISOString(),
          subscription_id: sub.id,
          stripe_session_id: sessionId,
        }).eq('id', paymentId);
      }
    } else if (paymentId) {
      // Payment without plan metadata: record the money only.
      await admin.from('instructor_payments').update({
        status: 'completed',
        stripe_session_id: sessionId,
        payment_date: new Date().toISOString(),
      }).eq('id', paymentId);
    } else if (instructorId) {
      const txnId = `TXN-${new Date().toISOString().slice(2,10).replace(/-/g,'')}-${Math.random().toString(36).slice(2,6).toUpperCase()}`
      await admin.from('instructor_payments').insert({
        instructor_id: instructorId,
        amount: amount,
        payment_date: new Date().toISOString(),
        status: 'completed',
        payment_method: 'stripe',
        stripe_session_id: sessionId,
        description: `Subscription payment - ${planName}`,
        txn_id: txnId,
      });
    }
  }

  if (event.type === 'checkout.session.expired') {
    // Abandoned checkout — mark pending records failed and reject the pending
    // subscription so the app never grants access for an unpaid term.
    if (paymentId) {
      await admin.from('instructor_payments').update({ status: 'failed' }).eq('id', paymentId);
    }
    if (subscriptionId) {
      await admin.from('instructor_subscriptions')
        .update({ status: 'rejected', payment_status: 'failed' })
        .eq('id', subscriptionId)
        .eq('status', 'pending');
    }
  }

  if (event.type === 'checkout.session.async_payment_failed' ||
      event.type === 'payment_intent.payment_failed') {
    // Stripe explicitly reported the payment failed. Mark records failed so
    // the app shows "Payment Failed" and the instructor keeps their previous
    // plan. The subscription is rejected, never activated.
    if (paymentId) {
      await admin.from('instructor_payments').update({ status: 'failed' }).eq('id', paymentId);
    }
    if (subscriptionId) {
      await admin.from('instructor_subscriptions')
        .update({ status: 'rejected', payment_status: 'failed' })
        .eq('id', subscriptionId)
        .eq('status', 'pending');
    }
  }

  // Opportunistic cleanup: expire pending rows older than 60 minutes for this
  // instructor (the payment window) so abandoned checkouts fail instead of
  // lingering in an indefinite pending state.
  if (instructorId) {
    const staleCutoff = new Date(Date.now() - 60 * 60 * 1000);
    await admin.from('instructor_subscriptions')
      .update({ status: 'rejected', payment_status: 'failed' })
      .eq('instructor_id', instructorId)
      .eq('status', 'pending')
      .lt('created_at', staleCutoff.toISOString());
  }

  return NextResponse.json({ received: true });
}
