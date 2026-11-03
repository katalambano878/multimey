import { NextResponse } from 'next/server';
import { resolveCaller } from '@/lib/db/access';
import { checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';
import {
    createOrder,
    validateShipping,
    OrderError,
    PAYMENT_METHODS,
    type DeliveryMethod,
    type PaymentMethod,
} from '@/lib/orders';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Creates a pending order from the cart. Prices and totals are computed here. */
export async function POST(req: Request) {
    const limit = checkRateLimit(`orders:${getClientIdentifier(req)}`, { maxRequests: 10, windowSeconds: 60 });
    if (!limit.success) {
        return NextResponse.json({ error: 'Too many attempts. Please wait a minute and try again.' }, { status: 429 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
        return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
    }

    const deliveryMethod: DeliveryMethod = body.deliveryMethod === 'house_pickup' ? 'house_pickup' : 'doorstep';
    const paymentMethod = PAYMENT_METHODS.includes(body.paymentMethod) ? (body.paymentMethod as PaymentMethod) : 'moolre';

    try {
        const shipping = validateShipping(body.shipping);
        const caller = await resolveCaller(req);
        const { order } = await createOrder({
            items: body.items,
            shipping,
            deliveryMethod,
            paymentMethod,
            userId: caller.userId,
            couponCode: typeof body.couponCode === 'string' ? body.couponCode : null,
        });
        return NextResponse.json({
            orderId: order.id,
            orderNumber: order.order_number,
            subtotal: Number(order.subtotal),
            shipping: Number(order.shipping_total),
            discount: Number(order.discount_total),
            total: Number(order.total),
        });
    } catch (err) {
        if (err instanceof OrderError) {
            return NextResponse.json({ error: err.message }, { status: 400 });
        }
        console.error('[Orders] Create failed:', err);
        return NextResponse.json({ error: 'We could not place your order. Please try again.' }, { status: 500 });
    }
}
