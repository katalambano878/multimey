'use server';

import { verifyAdminToken } from '@/lib/auth';
import { sendSMS } from '@/lib/notifications';

/** Sends one test SMS through the store's SMS provider. Staff only. */
export async function testSmsAction(token: string, phone: string, message: string) {
    const auth = await verifyAdminToken(token);
    if (!auth.authenticated) {
        return { success: false, error: auth.error || 'Admin access required' };
    }

    const to = String(phone || '').trim();
    const text = String(message || '').trim().slice(0, 480);
    if (to.replace(/\D/g, '').length < 9 || !text) {
        return { success: false, error: 'Enter a phone number and a message.' };
    }

    try {
        const result = await sendSMS({ to, message: text });
        return result
            ? { success: true, result }
            : { success: false, error: 'The SMS provider did not accept the message. Check the SMS settings.' };
    } catch (error: any) {
        return { success: false, error: error?.message || 'Could not send the SMS.' };
    }
}
