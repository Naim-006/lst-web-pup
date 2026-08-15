import type { SupabaseClient } from '@supabase/supabase-js';

export type ActivationResult = {
  activated: boolean;
  alreadyActive: boolean;
  subscription?: Record<string, unknown> | null;
};

export type ActivationInput = {
  subscriptionId: string;
  instructorId: string;
  durationMonths: number;
  paymentId?: string;
  stripeSessionId?: string;
};

async function markPaymentCompleted(
  admin: SupabaseClient,
  paymentId: string,
  stripeSessionId?: string,
): Promise<void> {
  const update: Record<string, unknown> = {
    status: 'completed',
    payment_date: new Date().toISOString(),
  };
  if (stripeSessionId) {
    update.stripe_session_id = stripeSessionId;
  }
  await admin.from('instructor_payments').update(update).eq('id', paymentId);
}

/**
 * Idempotent subscription activation shared by the Stripe webhook and the
 * payment-confirm route. Only activates a subscription that is not already
 * active. Grants a fresh period from now based on the plan duration, marks
 * the payment completed, and ends any other active subscription so only one
 * plan is current at a time.
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
      await markPaymentCompleted(admin, input.paymentId, input.stripeSessionId);
    }
    return { activated: false, alreadyActive: true, subscription: sub };
  }

  const start = new Date();
  const end = new Date(start.getTime() + input.durationMonths * 30 * 24 * 60 * 60 * 1000);

  await admin.from('instructor_subscriptions').update({
    status: 'active',
    payment_status: 'completed',
    start_date: start.toISOString(),
    end_date: end.toISOString(),
  }).eq('id', input.subscriptionId);

  // Only one current plan at a time. Also clear any older revoked/rejected
  // rows so a newly purchased subscription takes over and the user is no
  // longer blocked by a stale state.
  await admin.from('instructor_subscriptions')
    .update({ status: 'cancelled' })
    .eq('instructor_id', input.instructorId)
    .neq('id', input.subscriptionId)
    .in('status', ['active', 'revoked', 'rejected']);

  if (input.paymentId) {
    await markPaymentCompleted(admin, input.paymentId, input.stripeSessionId);
  }

  return { activated: true, alreadyActive: false, subscription: sub };
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
    payment_status: 'completed',
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
