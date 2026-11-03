import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db/pool';
import { applyCoupon, CouponError } from '@/lib/coupons';
import { checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Preview a coupon at checkout. The order endpoint re-checks it when the order is placed. */
export async function POST(req: Request) {
    const limit = checkRateLimit(`coupon:${getClientIdentifier(req)}`, { maxRequests: 15, windowSeconds: 300 });
    if (!limit.success) {
        return NextResponse.json({ error: 'Too many attempts. Please wait a few minutes.' }, { status: 429 });
    }
    const body = await req.json().catch(() => ({}));
    const subtotal = Number(body?.subtotal);
    const shipping = Number(body?.shipping);
    if (!Number.isFinite(subtotal) || subtotal < 0 || !Number.isFinite(shipping) || shipping < 0) {
        return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
    }
    try {
        const email = typeof body?.email === 'string' && body.email.includes('@') ? body.email.trim() : null;
        const result = await applyCoupon(getPool(), body?.code, subtotal, shipping, email);
        return NextResponse.json(result);
    } catch (err) {
        if (err instanceof CouponError) return NextResponse.json({ error: err.message }, { status: 400 });
        console.error('[Coupons] Validate failed:', err);
        return NextResponse.json({ error: 'Could not check that code.' }, { status: 500 });
    }
}
