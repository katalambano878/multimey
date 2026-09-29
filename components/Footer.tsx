'use client';

import Link from 'next/link';
import { useCMS } from '@/context/CMSContext';
import { motion } from 'framer-motion';
import BrandLogo from './BrandLogo';

export default function Footer() {
  const { getSetting } = useCMS();

  const siteName = getSetting('site_name') || 'MultiMey Supplies';
  const footerLogo = getSetting('footer_logo') || getSetting('site_logo') || '';
  const contactEmail = getSetting('contact_email') || '';
  const contactPhone = getSetting('contact_phone') || '';
  const socialInstagram = getSetting('social_instagram') || '';
  const socialFacebook = getSetting('social_facebook') || '';
  const socialTiktok = getSetting('social_tiktok') || '';
  const socialSnapchat = getSetting('social_snapchat') || '';

  const links = [
    { label: 'Products', href: '/shop' },
    { label: 'Contact', href: '/contact' },
    { label: 'Shipping', href: '/shipping' },
    { label: 'Returns', href: '/returns' },
    { label: 'FAQs', href: '/faqs' },
    { label: 'Help Center', href: '/help' },
    { label: 'Refund Policy', href: '/refund-policy' },
    { label: 'Privacy', href: '/privacy' },
    { label: 'Terms', href: '/terms' },
  ];

  const socials = [
    { link: socialInstagram, icon: 'ri-instagram-line' },
    { link: socialFacebook, icon: 'ri-facebook-fill' },
    { link: socialTiktok, icon: 'ri-tiktok-fill' },
    { link: socialSnapchat, icon: 'ri-snapchat-fill' },
  ].filter((s) => s.link);

  return (
    <footer className="bg-brand-blue text-white relative overflow-hidden">
      {/* Subtle background pattern */}
      <div className="absolute inset-0 opacity-5 pointer-events-none">
        <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]"></div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-16">
          {/* Brand Column */}
          <div className="col-span-1 lg:col-span-1">
            {footerLogo && (
              <Link href="/" className="inline-block mb-6">
                <BrandLogo
                  src={footerLogo}
                  alt={siteName}
                  className="h-12 w-auto object-contain"
                />
              </Link>
            )}
            <p className="text-brand-gold/80 text-sm leading-relaxed mb-6">
              Premium quality cosmetics and beauty products sourced directly for you. Experience luxury without the markup.
            </p>
            <div className="flex gap-4">
              {socials.map(({ link, icon }, i) => (
                <motion.a
                  key={i}
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-brand-gold hover:bg-brand-gold hover:text-brand-blue transition-colors"
                  whileHover={{ scale: 1.1, rotate: 5 }}
                  whileTap={{ scale: 0.95 }}
                  aria-label="Social link"
                >
                  <i className={`${icon} text-lg`}></i>
                </motion.a>
              ))}
            </div>
          </div>

          {/* Links Column */}
          <div className="col-span-1">
            <h3 className="font-bold text-lg mb-6 text-brand-gold">Explore</h3>
            <ul className="space-y-3">
              {links.slice(0, 5).map(({ label, href }) => (
                <li key={href}>
                  <Link href={href} className="text-white/70 hover:text-white transition-colors text-sm flex items-center gap-2 group">
                    <span className="w-0 group-hover:w-2 h-px bg-brand-gold transition-all duration-300"></span>
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Support Column */}
          <div className="col-span-1">
            <h3 className="font-bold text-lg mb-6 text-brand-gold">Support</h3>
            <ul className="space-y-3">
              {links.slice(5).map(({ label, href }) => (
                <li key={href}>
                  <Link href={href} className="text-white/70 hover:text-white transition-colors text-sm flex items-center gap-2 group">
                    <span className="w-0 group-hover:w-2 h-px bg-brand-gold transition-all duration-300"></span>
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact Column */}
          <div className="col-span-1">
            <h3 className="font-bold text-lg mb-6 text-brand-gold">Contact</h3>
            <ul className="space-y-4 text-sm text-white/70">
              {contactEmail && (
                <li className="flex items-start gap-3">
                  <i className="ri-mail-line mt-0.5 text-brand-gold"></i>
                  <a href={`mailto:${contactEmail}`} className="hover:text-white transition-colors">
                    {contactEmail}
                  </a>
                </li>
              )}
              {contactPhone && (
                <li className="flex items-start gap-3">
                  <i className="ri-whatsapp-line mt-0.5 text-brand-gold"></i>
                  <a href={`https://wa.me/${contactPhone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
                    {contactPhone}
                  </a>
                </li>
              )}
              <li className="flex items-start gap-3">
                <i className="ri-map-pin-line mt-0.5 text-brand-gold"></i>
                <span>Accra, Ghana</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="pt-8 border-t border-white/10 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-white/50">
          <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4 text-center sm:text-left">
            <p>© {new Date().getFullYear()} {siteName}. All rights reserved.</p>
            <span className="hidden sm:inline text-white/30">|</span>
            <p>
              Powered By{' '}
              <a 
                href="https://doctorbarns.com" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-brand-gold hover:text-white transition-colors font-medium"
              >
                Doctor Barns Tech
              </a>
            </p>
          </div>
          <div className="flex flex-wrap gap-6">
            <Link href="/refund-policy" className="hover:text-white transition-colors">Refund Policy</Link>
            <Link href="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-white transition-colors">Terms of Service</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
