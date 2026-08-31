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

  // Server-side expiry sweep: any pending attempt whose 15-minute window has
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
        .update({ status: 'expired', failure_reason: 'Payment window (15 minutes) expired' })
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

  // Scheduled downgrades that took effect (start_date arrived) but were never
  // paid within their 3-day grace are dead. Close them cleanly so a
  // long-expired queued downgrade can never look like a pending attempt.
  {
    const queuedCutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const { data: overdueQueued } = await admin
      .from('instructor_subscriptions')
      .select('id')
      .eq('status', 'pending')
      .eq('queued', true)
      .lt('start_date', queuedCutoff);
    for (const s of overdueQueued ?? []) {
      await admin.from('instructor_subscriptions')
        .update({ status: 'cancelled', payment_status: 'expired' })
        .eq('id', s.id)
        .eq('status', 'pending')
        .eq('queued', true);
    }
  }

  // ---------------------------------------------------------------
  // checkout.session.completed (mode=subscription) — auto-pay onboarding.
  // The instructor set up a card on Stripe's hosted page; the subscription is
  // anchored to their current term end, so no money moves yet. We record the
  // Stripe ids and flip auto_pay on. The first invoice lands at the anchor.
  // ---------------------------------------------------------------
  if (event.type === 'checkout.session.completed' && session.mode === 'subscription') {
    const stripeSubId = (session.subscription as string) ?? null;
    const customerId = (session.customer as string) ?? null;
    if (instructorId && stripeSubId) {
      let targetId: string | null = null;
      {
        const { data: rows } = await admin
          .from('instructor_subscriptions')
          .select('id, status, end_date')
          .eq('instructor_id', instructorId)
          .eq('status', 'active')
          .order('created_at', { ascending: false });
        const nowDate = new Date();
        for (const r of rows ?? []) {
          const end = r.end_date ? new Date(r.end_date as string) : null;
          if (end && end.getTime() > nowDate.getTime()) { targetId = r.id as string; break; }
        }
      }
      if (targetId) {
        await admin.from('instructor_subscriptions')
          .update({
            auto_pay: true,
            stripe_customer_id: customerId,
            stripe_subscription_id: stripeSubId,
          })
          .eq('id', targetId)
          .eq('status', 'active');
      } else if (planId && instructorId) {
        // No active covering row yet (edge case): attach to the latest row.
        const { data: fallback } = await admin
          .from('instructor_subscriptions')
          .select('id')
          .eq('instructor_id', instructorId)
          .eq('plan_id', planId)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (fallback?.id) {
          await admin.from('instructor_subscriptions')
            .update({
              auto_pay: true,
              stripe_customer_id: customerId,
              stripe_subscription_id: stripeSubId,
            })
            .eq('id', fallback.id)
            .eq('status', 'active');
        }
      }
    }
    return NextResponse.json({ received: true, collected: 'subscription' });
  }

  // ---------------------------------------------------------------
  // invoice.paid — an auto-pay renewal was charged. Records a succeeded
  // payment in the transactions history and rolls the current term forward.
  // A late payment that lands after the 3-day grace cancelled the row
  // reactivates it (the money was genuinely received).
  // ---------------------------------------------------------------
  if (event.type === 'invoice.paid') {
    const invoice = event.data?.object ?? {};
    const stripeSubId = (invoice.subscription as string) ?? null;
    const invoiceId = invoice.id as string;
    const amount = (invoice.amount_paid ?? invoice.amount_due ?? 0) / 100;
    const paymentIntentId = (invoice.payment_intent as string) ?? null;

    if (stripeSubId) {
      const { data: subRow } = await admin
        .from('instructor_subscriptions')
        .select('*')
        .eq('stripe_subscription_id', stripeSubId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (subRow) {
        const subInstructorId = subRow.instructor_id as string;
        const { data: dupe } = await admin
          .from('instructor_payments')
          .select('id')
          .eq('stripe_invoice_id', invoiceId)
          .limit(1)
          .maybeSingle();
        if (!dupe) {
          let months = 1;
          let planName = (subRow.plan_type as string) ?? 'Subscription';
          const planIdVal = subRow.plan_id as string | null;
          if (planIdVal) {
            const planRes = await admin
              .from('subscription_plans')
              .select('duration_months, name')
              .eq('id', planIdVal)
              .maybeSingle();
            months = Number(planRes?.data?.['duration_months'] ?? 0) || 1;
            planName = (planRes?.data?.['name'] as string) ?? planName;
          }

          const txnId = `TXN-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
          const { error: payErr } = await admin
            .from('instructor_payments')
            .insert({
              instructor_id: subInstructorId,
              subscription_id: subRow.id,
              amount,
              payment_date: new Date().toISOString(),
              status: 'succeeded',
              payment_method: 'stripe',
              description: `${planName} auto-pay payment`,
              txn_id: txnId,
              payment_intent_id: paymentIntentId,
              stripe_invoice_id: invoiceId,
            });
          if (payErr) console.error('invoice.paid: failed to record payment:', payErr.message);

          const nowDate = new Date();
          const currentEnd = subRow.end_date ? new Date(subRow.end_date as string) : nowDate;
          const base = currentEnd.getTime() > nowDate.getTime() ? currentEnd : nowDate;
          const newEnd = new Date(base.getTime() + months * 30 * 24 * 60 * 60 * 1000);

          // If the row is active, roll the term forward. If the 3-day grace
          // force-cancelled it but the money still arrived (Stripe dunning),
          // reactivate — but never supersede a newer active term.
          if (subRow.status === 'active') {
            await admin.from('instructor_subscriptions')
              .update({ end_date: newEnd.toISOString(), payment_status: 'succeeded', amount })
              .eq('id', subRow.id)
              .eq('status', 'active');
          } else if (subRow.status === 'cancelled') {
            const { data: newerActives } = await admin
              .from('instructor_subscriptions')
              .select('id, end_date')
              .eq('instructor_id', subInstructorId)
              .eq('status', 'active');
            const hasActiveCoverage = (newerActives ?? []).some((r) => {
              const end = r.end_date ? new Date(r.end_date as string) : null;
              return end && end.getTime() > nowDate.getTime();
            });
            if (!hasActiveCoverage) {
              await admin.from('instructor_subscriptions')
                .update({ status: 'active', payment_status: 'succeeded', end_date: newEnd.toISOString(), amount })
                .eq('id', subRow.id)
                .eq('status', 'cancelled');
            }
          }
        }
      }
    }
    return NextResponse.json({ received: true, collected: 'invoice.paid' });
  }

  // invoice.payment_failed — an auto-pay charge could not be collected.
  // Stripe keeps retrying (dunning); access stays up to the same 3-day grace
  // boundary after the period ends, matching the manual-flow promise.
  if (event.type === 'invoice.payment_failed') {
    const invoice = event.data?.object ?? {};
    const stripeSubId = (invoice.subscription as string) ?? null;
    if (stripeSubId) {
      await admin.from('instructor_subscriptions')
        .update({ payment_status: 'past_due' })
        .eq('stripe_subscription_id', stripeSubId)
        .eq('status', 'active');
    }
    return NextResponse.json({ received: true, collected: 'invoice.payment_failed' });
  }

  // customer.subscription.* — syncs termination states. When a Stripe
  // subscription ends (turned off at period end, or Stripe gave up charging),
  // the row falls back to the normal manual mode: if the paid period is over,
  // the standard 3-day grace applies; if the period is still running
  // (unexpected mid-term life), it is cancelled now.
  if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
    const subObj = event.data?.object ?? {};
    const stripeSubId = (subObj.id as string) ?? null;
    const subStatus = (subObj.status as string) ?? '';
    if (stripeSubId) {
      const { data: subRow } = await admin
        .from('instructor_subscriptions')
        .select('id, status, end_date, auto_pay, payment_status')
        .eq('stripe_subscription_id', stripeSubId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (subRow) {
        const nowDate = new Date();
        const endDate = subRow.end_date ? new Date(subRow.end_date as string) : null;
        const periodOver = endDate != null && endDate.getTime() <= nowDate.getTime();

        if (subStatus === 'past_due' || subStatus === 'unpaid') {
          await admin.from('instructor_subscriptions')
            .update({ payment_status: 'past_due' })
            .eq('id', subRow.id)
            .eq('status', 'active');
        } else if (subStatus === 'canceled' || event.type === 'customer.subscription.deleted') {
          await admin.from('instructor_subscriptions')
            .update({ auto_pay: false })
            .eq('id', subRow.id);
          if (!periodOver) {
            await admin.from('instructor_subscriptions')
              .update({ status: 'cancelled', payment_status: subRow.payment_status ?? 'expired' })
              .eq('id', subRow.id)
              .eq('status', 'active');
          }
        } else if (event.type === 'customer.subscription.updated') {
          // Live subscription still running but marked to cancel at period
          // end (the disable-auto-pay flow already mirrored this).
          if (subObj.cancel_at_period_end === true) {
            await admin.from('instructor_subscriptions')
              .update({ auto_pay: false })
              .eq('id', subRow.id);
          }
        }
      }
    }
    return NextResponse.json({ received: true, collected: 'customer.subscription' });
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
