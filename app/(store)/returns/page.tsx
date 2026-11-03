'use client';

import Link from 'next/link';
import { useCMS } from '@/context/CMSContext';
import { toWhatsAppNumber } from '@/lib/contact';
import AnimatedSection from '@/components/AnimatedSection';

export default function ReturnsPortalPage() {
  const { getSetting } = useCMS();
  const contactEmail = getSetting('contact_email') || 'info@multimeysupplies.com';
  const contactPhone = getSetting('social_whatsapp') || getSetting('contact_phone') || '+233209597443';
  const waNumber = toWhatsAppNumber(contactPhone);
  const whatsappHref = waNumber
    ? `https://wa.me/${waNumber}?text=${encodeURIComponent('Hi, I would like to request a return. My order number is: ')}`
    : '/contact';

  return (
    <main className="min-h-screen bg-gray-50 py-12">
        <div className="max-w-4xl mx-auto px-4">
          <AnimatedSection>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Returns</h1>
            <p className="text-gray-600 mb-8">How to request a return or exchange</p>
          </AnimatedSection>

          <AnimatedSection delay={0.1}>
            <div className="bg-white rounded-xl shadow-sm p-8 hover-lift">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Request a Return on WhatsApp</h2>
              <ol className="space-y-3 text-gray-700 mb-8">
                <li className="flex items-start gap-3">
                  <span className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-full bg-gray-900 text-white text-sm font-bold">1</span>
                  <span>Message us on WhatsApp within 24 hours of receiving your order.</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-full bg-gray-900 text-white text-sm font-bold">2</span>
                  <span>Include your <strong>order number</strong> (found in your order confirmation or under My Account), the item(s) and the reason for the return.</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-full bg-gray-900 text-white text-sm font-bold">3</span>
                  <span>Send photos if the item is faulty, damaged or not what you ordered. We&apos;ll confirm next steps with you.</span>
                </li>
              </ol>

              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full bg-gray-900 hover:bg-gray-800 text-white py-4 rounded-lg font-semibold transition-colors whitespace-nowrap"
              >
                <i className="ri-whatsapp-line text-xl"></i>
                Message us on WhatsApp
              </a>
              <p className="mt-3 text-center text-sm text-gray-500">
                {contactPhone} · <a href={`mailto:${contactEmail}`} className="underline">{contactEmail}</a>
              </p>

              <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-start space-x-3">
                  <i className="ri-information-line text-xl text-blue-700 mt-0.5"></i>
                  <div className="text-sm text-blue-700">
                    <p className="font-semibold mb-1">Return Policy Highlights</p>
                    <ul className="space-y-1">
                      <li>• 24-hour return policy: request within 24 hours of receipt if faulty, damaged, or not what you requested (hygiene reasons—no refunds for other reasons)</li>
                      <li>• Item must be unworn/unused, with tags, in original packaging; receipt or proof of purchase required</li>
                      <li>• Contact us first on WhatsApp <a href={whatsappHref} className="underline font-medium" target="_blank" rel="noopener noreferrer">{contactPhone}</a> or <a href={`mailto:${contactEmail}`} className="underline font-medium">{contactEmail}</a>—returns sent without requesting first are not accepted</li>
                      <li>• No returns on custom/personalized items, personal care/beauty, sale items, or gift cards</li>
                      <li>• Full refund to original payment method if we don’t have the same item; bank processing may take time</li>
                    </ul>
                    <p className="mt-2"><Link href="/refund-policy" className="underline font-medium">Full Refund Policy</Link></p>
                  </div>
                </div>
              </div>
            </div>
          </AnimatedSection>
        </div>
    </main>
  );
}
