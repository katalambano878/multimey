import { NextResponse } from 'next/server';
import { chargeableAmount } from '@/lib/orders';
import { query } from '@/lib/db/pool';
import { checkRateLimit, getClientIdentifier, RATE_LIMITS } from '@/lib/rate-limit';

export async function POST(req: Request) {
    try {
        // Rate limiting
        const clientId = getClientIdentifier(req);
        const rateLimitResult = checkRateLimit(`payment:${clientId}`, RATE_LIMITS.payment);
        
        if (!rateLimitResult.success) {
            return NextResponse.json(
                { success: false, message: 'Too many requests. Please try again later.' },
                { 
                    status: 429,
                    headers: {
                        'X-RateLimit-Remaining': '0',
                        'X-RateLimit-Reset': rateLimitResult.resetIn.toString()
                    }
                }
            );
        }

        const body = await req.json().catch(() => ({}));
        const orderId = typeof body?.orderId === 'string' ? body.orderId.trim() : '';
        // Charge what the server stored for this order, never an amount sent by the browser.
        const charge = orderId ? await chargeableAmount(orderId) : null;
        if (!charge) {
          return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 });
        }
        if (charge.paid) {
          return NextResponse.json({ success: false, message: 'This order is already paid.' }, { status: 400 });
        }
        const amount = charge.amount;
        const customerEmail = charge.email;

        // Ensure environment variables are set
        if (!process.env.MOOLRE_API_USER || !process.env.MOOLRE_API_PUBKEY || !process.env.MOOLRE_ACCOUNT_NUMBER) {
            console.error('Missing Moolre credentials');
            return NextResponse.json({ success: false, message: 'Payment gateway configuration error' }, { status: 500 });
        }

        const requestUrl = new URL(req.url);
        // Remove trailing slash to prevent double-slash in URLs (e.g. //api/...)
        const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || requestUrl.origin).replace(/\/+$/, '');

        // Generate a unique external reference for Moolre
        // Append a retry suffix so re-payments don't clash with previous attempts
        const uniqueRef = `${orderId}-R${Date.now()}`;

        // Moolre Payload
        const payload = {
            type: 1,
            amount: amount.toString(), // Ensure string
            email: process.env.MOOLRE_MERCHANT_EMAIL || 'admin@example.com',
            externalref: uniqueRef,
            callback: `${baseUrl}/api/payment/moolre/callback`,
            redirect: charge.kind === 'course'
                ? `${baseUrl}/importation-class?registration=${encodeURIComponent(orderId)}&payment_success=true`
                : `${baseUrl}/order-success?order=${encodeURIComponent(orderId)}&payment_success=true`,
            reusable: "0",
            currency: "GHS",
            accountnumber: process.env.MOOLRE_ACCOUNT_NUMBER,
            metadata: {
                customer_email: customerEmail,
                original_order_number: orderId
            }
        };

        console.log('[Payment] Initiating for order:', orderId, '| Amount:', amount, '| Callback:', payload.callback);

        const response = await fetch('https://api.moolre.com/embed/link', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-USER': process.env.MOOLRE_API_USER,
                'X-API-PUBKEY': process.env.MOOLRE_API_PUBKEY
            },
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        console.log('[Payment] Response status:', result.status, '| Has URL:', !!result.data?.authorization_url);

        if (result.status === 1 && result.data?.authorization_url) {
            // Remember the reference so /verify can ask Moolre about this exact attempt.
            if (charge.kind === 'course') {
                await query(
                    `UPDATE course_registrations SET payment_reference = $1, updated_at = now() WHERE registration_id = $2`,
                    [uniqueRef, orderId]
                ).catch((e) => console.error('[Payment] Could not save course reference:', e.message));
            } else {
                await query(
                    `UPDATE orders SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('moolre_externalref', $1::text), updated_at = now() WHERE order_number = $2`,
                    [uniqueRef, orderId]
                ).catch((e) => console.error('[Payment] Could not save Moolre reference:', e.message));
            }
            return NextResponse.json({ success: true, url: result.data.authorization_url, reference: result.data.reference });
        } else {
            return NextResponse.json({ success: false, message: result.message || 'Failed to generate payment link' }, { status: 400 });
        }

    } catch (error: any) {
        console.error('Payment API Error:', error);
        return NextResponse.json({ success: false, message: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
