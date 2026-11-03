import { NextResponse } from 'next/server';
import { chargeableAmount } from '@/lib/orders';
import { checkRateLimit, getClientIdentifier, RATE_LIMITS } from '@/lib/rate-limit';

/**
 * Create a PayPal order and return the approval URL for redirect.
 * Uses PayPal Orders v2 API. Currency defaults to USD (PayPal widely supports it).
 */
async function getPayPalAccessToken(): Promise<string> {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !secret) {
    throw new Error('Missing PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET');
  }
  const base = process.env.PAYPAL_API_BASE_URL || 'https://api-m.sandbox.paypal.com';
  const auth = Buffer.from(`${clientId}:${secret}`).toString('base64');
  const res = await fetch(`${base}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${auth}`,
    },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json();
  if (!data.access_token) {
    throw new Error(data.error_description || 'Failed to get PayPal access token');
  }
  return data.access_token;
}

export async function POST(req: Request) {
  try {
    const clientId = getClientIdentifier(req);
    const rateLimitResult = checkRateLimit(`payment:${clientId}`, RATE_LIMITS.payment);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { success: false, message: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': rateLimitResult.resetIn.toString() } }
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

    const requestUrl = new URL(req.url);
    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || requestUrl.origin).replace(/\/+$/, '');

    const currency = (process.env.PAYPAL_CURRENCY || 'USD').toUpperCase();
    const value = Number(amount).toFixed(2);
    if (Number(value) < 0.01) {
      return NextResponse.json({ success: false, message: 'Amount too small' }, { status: 400 });
    }

    const token = await getPayPalAccessToken();
    const base = process.env.PAYPAL_API_BASE_URL || 'https://api-m.sandbox.paypal.com';

    const createPayload = {
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: orderId,
          description: `Order ${orderId}`,
          amount: {
            currency_code: currency,
            value,
          },
          payee: process.env.PAYPAL_MERCHANT_ID ? { merchant_id: process.env.PAYPAL_MERCHANT_ID } : undefined,
        },
      ],
      application_context: {
        brand_name: process.env.NEXT_PUBLIC_SITE_NAME || 'MultiMey Supplies',
        landing_page: 'LOGIN',
        user_action: 'PAY_NOW',
        return_url: `${baseUrl}/api/payment/paypal/capture?order=${encodeURIComponent(orderId)}`,
        cancel_url: `${baseUrl}/pay/${orderId}?canceled=1`,
      },
    };

    const createRes = await fetch(`${base}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'PayPal-Request-Id': `order-${orderId}-${Date.now()}`,
      },
      body: JSON.stringify(createPayload),
    });

    const createData = await createRes.json();

    if (createRes.status !== 201 || !createData.id) {
      console.error('[PayPal] Create order failed:', createData);
      return NextResponse.json(
        { success: false, message: createData.message || createData.details?.[0]?.description || 'Failed to create PayPal order' },
        { status: 400 }
      );
    }

    const approvalLink = createData.links?.find((l: { rel: string }) => l.rel === 'approve');
    if (!approvalLink?.href) {
      return NextResponse.json({ success: false, message: 'No approval URL from PayPal' }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      url: approvalLink.href,
      paypalOrderId: createData.id,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    console.error('PayPal API Error:', error);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
