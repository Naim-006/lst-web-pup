import { NextRequest, NextResponse } from 'next/server';
import { supabase, getSupabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const paymentId = searchParams.get('payment');
  const sessionId = searchParams.get('session_id');

  if (!paymentId && !sessionId) {
    return NextResponse.json({ error: 'Required: payment or session_id' }, { status: 400 });
  }

  // Try admin client first, fallback to anon
  let client = supabase;
  try {
    client = getSupabaseAdmin();
  } catch { /* fallback to anon */ }

  let data: Record<string, unknown> | null = null;

  if (paymentId) {
    const { data: d, error } = await client
      .from('instructor_payments')
      .select('id, amount, description, status, payment_method, payment_date, txn_id, instructor_id, subscription_id')
      .eq('id', paymentId)
      .maybeSingle();
    if (d) data = d;
  } else if (sessionId) {
    const { data: d, error } = await client
      .from('instructor_payments')
      .select('id, amount, description, status, payment_method, payment_date, txn_id, instructor_id, subscription_id')
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
    const { data: s } = await client
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
    payment_method: data.payment_method,
    payment_date: data.payment_date,
    txn_id: data.txn_id,
    subscription,
  });
}
