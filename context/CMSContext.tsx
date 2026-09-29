'use client';

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { BRAND_LOGO } from '@/components/BrandLogo';

// ── Types ──────────────────────────────────────────────────────────
export interface SiteSettings {
    // General
    site_name: string;
    site_tagline: string;
    site_logo: string;
    site_favicon: string;
    contact_email: string;
    contact_phone: string;
    contact_address: string;
    social_facebook: string;
    social_instagram: string;
    social_twitter: string;
    social_tiktok: string;
    social_youtube: string;
    social_snapchat: string;
    social_whatsapp: string;
    currency: string;
    currency_symbol: string;
    /** Flat delivery fee for doorstep delivery (number as string, e.g. "50") */
    shipping_doorstep_price: string;
    /** Optional fee for house pickup; use "0" for free */
    shipping_house_pickup_price: string;

    // Appearance / Theme
    primary_color: string;
    secondary_color: string;
    accent_color: string;
    header_bg: string;
    header_text: string;
    footer_bg: string;
    footer_text: string;

    // Hero Section
    hero_headline: string;
    hero_subheadline: string;
    hero_image: string;
    hero_video: string;
    hero_badge_label: string;
    hero_badge_text: string;
    hero_badge_subtext: string;
    hero_primary_btn_text: string;
    hero_primary_btn_link: string;
    hero_secondary_btn_text: string;
    hero_secondary_btn_link: string;
    hero_tag_text: string;
    hero_stat1_title: string;
    hero_stat1_desc: string;
    hero_stat2_title: string;
    hero_stat2_desc: string;
    hero_stat3_title: string;
    hero_stat3_desc: string;

    // Trust Features
    feature1_icon: string;
    feature1_title: string;
    feature1_desc: string;
    feature2_icon: string;
    feature2_title: string;
    feature2_desc: string;
    feature3_icon: string;
    feature3_title: string;
    feature3_desc: string;
    feature4_icon: string;
    feature4_title: string;
    feature4_desc: string;

    // About Page
    about_hero_title: string;
    about_hero_subtitle: string;
    about_story_title: string;
    about_story_content: string;
    about_story_image: string;
    about_founder_name: string;
    about_founder_title: string;
    about_mission1_title: string;
    about_mission1_content: string;
    about_mission2_title: string;
    about_mission2_content: string;
    about_values_title: string;
    about_values_subtitle: string;
    about_cta_title: string;
    about_cta_subtitle: string;

    // Contact Page
    contact_hero_title: string;
    contact_hero_subtitle: string;
    contact_hours: string;
    contact_visit_hours: string;
    contact_whatsapp_hours: string;
    contact_map_link: string;
    contact_team_json: string;

    // Header
    header_logo_height: string;
    header_nav_links_json: string;
    header_show_search: string;
    header_show_wishlist: string;
    header_show_cart: string;
    header_show_account: string;

    // Footer
    footer_logo: string;
    footer_logo_height: string;
    footer_newsletter_title: string;
    footer_newsletter_subtitle: string;
    footer_show_newsletter: string;
    footer_col1_title: string;
    footer_col1_links_json: string;
    footer_col2_title: string;
    footer_col2_links_json: string;
    footer_col3_title: string;
    footer_col3_links_json: string;
    footer_copyright_text: string;
    footer_powered_by: string;
    footer_powered_by_link: string;

    // SEO
    seo_title: string;
    seo_description: string;
    seo_keywords: string;
    seo_og_image: string;
    seo_google_analytics: string;

    // Integrations
    integration_resend_api_key: string;
    integration_admin_email: string;
    integration_email_from: string;
    integration_moolre_api_user: string;
    integration_moolre_api_pubkey: string;
    integration_moolre_account_number: string;
    integration_moolre_merchant_email: string;
    integration_moolre_sms_api_key: string;
    integration_recaptcha_site_key: string;
    integration_recaptcha_secret_key: string;
    integration_app_url: string;

    [key: string]: string;
}

export interface CMSContent {
    id: string;
    section: string;
    block_key: string;
    title: string | null;
    subtitle: string | null;
    content: string | null;
    image_url: string | null;
    button_text: string | null;
    button_url: string | null;
    metadata: Record<string, any>;
    is_active: boolean;
}

export interface Banner {
    id: string;
    name: string;
    type: string;
    title: string | null;
    subtitle: string | null;
    image_url: string | null;
    background_color: string;
    text_color: string;
    button_text: string | null;
    button_url: string | null;
    is_active: boolean;
    position: string;
    start_date: string | null;
    end_date: string | null;
}

export interface CMSContextType {
    settings: SiteSettings;
    content: CMSContent[];
    banners: Banner[];
    loading: boolean;
    getContent: (section: string, blockKey: string) => CMSContent | undefined;
    getSetting: (key: string) => string;
    getSettingJSON: <T = any>(key: string, fallback: T) => T;
    getActiveBanners: (position?: string) => Banner[];
    refreshCMS: () => Promise<void>;
}

// ── Defaults ───────────────────────────────────────────────────────
export const defaultSettings: SiteSettings = {
    // General
    site_name: 'MultiMey Supplies',
    site_tagline: 'Your tagline here.',
    site_logo: BRAND_LOGO,
    site_favicon: '/favicon.ico',
    contact_email: 'contact@example.com',
    contact_phone: '+233209597443',
    contact_address: 'Dzowulu, Accra, Ghana',
    social_facebook: '',
    social_instagram: '',
    social_twitter: '',
    social_tiktok: '',
    social_youtube: '',
    social_snapchat: '',
    social_whatsapp: '',
    currency: 'GHS',
    currency_symbol: 'GH₵',
    shipping_doorstep_price: '50',
    shipping_house_pickup_price: '0',

    // Appearance — black & white
    primary_color: '#000000',
    secondary_color: '#171717',
    accent_color: '#404040',
    header_bg: '#ffffff',
    header_text: '#171717',
    footer_bg: '#0a0a0a',
    footer_text: '#ffffff',

    // Hero
    hero_headline: 'Crown Your Look with Premium Hair',
    hero_subheadline: 'Human hair wigs & extensions, handpicked for quality and style.',
    hero_image: '/hero.jpg',
    hero_video: '/wighero.mp4',
    hero_badge_label: 'Exclusive Offer',
    hero_badge_text: '25% Off',
    hero_badge_subtext: 'On your first dedicated order',
    hero_primary_btn_text: 'Shop Collections',
    hero_primary_btn_link: '/shop',
    hero_secondary_btn_text: 'Our Story',
    hero_secondary_btn_link: '/about',
    hero_tag_text: 'New Collection',
    hero_stat1_title: 'Direct Import',
    hero_stat1_desc: 'Sourced from China',
    hero_stat2_title: 'Verified Quality',
    hero_stat2_desc: 'Inspected by hand',
    hero_stat3_title: 'Best Prices',
    hero_stat3_desc: 'Unbeatable value',

    // Trust Features
    feature1_icon: 'ri-store-2-line',
    feature1_title: 'Freebies on big orders',
    feature1_desc: 'Free gifts when you spend big',
    feature2_icon: 'ri-arrow-left-right-line',
    feature2_title: 'Easy Returns',
    feature2_desc: '24-hour return policy for faulty/damaged/wrong items',
    feature3_icon: 'ri-customer-service-2-line',
    feature3_title: '24/7 Support',
    feature3_desc: 'Dedicated service',
    feature4_icon: 'ri-shield-check-line',
    feature4_title: 'Secure Payment',
    feature4_desc: 'Safe checkout',

    // About
    about_hero_title: 'More Than Just A Brand',
    about_hero_subtitle: 'From Accra to your doorstep — quality dresses, electronics, bags, shoes and more at prices that make sense.',
    about_story_title: 'How It All Started',
    about_story_content: 'MultiMey Supplies started with a simple idea: bring quality products to Ghanaians at fair prices. We saw how people were paying too much for items that could be sourced smarter — so we built a bridge between trusted Chinese manufacturers, local suppliers, and everyday shoppers.\n\nWhat began as a small operation in Accra has grown into a full online store offering everything from trendy dresses and stylish bags to the latest electronics and durable shoes. We handpick every product, test it for quality, and price it fairly.\n\nWhether you are shopping for yourself, stocking your boutique, or looking for the perfect gift, MultiMey Supplies has you covered. We combine local sourcing with direct imports to give you the widest selection at the best value.',
    about_story_image: '/about.jpg',
    about_founder_name: 'Store Name',
    about_founder_title: 'Founder',
    about_mission1_title: 'Everything in One Place',
    about_mission1_content: 'From fashion to electronics, bags to shoes — we aim to be the only store you need. Our catalogue is constantly expanding with new arrivals sourced from trusted local and international suppliers.',
    about_mission2_title: 'Empowering Resellers',
    about_mission2_content: 'We support small businesses and resellers with competitive bulk pricing. Many of our products are available at wholesale rates, helping entrepreneurs across Ghana grow their own ventures.',
    about_values_title: 'Why Choose Us?',
    about_values_subtitle: 'Customize in settings.',
    about_cta_title: 'Ready to shop smarter?',
    about_cta_subtitle: 'Browse our collection of dresses, electronics, bags, shoes and more. New stock arrives weekly.',

    // Contact
    contact_hero_title: 'Get In Touch',
    contact_hero_subtitle: 'Questions? We’re here to help.',
    contact_hours: 'Mon-Fri, 8am-6pm GMT',
    contact_visit_hours: 'Mon-Sat, 9am-6pm',
    contact_whatsapp_hours: 'No calls. But chat with us instantly.',
    contact_map_link: 'https://maps.google.com',
    contact_team_json: '[]',

    // Header
    header_logo_height: '56',
    header_nav_links_json: JSON.stringify([
        { label: 'Products', href: '/shop' },
        { label: 'Categories', href: '/categories' },
        { label: 'Contact', href: '/contact' },
        { label: 'Importation Class', href: '/importation-class' }
    ]),
    header_show_search: 'true',
    header_show_wishlist: 'true',
    header_show_cart: 'true',
    header_show_account: 'true',

    // Footer
    footer_logo: BRAND_LOGO,
    footer_logo_height: '56',
    footer_newsletter_title: 'Join Our Community',
    footer_newsletter_subtitle: 'Get exclusive access to new arrivals, secret sales, and more.',
    footer_show_newsletter: 'true',
    footer_col1_title: 'Shop',
    footer_col1_links_json: JSON.stringify([
        { label: 'All Products', href: '/shop' },
        { label: 'Categories', href: '/categories' },
        { label: 'New Arrivals', href: '/shop?sort=newest' },
        { label: 'Best Sellers', href: '/shop?sort=bestsellers' }
    ]),
    footer_col2_title: 'Customer Care',
    footer_col2_links_json: JSON.stringify([
        { label: 'Contact Us', href: '/contact' },
        { label: 'Track My Order', href: '/order-tracking' },
        { label: 'Shipping Info', href: '/shipping' },
        { label: 'Returns Policy', href: '/returns' },
        { label: 'Refund Policy', href: '/refund-policy' }
    ]),
    footer_col3_title: 'Company',
    footer_col3_links_json: JSON.stringify([
        { label: 'Our Story', href: '/about' },
        { label: 'Blog', href: '/blog' },
        { label: 'Privacy Policy', href: '/privacy' },
        { label: 'Terms of Service', href: '/terms' }
    ]),
    footer_copyright_text: '',
    footer_powered_by: '',
    footer_powered_by_link: '',

    // SEO
    seo_title: '',
    seo_description: '',
    seo_keywords: '',
    seo_og_image: '',
    seo_google_analytics: '',

    // Integrations
    integration_resend_api_key: '',
    integration_admin_email: '',
    integration_email_from: '',
    integration_moolre_api_user: '',
    integration_moolre_api_pubkey: '',
    integration_moolre_account_number: '',
    integration_moolre_merchant_email: '',
    integration_moolre_sms_api_key: '',
    integration_recaptcha_site_key: '',
    integration_recaptcha_secret_key: '',
    integration_app_url: '',
};

const CMSContext = createContext<CMSContextType>({
    settings: defaultSettings,
    content: [],
    banners: [],
    loading: true,
    getContent: () => undefined,
    getSetting: () => '',
    getSettingJSON: (_key, fallback) => fallback,
    getActiveBanners: () => [],
    refreshCMS: async () => { },
});

// ── Provider ───────────────────────────────────────────────────────
export function CMSProvider({ children }: { children: ReactNode }) {
    const [settings, setSettings] = useState<SiteSettings>(defaultSettings);
    const [content, setContent] = useState<CMSContent[]>([]);
    const [banners, setBanners] = useState<Banner[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchCMSData = useCallback(async () => {
        try {
            // Fetch store_settings
            const { data: settingsData, error: settingsError } = await supabase
                .from('store_settings')
                .select('key, value');

            if (!settingsError && settingsData) {
                const merged = { ...defaultSettings };
                settingsData.forEach((row: any) => {
                    if (row.key && row.value !== null && row.value !== undefined) {
                        // value is jsonb, could be a string or object
                        merged[row.key] = typeof row.value === 'string' ? row.value : JSON.stringify(row.value);
                    }
                });
                setSettings(merged);
            }

            // Fetch CMS content blocks
            const { data: contentData, error: contentError } = await supabase
                .from('cms_content')
                .select('*')
                .eq('is_active', true);

            if (!contentError && contentData) {
                setContent(contentData);
            }

            // Fetch banners
            const { data: bannersData, error: bannersError } = await supabase
                .from('banners')
                .select('*')
                .eq('is_active', true)
                .order('sort_order');

            if (!bannersError && bannersData) {
                setBanners(bannersData);
            }
        } catch (err) {
            console.warn('CMSProvider: Failed to fetch CMS data', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchCMSData();
    }, [fetchCMSData]);

    const getContent = (section: string, blockKey: string): CMSContent | undefined => {
        return content.find(c => c.section === section && c.block_key === blockKey);
    };

    const getSetting = (key: string): string => {
        let value = settings[key] || defaultSettings[key] || '';
        if (key === 'contact_email' && value === 'info@doctorbarns.com') {
            value = 'contact@example.com';
        }
        if (key === 'contact_whatsapp_hours' && value.trim() === 'Chat with us instantly') {
            value = defaultSettings.contact_whatsapp_hours;
        }
        return value;
    };

    const getSettingJSON = <T = any,>(key: string, fallback: T): T => {
        const raw = settings[key];
        if (!raw) return fallback;
        try {
            return JSON.parse(raw) as T;
        } catch {
            return fallback;
        }
    };

    const getActiveBanners = (position?: string): Banner[] => {
        const now = new Date();
        return banners.filter(b => {
            if (position && b.position !== position) return false;
            if (b.start_date && new Date(b.start_date) > now) return false;
            if (b.end_date && new Date(b.end_date) < now) return false;
            return b.is_active;
        });
    };

    return (
        <CMSContext.Provider
            value={{
                settings,
                content,
                banners,
                loading,
                getContent,
                getSetting,
                getSettingJSON,
                getActiveBanners,
                refreshCMS: fetchCMSData,
            }}
        >
            {children}
        </CMSContext.Provider>
    );
}

export function useCMS() {
    const context = useContext(CMSContext);
    if (!context) {
        throw new Error('useCMS must be used within a CMSProvider');
    }
    return context;
}

export default CMSContext;
