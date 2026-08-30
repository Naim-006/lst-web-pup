import type { SupabaseClient } from '@supabase/supabase-js';

export type ActivationResult = {
  activated: boolean;
  alreadyActive: boolean;
  subscription?: Record<string, unknown> | null;
  skipped?: 'not_pending' | 'not_found';
};

export type ActivationInput = {
  subscriptionId: string;
  instructorId: string;
  durationMonths: number;
  paymentId?: string;
  stripeSessionId?: string;
  paymentIntentId?: string;
  amount?: number;
};

async function markPaymentCompleted(
  admin: SupabaseClient,
  paymentId: string,
  stripeSessionId?: string,
  paymentIntentId?: string,
): Promise<void> {
  const update: Record<string, unknown> = {
    status: 'succeeded',
    payment_date: new Date().toISOString(),
  };
  if (stripeSessionId) {
    update.stripe_session_id = stripeSessionId;
  }
  if (paymentIntentId) {
    update.payment_intent_id = paymentIntentId;
  }
  // Only a still-pending attempt can become succeeded. A superseded or
  // expired attempt is never resurrected by a late confirmation.
  await admin.from('instructor_payments').update(update).eq('id', paymentId).eq('status', 'pending');
}

/**
 * Idempotent subscription activation shared by the Stripe webhook and the
 * payment-confirm route. Only activates a subscription that is still PENDING
 * (a superseded / expired / rejected attempt can never be brought back to
 * life). Grants a fresh period from now based on the plan duration, marks the
 * payment succeeded, and ends any other active subscription so only one plan
 * is current at a time.
 */
export async function activateSubscription(
  admin: SupabaseClient,
  input: ActivationInput,
): Promise<ActivationResult> {
  const { data: sub } = await admin
    .from('instructor_subscriptions')
    .select('*')
    .eq('id', input.subscriptionId)
    .maybeSingle();

  if (!sub) {
    return { activated: false, alreadyActive: false, subscription: null };
  }

  const endDate = sub.end_date ? new Date(sub.end_date as string).getTime() : 0;
  const alreadyActive = sub.status === 'active' && endDate > Date.now();

  if (alreadyActive) {
    if (input.paymentId) {
      await markPaymentCompleted(admin, input.paymentId, input.stripeSessionId, input.paymentIntentId);
    }
    return { activated: false, alreadyActive: true, subscription: sub };
  }

  // A non-pending subscription (superseded/cancelled/expired/rejected) must
  // never be activated by this stale confirmation.
  if (sub.status !== 'pending') {
    return { activated: false, alreadyActive: false, subscription: sub, skipped: 'not_pending' };
  }

  const start = new Date();
  // A plan switch keeps the provisional end date (rest of the already paid
  // current term) that create-checkout-session set for it. Only a fresh
  // purchase gets a brand-new full term from payment time.
  const isSwitch = Boolean(sub.replaces_subscription_id);
  const end = isSwitch && sub.end_date
    ? new Date(sub.end_date as string)
    : new Date(start.getTime() + input.durationMonths * 30 * 24 * 60 * 60 * 1000);

  const { data: activated } = await admin.from('instructor_subscriptions')
    .update({
      status: 'active',
      payment_status: 'succeeded',
      start_date: start.toISOString(),
      end_date: end.toISOString(),
      ...(typeof input.amount === 'number' ? { amount: input.amount } : {}),
    })
    .eq('id', input.subscriptionId)
    .eq('status', 'pending')
    .select('*')
    .maybeSingle();

  if (!activated) {
    // Race with a newer checkout already closing this attempt.
    return { activated: false, alreadyActive: false, subscription: sub, skipped: 'not_pending' };
  }

  // Only one current plan at a time. Also clear any older revoked/rejected
  // rows so a newly purchased subscription takes over and the user is no
  // longer blocked by a stale state.
  await admin.from('instructor_subscriptions')
    .update({ status: 'cancelled' })
    .eq('instructor_id', input.instructorId)
    .neq('id', input.subscriptionId)
    .in('status', ['active', 'revoked', 'rejected']);

  if (input.paymentId) {
    await markPaymentCompleted(admin, input.paymentId, input.stripeSessionId, input.paymentIntentId);
  }

  return { activated: true, alreadyActive: false, subscription: activated };
}

/**
 * Legacy fallback: when a checkout carries no subscription_id (older flow),
 * create an active subscription from the plan metadata.
 */
export async function createActiveSubscription(
  admin: SupabaseClient,
  input: {
    instructorId: string;
    planId: string;
    planName?: string;
    durationMonths: number;
    amount: number;
  },
): Promise<{ id: string } | null> {
  const start = new Date();
  const end = new Date(start.getTime() + input.durationMonths * 30 * 24 * 60 * 60 * 1000);

  const { data } = await admin.from('instructor_subscriptions').insert({
    instructor_id: input.instructorId,
    plan_id: input.planId,
    plan_type: input.planName ?? 'Subscription',
    amount: input.amount,
    status: 'active',
    payment_status: 'succeeded',
    start_date: start.toISOString(),
    end_date: end.toISOString(),
    auto_pay: false,
  }).select('id').single();

  if (data) {
    await admin.from('instructor_subscriptions')
      .update({ status: 'cancelled' })
      .eq('instructor_id', input.instructorId)
      .neq('id', data.id)
      .in('status', ['active', 'revoked', 'rejected']);
  }

  return data ? { id: data.id } : null;
}
