'use client';

import Link from 'next/link';
import { useCMS } from '@/context/CMSContext';

export default function ForgotPasswordPage() {
  const { getSetting } = useCMS();
  const whatsappNumber = getSetting('social_whatsapp') || getSetting('contact_phone') || '+233209597443';
  const whatsappDigits = whatsappNumber.replace(/\D/g, '');
  const whatsappLink = `https://wa.me/${whatsappDigits}?text=${encodeURIComponent('Hi, I need help resetting the password for my MultiMey Supplies account.')}`;

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Reset Password</h1>
          <p className="text-gray-600">We&apos;ll help you get back into your account</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-8">
          <div className="w-16 h-16 flex items-center justify-center bg-green-50 rounded-full mx-auto mb-6">
            <i className="ri-whatsapp-line text-3xl text-green-600"></i>
          </div>
          <p className="text-gray-700 mb-4 text-center">
            To reset your password, message us on WhatsApp from the phone number or email linked to your account.
          </p>
          <ol className="text-sm text-gray-600 space-y-2 mb-8 list-decimal list-inside">
            <li>Tap the button below to open WhatsApp.</li>
            <li>Tell us the email address you signed up with.</li>
            <li>Our team will verify your account and help you set a new password.</li>
          </ol>

          <a
            href={whatsappLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full bg-gray-900 hover:bg-gray-800 text-white py-4 rounded-lg font-semibold transition-colors whitespace-nowrap"
          >
            <i className="ri-whatsapp-line text-xl"></i>
            Message us on WhatsApp
          </a>
          <p className="mt-3 text-center text-sm text-gray-500">{whatsappNumber}</p>

          <p className="mt-8 text-center text-gray-600">
            Remember your password?{' '}
            <Link href="/auth/login" className="text-gray-900 hover:text-gray-900 font-semibold whitespace-nowrap">
              Sign in
            </Link>
          </p>
        </div>

        <div className="mt-8 text-center">
          <Link href="/" className="text-gray-600 hover:text-gray-900 font-medium whitespace-nowrap">
            <i className="ri-arrow-left-line mr-2"></i>
            Back to Home
          </Link>
        </div>
      </div>
    </main>
  );
}
