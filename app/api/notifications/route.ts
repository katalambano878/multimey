import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendOrderConfirmation, sendOrderStatusUpdate, sendWelcomeMessage, sendContactMessage, sendPaymentLink, sendEmail, sendSMS, emailLayout } from '@/lib/notifications';
import { checkRateLimit, getClientIdentifier, RATE_LIMITS } from '@/lib/rate-limit';
import { escapeHtml } from '@/lib/sanitize';

export async function POST(request: Request) {
    try {
        // Rate limiting
        const clientId = getClientIdentifier(request);
        const rateLimitResult = checkRateLimit(`notification:${clientId}`, RATE_LIMITS.notification);
        
        if (!rateLimitResult.success) {
            return NextResponse.json(
                { error: 'Too many requests. Please try again later.' },
                { 
                    status: 429,
                    headers: {
                        'X-RateLimit-Remaining': '0',
                        'X-RateLimit-Reset': rateLimitResult.resetIn.toString()
                    }
                }
            );
        }

        const body = await request.json();
        const { type, payload } = body;

        if (!payload) {
            return NextResponse.json({ error: 'Payload required' }, { status: 400 });
        }

        // Use service role key to bypass RLS for server-side operations
        const supabase = supabaseAdmin;

        // Only `contact` (public form) and `welcome` (the signed-in user's own
        // address) can be sent without staff rights; everything else could be
        // used to send SMS/email to arbitrary people on the store's account.
        const publicTypes = ['contact', 'welcome'];
        const authToken = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
        const { data: { user } } = authToken
            ? await supabase.auth.getUser(authToken)
            : { data: { user: null as any } };

        if (!publicTypes.includes(type)) {
            if (!user) {
                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
            }
            const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', user.id)
                .single();

            if (profileError) {
                console.error('[Notifications] Profile lookup failed:', profileError.message);
                return NextResponse.json({ error: 'Failed to verify admin role' }, { status: 500 });
            }

            if (!profile || (profile.role !== 'admin' && profile.role !== 'staff')) {
                return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 });
            }
        }

        if (type === 'order_created') {
            await sendOrderConfirmation(payload);
            return NextResponse.json({ success: true, message: 'Order confirmation sent' });
        }

        if (type === 'order_updated') {
            const { order, status } = payload;
            await sendOrderStatusUpdate(order, status);
            return NextResponse.json({ success: true, message: 'Status update sent' });
        }

        // Handle order_status from admin panel (different payload structure)
        if (type === 'order_status') {
            const { email, name, orderNumber, status, trackingNumber, phone } = payload;
            
            // Fetch full order data to get metadata (tracking number etc.)
            const { data: fullOrder } = await supabase
                .from('orders')
                .select('id, order_number, email, phone, shipping_address, metadata')
                .eq('order_number', orderNumber)
                .single();
            
            // Build order object for sendOrderStatusUpdate
            const orderData = fullOrder || {
                order_number: orderNumber,
                email: email,
                phone: phone,
                shipping_address: { firstName: name, phone: phone },
                metadata: { tracking_number: trackingNumber }
            };
            
            // Ensure phone is set (from payload if not in DB)
            if (!orderData.phone && phone) {
                orderData.phone = phone;
            }
            
            await sendOrderStatusUpdate(orderData, status);
            return NextResponse.json({ success: true, message: 'Status update sent' });
        }

        if (type === 'welcome') {
            // Send only to the account that just signed up, once.
            if (!user?.email) {
                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
            }
            const createdAt = new Date(user.created_at).getTime();
            if (!Number.isFinite(createdAt) || Date.now() - createdAt > 15 * 60 * 1000) {
                return NextResponse.json({ success: true, message: 'Welcome already sent' });
            }
            const welcomeLimit = checkRateLimit(`welcome:${user.id}`, { maxRequests: 1, windowSeconds: 3600 });
            if (!welcomeLimit.success) {
                return NextResponse.json({ success: true, message: 'Welcome already sent' });
            }
            await sendWelcomeMessage({
                email: user.email,
                firstName: String(payload.firstName || user.user_metadata?.first_name || '').slice(0, 60),
            });
            return NextResponse.json({ success: true, message: 'Welcome message sent' });
        }

        if (type === 'contact') {
            const contactLimit = checkRateLimit(`contact:${clientId}`, { maxRequests: 3, windowSeconds: 600 });
            if (!contactLimit.success) {
                return NextResponse.json({ error: 'Too many messages. Please try again later.' }, { status: 429 });
            }
            const field = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
            const contact = {
                name: field(payload.name, 100),
                email: field(payload.email, 160),
                subject: field(payload.subject, 150),
                message: field(payload.message, 3000),
            };
            if (!contact.name || !/^\S+@\S+\.\S+$/.test(contact.email) || !contact.message) {
                return NextResponse.json({ error: 'Please fill in your name, email and message.' }, { status: 400 });
            }
            // Email isn't always configured, so keep every message where staff can read it.
            const { error: saveError } = await supabase.from('support_tickets').insert({
                user_id: user?.id || null,
                email: contact.email,
                subject: contact.subject || 'Contact form message',
                description: contact.message,
                category: 'contact',
                status: 'open',
                priority: 'medium',
                metadata: { name: contact.name, source: 'contact_form' },
            });
            if (saveError) {
                console.error('[Notifications] Could not save contact message:', saveError.message);
                return NextResponse.json({ error: 'Could not send your message. Please try WhatsApp.' }, { status: 500 });
            }
            await sendContactMessage(contact).catch((e: any) =>
                console.warn('[Notifications] Contact email not sent:', e?.message)
            );
            return NextResponse.json({ success: true, message: 'Contact message sent' });
        }

        if (type === 'payment_link') {
            await sendPaymentLink(payload);
            return NextResponse.json({ success: true, message: 'Payment link sent' });
        }

        if (type === 'campaign') {
            const { recipients, subject, message, channels } = payload;

            // Deduplicate phone numbers and emails server-side as safety net
            const seenPhones = new Set<string>();
            const seenEmails = new Set<string>();
            const results = { email: 0, sms: 0, errors: 0 };

            for (const recipient of recipients) {
                try {
                    // Send email (skip duplicates)
                    if (channels.email && recipient.email) {
                        const emailKey = recipient.email.toLowerCase().trim();
                        if (!seenEmails.has(emailKey)) {
                            seenEmails.add(emailKey);
                            const brandedHtml = emailLayout(`
<h2 style="margin:0 0 16px;color:#111827;font-size:22px;text-align:center;">${escapeHtml(subject)}</h2>
<p style="color:#374151;font-size:14px;line-height:1.7;margin:16px 0;">Hi ${escapeHtml(recipient.name || 'Valued Customer')},</p>
<p style="color:#374151;font-size:14px;line-height:1.7;margin:0 0 16px;">${escapeHtml(message).replace(/\n/g, '</p><p style="color:#374151;font-size:14px;line-height:1.7;margin:0 0 16px;">')}</p>
`, subject);
                            await sendEmail({
                                to: recipient.email,
                                subject: subject,
                                html: brandedHtml
                            });
                            results.email++;
                        }
                    }

                    // Send SMS (skip duplicates)
                    if (channels.sms && recipient.phone) {
                        const phoneKey = recipient.phone.replace(/[\s\-\(\)\.]+/g, '');
                        if (!seenPhones.has(phoneKey)) {
                            seenPhones.add(phoneKey);
                            await sendSMS({
                                to: recipient.phone,
                                message: message
                            });
                            results.sms++;
                        }
                    }
                } catch (err: any) {
                    console.error(`[Campaign] Failed for ${recipient.email || recipient.phone}:`, err.message);
                    results.errors++;
                }
            }

            return NextResponse.json({ 
                success: true, 
                message: `Campaign sent: ${results.email} emails, ${results.sms} SMS.${results.errors > 0 ? ` (${results.errors} failed)` : ''}` 
            });
        }

        return NextResponse.json({ error: 'Invalid notification type' }, { status: 400 });

    } catch (error: any) {
        console.error('Notification API Error:', error);
        return NextResponse.json({ error: 'Could not send the notification.' }, { status: 500 });
    }
}
