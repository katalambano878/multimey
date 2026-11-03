'use client';

import { useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useCMS } from '@/context/CMSContext';
import { toWhatsAppNumber } from '@/lib/contact';

export default function PrivacySettingsPage() {
  const { getSetting } = useCMS();
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const whatsappNumber = getSetting('social_whatsapp') || getSetting('contact_phone') || '+233209597443';
  const waDigits = toWhatsAppNumber(whatsappNumber);
  const whatsappHref = waDigits
    ? `https://wa.me/${waDigits}?text=${encodeURIComponent('Hi, I would like to delete my MultiMey Supplies account.')}`
    : '/contact';

  const handleExportData = async () => {
    setExporting(true);
    setExportMessage(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        setExportMessage({ type: 'error', text: 'Please sign in to export your data.' });
        return;
      }
      const user = session.user;

      const [profileRes, ordersRes, addressesRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
        supabase.from('orders').select('*, order_items(*)').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('addresses').select('*').eq('user_id', user.id),
      ]);

      if (profileRes.error || ordersRes.error || addressesRes.error) {
        throw profileRes.error || ordersRes.error || addressesRes.error;
      }

      const userData = {
        exportedAt: new Date().toISOString(),
        account: {
          id: user.id,
          email: user.email,
          createdAt: user.created_at,
          metadata: user.user_metadata || {},
        },
        profile: profileRes.data || null,
        orders: ordersRes.data || [],
        addresses: addressesRes.data || [],
      };

      const dataStr = JSON.stringify(userData, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `my-data-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      setExportMessage({ type: 'success', text: 'Your data has been downloaded.' });
    } catch (err) {
      console.error('Data export failed:', err);
      setExportMessage({ type: 'error', text: 'We could not export your data. Please try again later.' });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <Link href="/account" className="w-9 h-9 flex items-center justify-center hover:bg-gray-100 rounded-lg transition-colors">
              <i className="ri-arrow-left-line text-xl"></i>
            </Link>
            <div>
              <h1 className="text-xl font-bold">Privacy & Data</h1>
              <p className="text-sm text-gray-600">Manage your personal information</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-4 space-y-6">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="flex gap-3">
            <i className="ri-shield-check-line text-xl text-blue-600 flex-shrink-0 mt-0.5"></i>
            <div>
              <h3 className="font-semibold text-blue-900 mb-1">Your Privacy Matters</h3>
              <p className="text-sm text-blue-800">
                We only use your personal information to process your orders and support requests.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border p-6 space-y-6">
          <div>
            <h2 className="text-lg font-bold mb-4">Data Export</h2>
            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <h3 className="font-semibold mb-2 flex items-center gap-2">
                <i className="ri-download-cloud-line text-lg"></i>
                Download Your Data
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                Get a copy of your account details, orders and saved addresses in JSON format.
              </p>
              <button
                onClick={handleExportData}
                disabled={exporting}
                className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed font-medium whitespace-nowrap"
              >
                {exporting ? (
                  <>
                    <i className="ri-loader-4-line animate-spin mr-2"></i>
                    Preparing Export...
                  </>
                ) : (
                  <>
                    <i className="ri-download-line mr-2"></i>
                    Export My Data
                  </>
                )}
              </button>
              {exportMessage && (
                <p className={`mt-3 text-sm ${exportMessage.type === 'success' ? 'text-gray-700' : 'text-red-600'}`}>
                  {exportMessage.text}
                </p>
              )}
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-semibold mb-2">What's Included?</h3>
              <ul className="space-y-2 text-sm text-gray-600">
                <li className="flex items-start gap-2">
                  <i className="ri-check-line text-gray-900 mt-0.5 flex-shrink-0"></i>
                  <span>Personal information (name, email, phone)</span>
                </li>
                <li className="flex items-start gap-2">
                  <i className="ri-check-line text-gray-900 mt-0.5 flex-shrink-0"></i>
                  <span>Order history and transaction details</span>
                </li>
                <li className="flex items-start gap-2">
                  <i className="ri-check-line text-gray-900 mt-0.5 flex-shrink-0"></i>
                  <span>Saved addresses</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="border-t pt-6">
            <h2 className="text-lg font-bold mb-4 text-red-600">Danger Zone</h2>
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <h3 className="font-semibold text-red-900 mb-2 flex items-center gap-2">
                <i className="ri-delete-bin-line text-lg"></i>
                Delete Account
              </h3>
              <p className="text-sm text-red-800 mb-4">
                Account deletion is handled by our team. Message us on WhatsApp from the phone number or email
                on your account and we&apos;ll confirm your request and remove your account.
              </p>
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium whitespace-nowrap"
              >
                <i className="ri-whatsapp-line"></i>
                Request deletion on WhatsApp
              </a>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border p-6">
          <h2 className="text-lg font-bold mb-4">Your Privacy Rights</h2>
          <div className="space-y-4 text-sm text-gray-700">
            <div className="flex gap-3">
              <i className="ri-eye-line text-lg text-gray-400 flex-shrink-0"></i>
              <div>
                <h3 className="font-semibold mb-1">Right to Access</h3>
                <p className="text-gray-600">You can request and download all your personal data at any time.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <i className="ri-edit-line text-lg text-gray-400 flex-shrink-0"></i>
              <div>
                <h3 className="font-semibold mb-1">Right to Rectification</h3>
                <p className="text-gray-600">You can update and correct your personal information in account settings.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <i className="ri-delete-bin-line text-lg text-gray-400 flex-shrink-0"></i>
              <div>
                <h3 className="font-semibold mb-1">Right to Erasure</h3>
                <p className="text-gray-600">You can ask us to delete your account by contacting us on WhatsApp.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <i className="ri-file-shield-line text-lg text-gray-400 flex-shrink-0"></i>
              <div>
                <h3 className="font-semibold mb-1">Right to Data Portability</h3>
                <p className="text-gray-600">Export your data in a structured, machine-readable format.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-gray-100 rounded-xl p-4">
          <p className="text-sm text-gray-600 text-center">
            Questions about privacy? Read our{' '}
            <Link href="/privacy" className="text-black font-medium hover:underline">
              Privacy Policy
            </Link>
            {' '}or{' '}
            <Link href="/contact" className="text-black font-medium hover:underline">
              contact support
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
