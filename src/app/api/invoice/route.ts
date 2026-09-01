import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import PDFDocument from 'pdfkit';

export const dynamic = 'force-dynamic';

const ORANGE = '#FF6B35';
const ORANGE_DARK = '#E8451A';
const INK = '#1b2a20';
const MUTED = '#8a8178';
const NOTE = '#6b6257';
const LINE = '#e8e2da';
const FOOT = '#9a9184';
const PAGE_WIDTH = 595.28; // A4 points

function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return String(iso);
  }
}

interface InvoiceData {
  txnId: string;
  instructorName: string;
  paidOn: string | null;
  description: string;
  method: string;
  amount: number;
  planType: string;
  planName: string;
  subStatus: string;
  validRange: string;
}

/** Server-side PDF invoice for a confirmed payment. */
function buildInvoicePdf(data: InvoiceData): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 50,
    info: { Title: `Invoice ${data.txnId}`, Author: 'Lesson Tracker Pro' },
  });

  const chunks: Buffer[] = [];
  doc.on('data', (c) => chunks.push(c));

  const contentWidth = PAGE_WIDTH - 100;
  const rightEdge = PAGE_WIDTH - 50;
  const amountStr = `\u00a3${data.amount.toFixed(2)}`;

  // Header band
  const gradient = doc.linearGradient(0, 0, PAGE_WIDTH, 0) as any;
  gradient.stop(0, ORANGE).stop(1, ORANGE_DARK);
  doc.rect(0, 0, PAGE_WIDTH, 132).fill(gradient);

  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(30).text('Invoice', 50, 42);
  doc.fillColor('#FFFFFF').fillOpacity(0.85).font('Helvetica').fontSize(12.5).text('Lesson Tracker Pro \u00b7 Subscription', 50, 86);
  doc.fillOpacity(1);

  // PAID badge
  doc.save();
  doc.roundedRect(rightEdge - 116, 48, 116, 40, 20).fillOpacity(0.16).fill('#FFFFFF');
  doc.restore();
  doc.lineWidth(1.2).strokeOpacity(0.5).roundedRect(rightEdge - 116, 48, 116, 40, 20).stroke('#FFFFFF');
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(12).text('PAID', rightEdge - 116, 62, { width: 116, align: 'center' });

  let y = 132 + 38;

  // Billed to / Invoice number / Invoice date
  const cells: Array<[string, string, number, number]> = [
    ['Billed to', data.instructorName, 50, 175],
    ['Invoice number', data.txnId, 235, 165],
    ['Invoice date', fmtDate(data.paidOn), 410, 140],
  ];
  for (const [label, value, x, w] of cells) {
    doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(10).text(label.toUpperCase(), x, y);
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(15).text(value, x, y + 16, { width: w });
  }
  y += 74;

  // Table header
  doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(10);
  doc.text('DESCRIPTION', 50, y);
  doc.text('METHOD', 330, y);
  doc.text('AMOUNT', rightEdge - doc.widthOfString('AMOUNT'), y);
  doc.moveTo(50, y + 20).lineTo(rightEdge, y + 20).lineWidth(1).strokeColor(LINE).stroke();
  y += 34;

  // Line item
  doc.fillColor(MUTED).font('Helvetica').fontSize(12.5);
  doc.text(data.method, 330, y);
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(12.5);
  doc.text(amountStr, rightEdge - doc.widthOfString(amountStr), y);

  doc.fillColor(INK).font('Helvetica').fontSize(12.5);
  const descText = data.description + (data.subStatus ? ` \u00b7 ${data.subStatus}` : '');
  const descH = doc.heightOfString(descText, { width: 260 });
  doc.text(descText, 50, y, { width: 260 });
  y += Math.max(descH, 18) + 8;

  doc.moveTo(50, y).lineTo(rightEdge, y).lineWidth(1).strokeColor(LINE).stroke();
  y += 28;

  // Totals
  doc.fillColor(INK).font('Helvetica').fontSize(12.5);
  doc.text('Subtotal', 330, y);
  doc.text(amountStr, rightEdge - doc.widthOfString(amountStr), y);
  y += 24;
  doc.text('VAT', 330, y);
  doc.text('\u00a30.00', rightEdge - doc.widthOfString('\u00a30.00'), y);
  y += 28;

  doc.moveTo(330, y - 8).lineTo(rightEdge, y - 8).lineWidth(2).strokeColor(INK).stroke();
  doc.fillColor(ORANGE_DARK).font('Helvetica-Bold').fontSize(18).text('Total', 330, y - 4);
  doc.text(amountStr, rightEdge - doc.widthOfString(amountStr), y - 4);
  y += 48;

  // Note
  const noteLines: string[] = [];
  const planLabel = data.planType || data.planName;
  if (planLabel) noteLines.push(`Plan: ${planLabel}`);
  if (data.validRange) noteLines.push(`Valid: ${data.validRange}`);
  noteLines.push('This is an electronically generated receipt for your Lesson Tracker Pro subscription. Keep it for your records.');
  const noteText = noteLines.join('\n');
  const noteW = contentWidth - 28;
  const noteH = doc.heightOfString(noteText, { width: noteW }) + 26;
  doc.save().roundedRect(50, y, contentWidth, noteH, 12).fill('#f7f3ee').restore();
  doc.fillColor(NOTE).font('Helvetica').fontSize(11).text(noteText, 64, y + 13, { width: noteW });

  // Footer
  doc.moveTo(50, doc.page.height - 62).lineTo(rightEdge, doc.page.height - 62).lineWidth(0.75).strokeColor('#f1ede6').stroke();
  doc.fillColor(FOOT).font('Helvetica').fontSize(11)
    .text(`Lesson Tracker Pro \u00b7 Invoice ${data.txnId} \u00b7 Generated automatically`, 0, doc.page.height - 46, { width: PAGE_WIDTH, align: 'center' });

  const done = new Promise<Buffer>((resolve, reject) => {
    doc.once('end', () => resolve(Buffer.concat(chunks)));
    doc.once('error', reject);
  });
  doc.end();
  return done;
}

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
  const completed = payStatus === 'completed' || payStatus === 'paid' || payStatus === 'succeeded';
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

  const txnId = String(payment.txn_id || `TXN-${String(payment.id).slice(0, 8).toUpperCase()}`);
  const validRange = startDate || endDate ? `${fmtDate(startDate)} — ${fmtDate(endDate)}` : '';

  try {
    const pdf = await buildInvoicePdf({
      txnId,
      instructorName,
      paidOn: payment.payment_date as string | null,
      description: String(payment.description ?? (planName || 'Subscription payment')),
      method: String(payment.payment_method ?? 'Stripe').toUpperCase(),
      amount: Number(payment.amount) || 0,
      planType,
      planName,
      subStatus,
      validRange,
    });

    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Invoice-${txnId}.pdf"`,
        'Content-Length': String(pdf.length),
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Could not generate the invoice PDF.' }, { status: 500 });
  }
}