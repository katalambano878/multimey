// Coupon rules, applied on the server when an order is priced.

export interface CouponRow {
    id: string;
    code: string;
    type: 'percentage' | 'fixed_amount' | 'free_shipping';
    value: number | string;
    minimum_purchase: number | string | null;
    maximum_discount: number | string | null;
    usage_limit: number | null;
    usage_count: number | null;
    per_user_limit: number | null;
    start_date: string | null;
    end_date: string | null;
    is_active: boolean | null;
}

type Queryable = { query: (text: string, params?: any[]) => Promise<{ rows: any[] }> };

export class CouponError extends Error {}

export function normalizeCode(code: unknown): string {
    return typeof code === 'string' ? code.trim().toUpperCase().slice(0, 40) : '';
}

function money(n: number): number {
    return Math.round(n * 100) / 100;
}

/**
 * Check a code against the order and return the discount. Throws CouponError
 * with a shopper-facing message when it can't be used.
 */
export async function applyCoupon(
    db: Queryable,
    rawCode: string,
    subtotal: number,
    shipping: number,
    email: string | null,
    opts: { lock?: boolean } = {}
): Promise<{ code: string; discount: number; freeShipping: boolean }> {
    const code = normalizeCode(rawCode);
    if (!code) throw new CouponError('Enter a coupon code.');

    const { rows } = await db.query(
        `SELECT * FROM coupons WHERE upper(code) = $1 LIMIT 1${opts.lock ? ' FOR UPDATE' : ''}`,
        [code]
    );
    const c: CouponRow | undefined = rows[0];
    const now = Date.now();
    if (!c || !c.is_active) throw new CouponError('That coupon code is not valid.');
    if (c.start_date && new Date(c.start_date).getTime() > now) throw new CouponError('That coupon is not active yet.');
    if (c.end_date && new Date(c.end_date).getTime() < now) throw new CouponError('That coupon has expired.');
    if (c.usage_limit != null && (c.usage_count || 0) >= c.usage_limit) {
        throw new CouponError('That coupon has been fully used.');
    }
    const minimum = Number(c.minimum_purchase) || 0;
    if (subtotal < minimum) {
        throw new CouponError(`This coupon needs a minimum order of GH₵${minimum.toFixed(2)}.`);
    }
    if (email && c.per_user_limit != null && c.per_user_limit > 0) {
        const { rows: used } = await db.query(
            `SELECT count(*)::int AS n FROM orders
             WHERE lower(email) = lower($1) AND payment_status = 'paid'
               AND upper(metadata->>'coupon_code') = $2`,
            [email, code]
        );
        if ((used[0]?.n || 0) >= c.per_user_limit) throw new CouponError('You have already used this coupon.');
    }

    const value = Number(c.value) || 0;
    let discount = 0;
    let freeShipping = false;
    if (c.type === 'percentage') discount = (subtotal * Math.min(value, 100)) / 100;
    else if (c.type === 'fixed_amount') discount = value;
    else if (c.type === 'free_shipping') {
        freeShipping = true;
        discount = shipping;
    }
    const cap = c.maximum_discount != null && c.maximum_discount !== '' ? Number(c.maximum_discount) : null;
    if (cap != null && cap > 0 && !freeShipping) discount = Math.min(discount, cap);
    discount = money(Math.max(0, Math.min(discount, freeShipping ? shipping : subtotal)));
    return { code: c.code, discount, freeShipping };
}
