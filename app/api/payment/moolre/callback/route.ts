import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { query } from '@/lib/db/pool';
import { confirmPayment, baseReference, moolreStatus } from '@/lib/payments';
import { checkRateLimit, getClientIdentifier, RATE_LIMITS } from '@/lib/rate-limit';

/**
 * Moolre payment callback. Payload (see docs.moolre.com/ai/payment-webhook.md):
 * {
 *   "status": 1, "code": "P01", "message": "Transaction Successful",
 *   "data": {
 *     "txstatus": 1,            // 1 successful, 0 pending, 2 failed
 *     "amount": "2", "transactionid": "42252702",
 *     "externalref": "ORD-1770330034217-ABCD2345-R1770330040000",
 *     "secret": "..."           // compared with MOOLRE_CALLBACK_SECRET
 *   }
 * }
 */

function secretMatches(got: unknown, expected: string): boolean {
    if (typeof got !== 'string') return false;
    const a = Buffer.from(got);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
}

async function readBody(req: Request): Promise<any> {
    const contentType = req.headers.get('content-type') || '';
    if (contentType.includes('application/json')) return req.json();
    if (contentType.includes('form')) return Object.fromEntries((await req.formData()).entries());
    const rawText = await req.text();
    try {
        return JSON.parse(rawText);
    } catch {
        return Object.fromEntries(new URLSearchParams(rawText).entries());
    }
}

export async function POST(req: Request) {
    const rateLimitResult = checkRateLimit(`callback:${getClientIdentifier(req)}`, RATE_LIMITS.callback);
    if (!rateLimitResult.success) {
        return NextResponse.json({ success: false, message: 'Too many requests' }, { status: 429 });
    }

    let body: any;
    try {
        body = await readBody(req);
    } catch {
        return NextResponse.json({ success: false, message: 'Invalid Request Body' }, { status: 400 });
    }
    if (typeof body?.data === 'string') {
        try { body.data = JSON.parse(body.data); } catch { /* leave as is */ }
    }
    const data = body?.data && typeof body.data === 'object' ? body.data : {};

    // A callback is only a hint. The payment is confirmed with Moolre's status
    // API, so a forged callback can't mark an order paid. The shared secret is
    // checked too; if Moolre's API is unreachable, only a callback with the
    // right secret is trusted.
    const expectedSecret = process.env.MOOLRE_CALLBACK_SECRET;
    const secretOk = !!expectedSecret && secretMatches(data.secret ?? body.secret, expectedSecret);
    if (!secretOk) console.warn('[Callback] Secret missing or different; confirming with Moolre instead.');

    const rawRef = String(data.externalref || body.externalref || '');
    if (!rawRef) {
        return NextResponse.json({ success: false, message: 'Missing order reference' }, { status: 400 });
    }
    const ref = baseReference(rawRef);
    const claimedStatus = String(data.txstatus ?? '');
    const claimedAmount = data.amount != null && data.amount !== '' ? Number(data.amount) : null;

    const api = await moolreStatus(rawRef).catch((e) => {
        console.warn('[Callback] Moolre status check failed:', e?.message);
        return null;
    });
    console.log('[Callback] ref:', ref, '| claimed:', claimedStatus, '| moolre:', api?.txstatus ?? 'unavailable');

    let paid: { transactionId: string; amount: number | null } | null = null;
    if (api) {
        if (api.paid && (!api.externalref || baseReference(api.externalref) === ref)) {
            paid = { transactionId: api.transactionId || String(data.transactionid || 'moolre'), amount: api.amount };
        }
    } else if (secretOk && (claimedStatus === '1' || (claimedStatus === '' && body.code === 'P01'))) {
        paid = {
            transactionId: String(data.transactionid || data.thirdpartyref || 'moolre-callback'),
            amount: Number.isFinite(claimedAmount as number) ? claimedAmount : null,
        };
    } else if (!secretOk) {
        // Ask Moolre to retry later rather than dropping a possibly real payment.
        return NextResponse.json({ success: false, message: 'Could not confirm payment yet' }, { status: 503 });
    }

    if (paid) {
        const result = await confirmPayment(ref, paid.transactionId, paid.amount);
        if (!result.ok) {
            console.error('[Callback] Not recorded:', ref, result.reason, result.message);
            const status = result.reason === 'not_found' ? 404 : result.reason === 'amount_mismatch' ? 400 : 500;
            return NextResponse.json({ success: false, message: result.message }, { status });
        }
        return NextResponse.json({ success: true, message: result.alreadyPaid ? 'Order already processed' : 'Payment recorded' });
    }

    const failed = api ? api.txstatus === 2 : secretOk && (claimedStatus === '2' || body.code === 'P02');
    if (failed) {
        // Keep the order's metadata (tracking number etc.) and never downgrade a paid order.
        await query(
            `UPDATE orders SET payment_status = 'failed',
               metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('moolre_reference', $1::text, 'failure_reason', $2::text),
               updated_at = now()
             WHERE order_number = $3 AND payment_status <> 'paid'`,
            [String(data.transactionid || 'moolre-callback'), String(data.reason || body.message || 'Payment failed').slice(0, 300), ref]
        ).catch((e) => console.error('[Callback] Could not record failure:', e.message));
        return NextResponse.json({ success: true, message: 'Failure recorded' });
    }

    return NextResponse.json({ success: true, message: 'Payment not confirmed' });
}

export async function GET() {
    return NextResponse.json({ message: 'Moolre callback endpoint ready' });
}
