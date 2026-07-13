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
      .select('*')
      .eq('id', paymentId)
      .maybeSingle();
    if (d) data = d;
  } else if (sessionId) {
    const { data: d, error } = await client
      .from('instructor_payments')
      .select('*')
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

  // Fetch profile and subscription separately to avoid FK issues
  let profile = null;
  let subscription = null;

  if (data.instructor_id) {
    const { data: p } = await client
      .from('profiles')
      .select('full_name, email')
      .eq('id', data.instructor_id)
      .maybeSingle();
    profile = p;
  }

  if (data.subscription_id) {
    const { data: s } = await client
      .from('instructor_subscriptions')
      .select('id, plan_type, status, start_date, end_date, payment_status, amount')
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
    stripe_session_id: data.stripe_session_id,
    txn_id: data.txn_id,
    instructor: profile,
    subscription,
  });
}
