import { NextResponse } from 'next/server';
import { query } from '@/lib/db/pool';
import { resolveCaller } from '@/lib/db/access';
import { checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Order status for /order-tracking (linked from order SMS). The order number
 * alone shows progress and items; the full delivery address and contact
 * details are only returned to the order's owner or with its email.
 */
export async function GET(req: Request) {
    const limit = checkRateLimit(`track:${getClientIdentifier(req)}`, { maxRequests: 20, windowSeconds: 60 });
    if (!limit.success) {
        return NextResponse.json({ error: 'Too many lookups. Please wait a minute.' }, { status: 429 });
    }

    const url = new URL(req.url);
    const orderNumber = (url.searchParams.get('order') || '').trim();
    const email = (url.searchParams.get('email') || '').trim().toLowerCase();
    if (!orderNumber) return NextResponse.json({ error: 'Enter your order number.' }, { status: 400 });

    const { rows } = await query(
        `SELECT id, order_number, user_id, email, status, payment_status, total, subtotal, shipping_total,
                shipping_method, shipping_address, created_at, metadata
         FROM orders WHERE order_number = $1 LIMIT 1`,
        [orderNumber]
    );
    const order = rows[0];
    if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });

    if (email && order.email?.toLowerCase() !== email) {
        return NextResponse.json({ error: 'The email address does not match this order.' }, { status: 404 });
    }
    const caller = await resolveCaller(req);
    const full = (!!email && order.email?.toLowerCase() === email) || (!!caller.userId && caller.userId === order.user_id) || caller.isStaff;

    const { rows: items } = await query(
        `SELECT oi.id, oi.product_name, oi.variant_name, oi.quantity, oi.unit_price, oi.metadata,
                (SELECT url FROM product_images pi WHERE pi.product_id = oi.product_id ORDER BY position NULLS LAST LIMIT 1) AS image
         FROM order_items oi WHERE oi.order_id = $1`,
        [order.id]
    );

    const address = order.shipping_address || {};
    const meta = order.metadata || {};
    return NextResponse.json({
        order_number: order.order_number,
        status: order.status,
        payment_status: order.payment_status,
        total: Number(order.total),
        subtotal: Number(order.subtotal),
        shipping_total: Number(order.shipping_total),
        shipping_method: order.shipping_method,
        created_at: order.created_at,
        metadata: {
            tracking_number: meta.tracking_number || null,
            payment_verified_at: meta.payment_verified_at || null,
        },
        shipping_address: full
            ? address
            : { firstName: address.firstName || '', city: address.city || '', region: address.region || '' },
        order_items: items.map((i) => ({
            id: i.id,
            product_name: i.product_name,
            variant_name: i.variant_name,
            quantity: i.quantity,
            unit_price: Number(i.unit_price),
            metadata: { preorder_shipping: i.metadata?.preorder_shipping || null },
            products: { product_images: i.image ? [{ url: i.image }] : [] },
        })),
    });
}
