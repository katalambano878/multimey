import { NextResponse } from 'next/server';
import { query } from '@/lib/db/pool';
import { confirmPayment, moolreStatus } from '@/lib/payments';
import { checkRateLimit, getClientIdentifier, RATE_LIMITS } from '@/lib/rate-limit';
import { COURSE_REF_PREFIX } from '@/lib/course';

/**
 * Called from the order-success page after the shopper returns from Moolre.
 * The redirect proves nothing (anyone can open that URL), so the payment is
 * only recorded when Moolre's status API confirms it.
 */
export async function POST(req: Request) {
    const limit = checkRateLimit(`verify:${getClientIdentifier(req)}`, RATE_LIMITS.payment);
    if (!limit.success) {
        return NextResponse.json({ success: false, message: 'Too many requests' }, { status: 429 });
    }

    const body = await req.json().catch(() => ({}));
    const orderNumber = typeof body?.orderNumber === 'string' ? body.orderNumber.trim() : '';
    if (!orderNumber) {
        return NextResponse.json({ success: false, message: 'Missing orderNumber' }, { status: 400 });
    }

    let externalref: string | null = null;
    let paymentStatus: string | null = null;
    if (orderNumber.startsWith(COURSE_REF_PREFIX)) {
        const { rows } = await query(
            `SELECT payment_status, payment_reference FROM course_registrations WHERE registration_id = $1`,
            [orderNumber]
        );
        if (!rows[0]) return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 });
        paymentStatus = rows[0].payment_status;
        externalref = rows[0].payment_reference;
    } else {
        const { rows } = await query(
            `SELECT payment_status, metadata->>'moolre_externalref' AS ref FROM orders WHERE order_number = $1`,
            [orderNumber]
        );
        if (!rows[0]) return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 });
        paymentStatus = rows[0].payment_status;
        externalref = rows[0].ref;
    }

    if (paymentStatus === 'paid') {
        return NextResponse.json({ success: true, payment_status: 'paid', message: 'Order already paid' });
    }
    if (!externalref || !externalref.startsWith(orderNumber)) {
        return NextResponse.json({ success: false, payment_status: paymentStatus, message: 'Payment not yet confirmed' });
    }

    const status = await moolreStatus(externalref).catch((e) => {
        console.warn('[Verify] Moolre status check failed:', e.message);
        return null;
    });
    if (!status?.paid) {
        return NextResponse.json({ success: false, payment_status: paymentStatus, message: 'Payment not yet confirmed' });
    }

    const result = await confirmPayment(orderNumber, status.transactionId || externalref, status.amount);
    if (!result.ok) {
        console.error('[Verify] Not recorded:', orderNumber, result.reason, result.message);
        return NextResponse.json({ success: false, payment_status: paymentStatus, message: 'Payment could not be confirmed' });
    }
    return NextResponse.json({ success: true, status: 'processing', payment_status: 'paid', message: 'Payment verified' });
}
