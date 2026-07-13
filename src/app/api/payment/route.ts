import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const paymentId = searchParams.get('payment');
  const sessionId = searchParams.get('session_id');

  if (!paymentId && !sessionId) {
    return NextResponse.json({ error: 'Required: payment or session_id' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  let query = admin.from('instructor_payments')
    .select('*, profiles(full_name, email), instructor_subscriptions(id, plan_type, status, amount, start_date, end_date, payment_status)');

  if (paymentId) {
    query = query.eq('id', paymentId);
  } else if (sessionId) {
    query = query.eq('stripe_session_id', sessionId);
  }

  const { data, error } = await query.maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: 'Payment not found', details: error?.message }, { status: 404 });
  }

  const profile = data.profiles as Record<string, string> | null;
  const sub = data.instructor_subscriptions as Record<string, unknown> | null;

  return NextResponse.json({
    id: data.id,
    amount: data.amount,
    description: data.description,
    status: data.status,
    payment_method: data.payment_method,
    payment_date: data.payment_date,
    stripe_session_id: data.stripe_session_id,
    instructor: profile ? { name: profile.full_name, email: profile.email } : null,
    subscription: sub ? {
      id: sub.id,
      plan_type: sub.plan_type,
      status: sub.status,
      start_date: sub.start_date,
      end_date: sub.end_date,
      payment_status: sub.payment_status,
      amount: sub.amount,
    } : null,
  });
}
