import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { activateSubscription, createActiveSubscription } from '@/lib/activateSubscription';

export async function POST(req: NextRequest) {
  const admin = getSupabaseAdmin();

  const { data: configRow } = await admin
    .from('app_settings')
    .select('value')
    .eq('key', 'payment_config')
    .single();

  const config = (configRow?.value as Record<string, unknown>) ?? {};
  const webhookSecret = config['stripe_webhook_secret'] as string;

  const body = await req.text();
  const sig = req.headers.get('stripe-signature') || '';

  if (webhookSecret) {
    const crypto = await import('crypto');
    const parts = sig.split(',');
    let timestamp = '';
    let signature = '';
    for (const part of parts) {
      const [k, v] = part.split('=');
      if (k === 't') timestamp = v;
      if (k === 'v1') signature = v;
    }
    const payload = `${timestamp}.${body}`;
    const expected = crypto.createHmac('sha256', webhookSecret).update(payload).digest('hex');
    if (expected !== signature) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }
  }

  let event;
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const meta = session.metadata ?? {};
    const sessionId = session.id as string;
    const subscriptionId = meta.subscription_id;
    const paymentId = meta.payment_id;
    const instructorId = meta.instructor_id;
    const planId = meta.plan_id;
    const planName = meta.plan_name ?? 'Subscription';
    const durationMonths = Number(meta.duration_months) || 1;
    const amount = session.amount_total ? session.amount_total / 100 : 0;

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

  return NextResponse.json({ received: true });
}
