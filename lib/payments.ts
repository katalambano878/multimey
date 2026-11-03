// Marks orders and course registrations paid once a payment provider has
// confirmed the money arrived. Shared by the Moolre callback and verify routes.

import { supabaseAdmin } from './supabase-admin';
import { query } from './db/pool';
import { sendOrderConfirmation } from './notifications';
import { COURSE_REF_PREFIX } from './course';

/** "ORD-123-R1770000000" (one payment attempt) -> "ORD-123" */
export function baseReference(ref: string): string {
    return ref.replace(/-R\d+$/, '');
}

export interface MoolreStatus {
    paid: boolean;
    /** Moolre txstatus: 1 paid, 0 pending, 2 failed, 3 not found. */
    txstatus: number | null;
    amount: number | null;
    transactionId: string | null;
    externalref: string | null;
}

/** Ask Moolre whether the payment attempt with this externalref succeeded. */
export async function moolreStatus(externalref: string): Promise<MoolreStatus | null> {
    const user = process.env.MOOLRE_API_USER;
    const pubkey = process.env.MOOLRE_API_PUBKEY;
    const account = process.env.MOOLRE_ACCOUNT_NUMBER;
    if (!user || !pubkey || !account) return null;

    const res = await fetch('https://api.moolre.com/open/transact/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-USER': user, 'X-API-PUBKEY': pubkey },
        body: JSON.stringify({ type: 1, idtype: 1, id: externalref, accountnumber: account }),
        cache: 'no-store',
    });
    const json: any = await res.json().catch(() => null);
    if (!res.ok || !json) return null;
    const data = json.data || {};
    const txstatus = data.txstatus != null && data.txstatus !== '' ? Number(data.txstatus) : null;
    return {
        paid: txstatus === 1,
        txstatus,
        amount: data.amount != null && data.amount !== '' ? Number(data.amount) : null,
        transactionId: data.transactionid ? String(data.transactionid) : null,
        externalref: data.externalref ? String(data.externalref) : null,
    };
}

export type ConfirmResult =
    | { ok: true; alreadyPaid: boolean }
    | { ok: false; reason: 'not_found' | 'amount_mismatch' | 'db_error'; message: string };

/**
 * Record a confirmed payment. `amountPaid` is what the provider says was paid;
 * when it is lower than the amount due the payment is not accepted.
 */
export async function confirmPayment(
    ref: string,
    providerReference: string,
    amountPaid: number | null
): Promise<ConfirmResult> {
    const base = baseReference(ref);

    if (base.startsWith(COURSE_REF_PREFIX)) {
        const { rows } = await query(
            `SELECT amount, payment_status FROM course_registrations WHERE registration_id = $1`,
            [base]
        );
        if (!rows[0]) return { ok: false, reason: 'not_found', message: 'Registration not found' };
        if (rows[0].payment_status === 'paid') return { ok: true, alreadyPaid: true };
        if (amountPaid != null && amountPaid + 0.01 < Number(rows[0].amount)) {
            return { ok: false, reason: 'amount_mismatch', message: `Paid ${amountPaid}, due ${rows[0].amount}` };
        }
        await query(
            `UPDATE course_registrations SET payment_status = 'paid', payment_reference = $1, updated_at = now()
             WHERE registration_id = $2`,
            [providerReference, base]
        );
        return { ok: true, alreadyPaid: false };
    }

    const { data: order } = await supabaseAdmin
        .from('orders')
        .select('id, payment_status, total')
        .eq('order_number', base)
        .maybeSingle();
    if (!order) return { ok: false, reason: 'not_found', message: 'Order not found' };
    if (order.payment_status === 'paid') return { ok: true, alreadyPaid: true };
    if (amountPaid != null && amountPaid + 0.01 < Number(order.total)) {
        await query(
            `UPDATE orders SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
               'payment_amount_mismatch', jsonb_build_object('paid', $1::numeric, 'reference', $2::text)
             ) WHERE id = $3`,
            [amountPaid, providerReference, order.id]
        ).catch(() => {});
        return { ok: false, reason: 'amount_mismatch', message: `Paid ${amountPaid}, due ${order.total}` };
    }

    // Callback and verify can race; only the caller that claims the order records it.
    const claim = await query(
        `UPDATE orders SET metadata = COALESCE(metadata, '{}'::jsonb) || '{"payment_confirming": true}'::jsonb
         WHERE id = $1 AND payment_status <> 'paid' AND NOT (COALESCE(metadata, '{}'::jsonb) ? 'payment_confirming')
         RETURNING id`,
        [order.id]
    );
    if (claim.rowCount === 0) return { ok: true, alreadyPaid: true };

    const { data: orderJson, error } = await supabaseAdmin.rpc('mark_order_paid', {
        order_ref: base,
        moolre_ref: providerReference,
    });
    await query(`UPDATE orders SET metadata = metadata - 'payment_confirming' WHERE id = $1`, [order.id]).catch(() => {});
    if (error || !orderJson) {
        return { ok: false, reason: 'db_error', message: error?.message || 'Order update failed' };
    }

    const couponCode = orderJson.metadata?.coupon_code;
    if (couponCode) {
        await query(
            `UPDATE coupons SET usage_count = COALESCE(usage_count, 0) + 1, updated_at = now() WHERE upper(code) = upper($1)`,
            [couponCode]
        ).catch((e) => console.error('[Payments] Coupon usage update failed:', e.message));
    }

    if (orderJson.email) {
        try {
            await supabaseAdmin.rpc('update_customer_stats', {
                p_customer_email: orderJson.email,
                p_order_total: orderJson.total,
            });
        } catch (err: any) {
            console.error('[Payments] Customer stats failed:', err?.message);
        }
    }
    try {
        await sendOrderConfirmation(orderJson);
    } catch (err: any) {
        console.error('[Payments] Confirmation notification failed:', err?.message);
    }
    return { ok: true, alreadyPaid: false };
}
