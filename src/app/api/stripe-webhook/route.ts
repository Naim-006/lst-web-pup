import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { activateSubscription, createActiveSubscription } from '@/lib/activateSubscription';

// Force-expire a live Stripe Checkout Session. A session tied to a failed,
// cancelled or window-expired attempt must be dead immediately so the link can
// never accidentally be paid later.
async function expireStripeSession(secretKey: string, sessionId: string | null) {
  if (!secretKey || !sessionId) return;
  try {
    await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}/expire`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secretKey}` },
    });
  } catch {
    // best-effort: the server-side sweep has already closed the attempt
  }
}

// Whether Stripe already shows this session as paid. Guards the expiry sweep
// against a payment that was captured but whose webhook is delayed — we must
// never expire an attempt that actually received money.
async function stripeSessionIsPaid(secretKey: string, sessionId: string | null) {
  if (!secretKey || !sessionId) return false;
  try {
    const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    if (!res.ok) return false;
    const s = await res.json();
    return s.status === 'complete' && s.payment_status === 'paid';
  } catch {
    return false;
  }
}

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
  const stripeSecretKey = (config['stripe_secret_key'] as string) ?? '';

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
  const paymentIntentId = (session.payment_intent as string) || undefined;

  // Server-side expiry sweep: any pending attempt whose 2-minute window has
  // passed is expired (never an eternal "pending"), even if the Stripe
  // session-expired event was never delivered.
  {
    const { data: stalePays } = await admin
      .from('instructor_payments')
      .select('id, subscription_id, stripe_session_id')
      .eq('status', 'pending')
      .lt('expires_at', new Date().toISOString());
    for (const p of stalePays ?? []) {
      // A session Stripe already shows as paid is a webhook-delay, not an
      // abandonment — never expire it here.
      const sid = (p.stripe_session_id as string | null) ?? null;
      if (await stripeSessionIsPaid(stripeSecretKey, sid)) continue;
      await expireStripeSession(stripeSecretKey, sid);
      await admin.from('instructor_payments')
        .update({ status: 'expired', failure_reason: 'Payment window (2 minutes) expired' })
        .eq('id', p.id)
        .eq('status', 'pending');
      if (p.subscription_id) {
        await admin.from('instructor_subscriptions')
          .update({ status: 'rejected', payment_status: 'expired' })
          .eq('id', p.subscription_id)
          .eq('status', 'pending');
      }
    }
  }

  // Post-expiry grace sweep (global). Any active subscription whose period
  // ended more than 3 days ago is cancelled — the instructor had 3 days to
  // pay to continue and did not, so access is now blocked.
  {
    const graceCutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const { data: expiredActives } = await admin
      .from('instructor_subscriptions')
      .select('id')
      .eq('status', 'active')
      .lt('end_date', graceCutoff);
    for (const s of expiredActives ?? []) {
      await admin.from('instructor_subscriptions')
        .update({ status: 'cancelled', payment_status: 'expired' })
        .eq('id', s.id)
        .eq('status', 'active');
    }
  }

  if (event.type === 'checkout.session.completed') {
    // NEVER activate from metadata alone: only when Stripe confirms the
    // payment was captured AND the charged amount matches the payment row.
    const sessionPaid = session.payment_status === 'paid';
    const amountTotal = session.amount_total ? session.amount_total / 100 : 0;

    let expectedAmount: number | null = null;
    let paymentStatus: string | null = null;
    let instructorMatches = true;
    if (paymentId) {
      const { data: payRow } = await admin
        .from('instructor_payments')
        .select('amount, instructor_id, status')
        .eq('id', paymentId)
        .maybeSingle();
      if (payRow) {
        expectedAmount = Number(payRow.amount) ?? null;
        paymentStatus = payRow.status as string | null;
        if (instructorId && payRow.instructor_id &&
            String(payRow.instructor_id) !== String(instructorId)) {
          instructorMatches = false;
        }
      }
    }

    // Superseded / expired / cancelled attempt: the instructor started a
    // newer checkout after this one. Never activate the old one.
    if (paymentStatus && paymentStatus !== 'pending') {
      console.log('checkout completed for a superseded/closed attempt; skipping activation:', paymentId, paymentStatus);
      return NextResponse.json({ received: true, activated: false, reason: 'superseded' });
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
    // instructor gets access automatically. Only still-pending attempts are
    // activated (the helper guards that).

    if (subscriptionId && instructorId) {
      await activateSubscription(admin, {
        subscriptionId,
        instructorId,
        durationMonths,
        paymentId,
        stripeSessionId: sessionId,
        paymentIntentId,
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
          status: 'succeeded',
          payment_date: new Date().toISOString(),
          subscription_id: sub.id,
          stripe_session_id: sessionId,
          payment_intent_id: paymentIntentId,
        }).eq('id', paymentId).eq('status', 'pending');
      }
    } else if (paymentId) {
      // Payment without plan metadata: record the money only.
      await admin.from('instructor_payments').update({
        status: 'succeeded',
        stripe_session_id: sessionId,
        payment_intent_id: paymentIntentId,
        payment_date: new Date().toISOString(),
      }).eq('id', paymentId).eq('status', 'pending');
    } else if (instructorId) {
      const txnId = `TXN-${new Date().toISOString().slice(2,10).replace(/-/g,'')}-${Math.random().toString(36).slice(2,6).toUpperCase()}`
      await admin.from('instructor_payments').insert({
        instructor_id: instructorId,
        amount: amount,
        payment_date: new Date().toISOString(),
        status: 'succeeded',
        payment_method: 'stripe',
        stripe_session_id: sessionId,
        payment_intent_id: paymentIntentId,
        description: `Subscription payment - ${planName}`,
        txn_id: txnId,
      });
    }
  }

  if (event.type === 'checkout.session.expired') {
    // Abandoned checkout — the attempt itself expired.
    if (paymentId) {
      await admin.from('instructor_payments')
        .update({ status: 'expired', failure_reason: 'Checkout session expired' })
        .eq('id', paymentId)
        .eq('status', 'pending');
    }
    if (subscriptionId) {
      await admin.from('instructor_subscriptions')
        .update({ status: 'rejected', payment_status: 'expired' })
        .eq('id', subscriptionId)
        .eq('status', 'pending');
    }
  }

  if (event.type === 'checkout.session.async_payment_failed') {
    // Kill the link so the failed attempt can never be paid through it.
    await expireStripeSession(stripeSecretKey, sessionId);
    if (paymentId) {
      await admin.from('instructor_payments')
        .update({ status: 'failed', failure_reason: 'Payment could not be completed (card declined or payment method rejected)' })
        .eq('id', paymentId)
        .eq('status', 'pending');
    }
    if (subscriptionId) {
      await admin.from('instructor_subscriptions')
        .update({ status: 'rejected', payment_status: 'failed' })
        .eq('id', subscriptionId)
        .eq('status', 'pending');
    }
  }

  // Card declines arrive as payment_intent.payment_failed (the checkout
  // session stays open). Match the pending attempt by its payment intent.
  if (event.type === 'payment_intent.payment_failed') {
    const intent = event.data?.object ?? {};
    const intentId = intent.id as string | undefined;
    const failureReason = (intent.last_payment_error as Record<string, unknown> | null | undefined)
      ?.message as string | undefined;
    if (intentId) {
      const { data: failedPay } = await admin
        .from('instructor_payments')
        .select('id, subscription_id, stripe_session_id')
        .eq('payment_intent_id', intentId)
        .eq('status', 'pending')
        .maybeSingle();
      if (failedPay) {
        // Declined card leaves the session open — force-expire it so the dead
        // attempt can never accidentally be paid.
        await expireStripeSession(stripeSecretKey, (failedPay.stripe_session_id as string | null) ?? null);
        await admin.from('instructor_payments')
          .update({ status: 'failed', failure_reason: failureReason ?? 'Payment declined' })
          .eq('id', failedPay.id)
          .eq('status', 'pending');
        if (failedPay.subscription_id) {
          await admin.from('instructor_subscriptions')
            .update({ status: 'rejected', payment_status: 'failed' })
            .eq('id', failedPay.subscription_id)
            .eq('status', 'pending');
        }
      }
    }
  }

  // Opportunistic cleanup: expire pending rows older than 2 minutes for this
  // instructor so abandoned checkouts cannot linger in a grace state.
  if (instructorId) {
    const staleCutoff = new Date(Date.now() - 2 * 60 * 1000);
    await admin.from('instructor_subscriptions')
      .update({ status: 'rejected', payment_status: 'expired' })
      .eq('instructor_id', instructorId)
      .eq('status', 'pending')
      .lt('created_at', staleCutoff.toISOString());
  }

  return NextResponse.json({ received: true });
}
