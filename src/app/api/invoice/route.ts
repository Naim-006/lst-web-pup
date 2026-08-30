import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/** Server-rendered HTML invoice for a confirmed payment. */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const paymentId = searchParams.get('payment');
  const sessionId = searchParams.get('session_id');

  if (!paymentId && !sessionId) {
    return NextResponse.json({ error: 'Required: payment or session_id' }, { status: 400 });
  }

  let admin;
  try {
    admin = getSupabaseAdmin();
  } catch {
    return NextResponse.json({ error: 'Invoice service is not configured.' }, { status: 500 });
  }

  let payment: Record<string, unknown> | null = null;
  if (paymentId) {
    const { data } = await admin
      .from('instructor_payments')
      .select('*')
      .eq('id', paymentId)
      .maybeSingle();
    payment = data ?? null;
  } else {
    const { data } = await admin
      .from('instructor_payments')
      .select('*')
      .eq('stripe_session_id', sessionId!)
      .maybeSingle();
    payment = data ?? null;
  }

  if (!payment) {
    return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
  }

  const payStatus = String(payment.status ?? '');
  const completed = payStatus === 'completed' || payStatus === 'paid';
  if (!completed) {
    return NextResponse.json({
      error: 'Payment not completed',
      message: 'This invoice is only available once the payment has been confirmed.',
      status: payStatus,
    }, { status: 409 });
  }

  // Load subscription, plan and instructor name for the invoice.
  const subId = payment.subscription_id as string | null;
  const instructorId = payment.instructor_id as string | null;

  let planName = '';
  let subStatus = '';
  let startDate: string | null = null;
  let endDate: string | null = null;
  let planType = '';

  if (subId) {
    const { data: sub } = await admin
      .from('instructor_subscriptions')
      .select('id, plan_id, plan_type, status, start_date, end_date, payment_status, amount, plans:plan_id(name, price)')
      .eq('id', subId)
      .maybeSingle();
    if (sub) {
      planType = String(sub.plan_type ?? '');
      subStatus = String(sub.status ?? '');
      startDate = sub.start_date as string | null;
      endDate = sub.end_date as string | null;
      const plans = Array.isArray(sub.plans)
        ? sub.plans[0]
        : sub.plans;
      planName = String((plans as Record<string, unknown>)?.name ?? sub.plan_type ?? '');
    }
  }

  // An invoice must identify the customer. Payment ids are unguessable UUIDs,
  // so exposing the buyer's full name to whoever holds the link is acceptable
  // (email is intentionally NOT included).
  let instructorName = 'Lesson Tracker Pro Customer';
  if (instructorId) {
    const { data: prof } = await admin
      .from('profiles')
      .select('full_name')
      .eq('id', instructorId)
      .maybeSingle();
    if (prof?.full_name) instructorName = String(prof.full_name);
  }

  const amount = Number(payment.amount) || 0;
  const txnId = String(payment.txn_id || `TXN-${String(payment.id).slice(0, 8).toUpperCase()}`);
  const paidOn = payment.payment_date as string | null;
  const method = String(payment.payment_method ?? 'Stripe').toUpperCase();

  const fmt = (iso?: string | null): string => {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch {
      return iso;
    }
  };

  const esc = (s: string): string =>
    String(s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Invoice ${esc(txnId)} — Lesson Tracker Pro</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, Helvetica, sans-serif; color: #1b2a20; background: #f4f1ec; margin: 0; padding: 32px 16px; }
  .sheet { max-width: 760px; margin: 0 auto; background: #ffffff; border-radius: 18px; overflow: hidden; box-shadow: 0 12px 40px rgba(0,0,0,.08); }
  .head { background: linear-gradient(135deg, #FF6B35, #E8451A); color: #fff; padding: 34px 40px; display: flex; justify-content: space-between; align-items: center; gap: 20px; flex-wrap: wrap; }
  .head h1 { margin: 0; font-size: 26px; font-weight: 800; }
  .head p { margin: 6px 0 0; color: rgba(255,255,255,.85); font-size: 13px; }
  .badge { background: rgba(255,255,255,.18); border: 1px solid rgba(255,255,255,.35); padding: 6px 14px; border-radius: 999px; font-size: 13px; font-weight: 700; }
  .body { padding: 34px 40px 40px; }
  .grid { display: flex; justify-content: space-between; gap: 24px; flex-wrap: wrap; margin-bottom: 26px; }
  .cell h3 { margin: 0 0 4px; font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: #8a8178; }
  .cell div { font-size: 15px; font-weight: 600; color: #1b2a20; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0 26px; }
  th, td { text-align: left; padding: 12px 8px; font-size: 14px; }
  th { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #8a8178; border-bottom: 1px solid #e8e2da; }
  td { border-bottom: 1px solid #f1ede6; }
  .amount-col { text-align: right; font-weight: 700; color: #1b2a20; }
  .total { display: flex; justify-content: flex-end; }
  .total-box { min-width: 240px; }
  .total-row { display: flex; justify-content: space-between; padding: 10px 0; font-size: 14px; }
  .total-row.grand { border-top: 2px solid #1b2a20; font-size: 18px; font-weight: 800; color: #E8451A; padding-top: 14px; }
  .note { margin-top: 28px; padding: 14px 16px; background: #f7f3ee; border-radius: 12px; font-size: 12px; color: #6b6257; line-height: 1.6; }
  .foot { text-align: center; padding: 18px 40px 28px; font-size: 12px; color: #9a9184; border-top: 1px solid #f1ede6; }
  @media print { body { background: #fff; padding: 0; } .sheet { box-shadow: none; border-radius: 0; } }
</style>
</head>
<body>
  <div class="sheet">
    <div class="head">
      <div>
        <h1>Invoice</h1>
        <p>Lesson Tracker Pro · Subscription</p>
      </div>
      <div class="badge">Paid</div>
    </div>
    <div class="body">
      <div class="grid">
        <div class="cell">
          <h3>Billed to</h3>
          <div>${esc(instructorName)}</div>
        </div>
        <div class="cell">
          <h3>Invoice number</h3>
          <div>${esc(txnId)}</div>
        </div>
        <div class="cell">
          <h3>Invoice date</h3>
          <div>${esc(fmt(paidOn))}</div>
        </div>
      </div>
      <table>
        <thead>
          <tr><th>Description</th><th>Method</th><th class="amount-col">Amount</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>${esc(String(payment.description ?? (planName || 'Subscription payment')))}${subStatus ? ' <span style="color:#8a8178;font-weight:500">· ' + esc(subStatus) + '</span>' : ''}</td>
            <td>${esc(method)}</td>
            <td class="amount-col">\u00a3${amount.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>
      <div class="total">
        <div class="total-box">
          <div class="total-row"><span>Subtotal</span><span>\u00a3${amount.toFixed(2)}</span></div>
          <div class="total-row"><span>VAT</span><span>\u00a30.00</span></div>
          <div class="total-row grand"><span>Total</span><span>\u00a3${amount.toFixed(2)}</span></div>
        </div>
      </div>
      <div class="note">
        <strong>Plan:</strong> ${esc(planType || planName || 'Subscription')}
        ${startDate || endDate ? ` · Valid: ${esc(fmt(startDate))} — ${esc(fmt(endDate))}` : ''}
        <br>This is an electronically generated receipt for your Lesson Tracker Pro subscription. Keep it for your records.
      </div>
    </div>
    <div class="foot">Lesson Tracker Pro · Invoice ${esc(txnId)} · Generated automatically</div>
  </div>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex',
    },
  });
}