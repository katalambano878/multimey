// Server-side order creation. Prices, shipping and totals come from the
// database, never from the browser's cart.

import { randomBytes } from 'crypto';
import { getPool } from './db/pool';
import { applyCoupon, CouponError } from './coupons';

export const DEFAULT_SHIPPING = { doorstep: 50, house_pickup: 0 } as const;
export type DeliveryMethod = keyof typeof DEFAULT_SHIPPING;
export const PAYMENT_METHODS = ['moolre', 'paystack', 'stripe', 'paypal'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export interface OrderItemInput {
    id: string;
    variant?: string | null;
    variantId?: string | null;
    quantity: number;
}

export interface ShippingInput {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    address: string;
    city: string;
    region: string;
}

export class OrderError extends Error {}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_LINES = 50;
const MAX_QTY = 1000;

function money(n: number): number {
    return Math.round(n * 100) / 100;
}

/** Order numbers double as the guest's access key, so the suffix is random, not a counter. */
export function newOrderNumber(): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = randomBytes(8);
    let suffix = '';
    for (const b of bytes) suffix += alphabet[b % alphabet.length];
    return `ORD-${Date.now()}-${suffix}`;
}

function newTrackingNumber(): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let id = '';
    for (const b of randomBytes(6)) id += alphabet[b % alphabet.length];
    return `SLI-${id}`;
}

function variantLabel(v: { name?: string | null; option2?: string | null }): string {
    const color = v.option2 || '';
    const name = v.name || '';
    return color && name ? `${color} / ${name}` : color || name;
}

function parseAmount(raw: unknown, fallback: number): number {
    const text = typeof raw === 'string' ? raw : raw == null ? '' : String(raw);
    const n = parseFloat(text.replace(/[",]/g, ''));
    return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function validateShipping(s: Partial<ShippingInput> | undefined): ShippingInput {
    const clean = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
    const out: ShippingInput = {
        firstName: clean(s?.firstName, 80),
        lastName: clean(s?.lastName, 80),
        email: clean(s?.email, 160).toLowerCase(),
        phone: clean(s?.phone, 30),
        address: clean(s?.address, 300),
        city: clean(s?.city, 100),
        region: clean(s?.region, 100),
    };
    const missing = Object.entries(out).filter(([, v]) => !v).map(([k]) => k);
    if (missing.length) throw new OrderError(`Please fill in: ${missing.join(', ')}.`);
    if (!/^\S+@\S+\.\S+$/.test(out.email)) throw new OrderError('Please enter a valid email address.');
    if (out.phone.replace(/\D/g, '').length < 9) throw new OrderError('Please enter a valid phone number.');
    return out;
}

export async function createOrder(opts: {
    items: OrderItemInput[];
    shipping: ShippingInput;
    deliveryMethod: DeliveryMethod;
    paymentMethod: PaymentMethod;
    userId: string | null;
    couponCode?: string | null;
}) {
    const { shipping, deliveryMethod, paymentMethod, userId } = opts;
    if (!Array.isArray(opts.items) || opts.items.length === 0) throw new OrderError('Your cart is empty.');
    if (opts.items.length > MAX_LINES) throw new OrderError('Too many items in one order.');

    const pool = getPool();
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Resolve products by id or slug; only active products can be bought.
        const keys = Array.from(new Set(opts.items.map((i) => String(i.id || ''))));
        const { rows: products } = await client.query(
            `SELECT id, name, slug, price, quantity, track_quantity, continue_selling, moq, metadata
             FROM products
             WHERE status = 'active' AND (id::text = ANY($1) OR slug = ANY($1))
             FOR UPDATE`,
            [keys]
        );
        const byKey = new Map<string, any>();
        for (const p of products) {
            byKey.set(p.id, p);
            if (p.slug) byKey.set(p.slug, p);
        }

        const productIds = products.map((p) => p.id);
        const { rows: variants } = productIds.length
            ? await client.query(
                  `SELECT id, product_id, name, option2, price, quantity
                   FROM product_variants WHERE product_id = ANY($1::uuid[]) FOR UPDATE`,
                  [productIds]
              )
            : { rows: [] as any[] };

        const lines: any[] = [];
        let subtotal = 0;
        for (const item of opts.items) {
            const product = byKey.get(String(item.id || ''));
            if (!product) throw new OrderError('An item in your cart is no longer available. Please remove it and try again.');

            const qty = Number(item.quantity);
            if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) {
                throw new OrderError(`Please choose a valid quantity for ${product.name}.`);
            }
            const moq = Number(product.moq) || 1;
            if (qty < moq) throw new OrderError(`${product.name} has a minimum order of ${moq}.`);

            const own = variants.filter((v) => v.product_id === product.id);
            let variant: any = null;
            if (item.variantId && UUID_RE.test(item.variantId)) {
                variant = own.find((v) => v.id === item.variantId) || null;
            }
            if (!variant && item.variant) {
                variant = own.find((v) => variantLabel(v) === item.variant || v.name === item.variant) || null;
            }
            if (own.length > 0 && !variant) {
                throw new OrderError(`Please choose an option for ${product.name} again; it has changed.`);
            }

            const unitPrice = Number(variant?.price ?? product.price);
            if (!Number.isFinite(unitPrice) || unitPrice < 0) {
                throw new OrderError(`${product.name} has no price yet. Please contact us.`);
            }

            const blocksOversell = product.track_quantity !== false && !product.continue_selling;
            const stock = Number(variant ? variant.quantity : product.quantity) || 0;
            if (blocksOversell && stock < qty) {
                throw new OrderError(
                    stock > 0
                        ? `Only ${stock} of ${product.name} left. Please lower the quantity.`
                        : `${product.name} is out of stock.`
                );
            }

            const lineTotal = money(unitPrice * qty);
            subtotal += lineTotal;
            lines.push({
                product_id: product.id,
                variant_id: variant?.id ?? null,
                product_name: product.name,
                variant_name: variant ? variantLabel(variant) : null,
                quantity: qty,
                unit_price: unitPrice,
                total_price: lineTotal,
                metadata: {
                    slug: product.slug,
                    preorder_shipping: product.metadata?.preorder_shipping || null,
                },
            });
        }
        subtotal = money(subtotal);

        const settingKey = deliveryMethod === 'doorstep' ? 'shipping_doorstep_price' : 'shipping_house_pickup_price';
        const { rows: settingRows } = await client.query(`SELECT value FROM store_settings WHERE key = $1`, [settingKey]);
        const shippingTotal = money(parseAmount(settingRows[0]?.value, DEFAULT_SHIPPING[deliveryMethod]));
        let discountTotal = 0;
        let couponCode: string | null = null;
        if (opts.couponCode && String(opts.couponCode).trim()) {
            try {
                const applied = await applyCoupon(client, opts.couponCode, subtotal, shippingTotal, shipping.email, { lock: true });
                discountTotal = applied.discount;
                couponCode = applied.code;
            } catch (err) {
                if (err instanceof CouponError) throw new OrderError(err.message);
                throw err;
            }
        }
        const total = money(Math.max(0, subtotal + shippingTotal - discountTotal));

        const orderNumber = newOrderNumber();
        const trackingNumber = newTrackingNumber();
        const address = { ...shipping };
        const { rows: orderRows } = await client.query(
            `INSERT INTO orders (
               order_number, user_id, email, phone, status, payment_status, currency,
               subtotal, tax_total, shipping_total, discount_total, total,
               shipping_method, payment_method, shipping_address, billing_address, metadata
             ) VALUES ($1,$2,$3,$4,'pending','pending','GHS',$5,0,$6,$12,$7,$8,$9,$10::jsonb,$10::jsonb,$11::jsonb)
             RETURNING *`,
            [
                orderNumber,
                userId,
                shipping.email,
                shipping.phone,
                subtotal,
                shippingTotal,
                total,
                deliveryMethod,
                paymentMethod,
                JSON.stringify(address),
                JSON.stringify({
                    guest_checkout: !userId,
                    first_name: shipping.firstName,
                    last_name: shipping.lastName,
                    tracking_number: trackingNumber,
                    payment_method: paymentMethod,
                    ...(couponCode ? { coupon_code: couponCode } : {}),
                }),
                discountTotal,
            ]
        );
        const order = orderRows[0];

        for (const l of lines) {
            await client.query(
                `INSERT INTO order_items (order_id, product_id, variant_id, product_name, variant_name, quantity, unit_price, total_price, metadata)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
                [order.id, l.product_id, l.variant_id, l.product_name, l.variant_name, l.quantity, l.unit_price, l.total_price, JSON.stringify(l.metadata)]
            );
        }

        const fullName = `${shipping.firstName} ${shipping.lastName}`.trim();
        await client.query(
            `SELECT upsert_customer_from_order($1,$2,$3,$4,$5,$6,$7::jsonb)`,
            [shipping.email, shipping.phone, fullName, shipping.firstName, shipping.lastName, userId, JSON.stringify(address)]
        );

        await client.query('COMMIT');
        return { order, items: lines };
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
    } finally {
        client.release();
    }
}

/** Amount to charge for an order or course reference, read from the database. */
export async function chargeableAmount(ref: string): Promise<
    | { kind: 'order'; amount: number; email: string | null; paid: boolean }
    | { kind: 'course'; amount: number; email: string | null; paid: boolean }
    | null
> {
    const pool = getPool();
    if (ref.startsWith('COURSE-')) {
        const { rows } = await pool.query(
            `SELECT amount, email, payment_status FROM course_registrations WHERE registration_id = $1 LIMIT 1`,
            [ref]
        );
        if (!rows[0]) return null;
        return { kind: 'course', amount: Number(rows[0].amount), email: rows[0].email, paid: rows[0].payment_status === 'paid' };
    }
    const { rows } = await pool.query(
        `SELECT total, email, payment_status, status FROM orders WHERE order_number = $1 LIMIT 1`,
        [ref]
    );
    if (!rows[0]) return null;
    if (rows[0].status === 'cancelled') return null;
    return { kind: 'order', amount: Number(rows[0].total), email: rows[0].email, paid: rows[0].payment_status === 'paid' };
}
