import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  const admin = getSupabaseAdmin();

  const { data: configRow } = await admin
    .from('app_settings')
    .select('value')
    .eq('key', 'payment_config')
    .single();

  const config = (configRow?.value as Record<string, unknown>) ?? {};
  const webhookSecret = config['webhook_secret'] as string;

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
    const instructorId = meta.instructor_id;
    const planId = meta.plan_id;
    const planName = meta.plan_name ?? 'Subscription';
    const amount = session.amount_total ? session.amount_total / 100 : 0;
    const durationMonths = parseInt(meta.duration_months || '1', 10);

    // Try to update existing pending records from metadata first
    const existingPaymentId = meta.payment_id;
    const existingSubId = meta.subscription_id;

    if (existingPaymentId && existingSubId) {
      // Update existing pending records
      const now = new Date();
      const endDate = new Date(now);
      endDate.setMonth(endDate.getMonth() + durationMonths);

      await admin.from('instructor_subscriptions').update({
        payment_status: 'completed',
        end_date: endDate.toISOString(),
        status: 'active',
      }).eq('id', existingSubId);

      await admin.from('instructor_payments').update({
        status: 'completed',
        stripe_session_id: sessionId,
        payment_date: now.toISOString(),
      }).eq('id', existingPaymentId);
    } else if (instructorId) {
      // Fallback: create new records (legacy flow)
      const now = new Date();
      const endDate = new Date(now);
      endDate.setMonth(endDate.getMonth() + durationMonths);

      const { data: sub } = await admin.from('instructor_subscriptions').insert({
        instructor_id: instructorId,
        plan_id: planId || null,
        plan_type: planName,
        amount: amount,
        start_date: now.toISOString(),
        end_date: endDate.toISOString(),
        status: 'active',
        payment_status: 'paid',
      }).select('id').single();

      const txnId = `TXN-${now.toISOString().slice(2,10).replace(/-/g,'')}-${Math.random().toString(36).slice(2,6).toUpperCase()}`
      await admin.from('instructor_payments').insert({
        instructor_id: instructorId,
        subscription_id: sub?.id ?? null,
        amount: amount,
        payment_date: now.toISOString(),
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
