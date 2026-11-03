import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseKey);

// middleware.ts guards /admin with the `mm-access-token` cookie, but supabase-js
// keeps the session in localStorage. Mirror the access token into the cookie.
if (typeof window !== 'undefined') {
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.access_token) {
            const maxAge = Math.max(60, (session.expires_at ?? 0) - Math.floor(Date.now() / 1000));
            document.cookie = `mm-access-token=${session.access_token}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
        } else {
            document.cookie = `mm-access-token=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
        }
    });
}
