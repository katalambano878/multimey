'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useRecaptcha } from '@/hooks/useRecaptcha';

const PRIORITY_MAP: Record<string, 'low' | 'medium' | 'high'> = {
  low: 'low',
  normal: 'medium',
  high: 'high',
};

export default function SupportTicketPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    orderNumber: '',
    category: 'order',
    priority: 'normal',
    subject: '',
    description: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [ticketNumber, setTicketNumber] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const { getToken } = useRecaptcha();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const user = session?.user;
      setUserId(user?.id ?? null);
      if (user) {
        const meta = user.user_metadata || {};
        const fullName = meta.full_name || [meta.first_name, meta.last_name].filter(Boolean).join(' ');
        setFormData((prev) => ({
          ...prev,
          name: prev.name || fullName || '',
          email: prev.email || user.email || '',
        }));
      }
      setAuthChecked(true);
    });
  }, []);

  const categories = [
    { value: 'order', label: 'Order Issue', icon: 'ri-shopping-bag-line' },
    { value: 'delivery', label: 'Delivery Problem', icon: 'ri-truck-line' },
    { value: 'return', label: 'Return Request', icon: 'ri-arrow-left-right-line' },
    { value: 'payment', label: 'Payment Issue', icon: 'ri-bank-card-line' },
    { value: 'product', label: 'Product Question', icon: 'ri-gift-line' },
    { value: 'account', label: 'Account Help', icon: 'ri-user-line' },
    { value: 'other', label: 'Other', icon: 'ri-question-line' }
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    setIsSubmitting(true);
    setSubmitError('');

    // reCAPTCHA verification
    const isHuman = await getToken('support_ticket');
    if (!isHuman) {
      setIsSubmitting(false);
      setSubmitError('Security verification failed. Please try again.');
      return;
    }

    const orderNumber = formData.orderNumber.trim();
    const { data, error } = await supabase
      .from('support_tickets')
      .insert({
        user_id: userId,
        email: formData.email.trim(),
        subject: formData.subject.trim(),
        description: orderNumber
          ? `${formData.description.trim()}\n\nOrder number: ${orderNumber}`
          : formData.description.trim(),
        category: formData.category,
        status: 'open',
        priority: PRIORITY_MAP[formData.priority] || 'medium',
        metadata: { name: formData.name.trim(), order_number: orderNumber || null },
      })
      .select('ticket_number')
      .single();

    setIsSubmitting(false);
    if (error) {
      console.error('Support ticket error:', error);
      setSubmitError('We could not submit your ticket. Please try again or message us on WhatsApp.');
      return;
    }
    setTicketNumber(data?.ticket_number != null ? String(data.ticket_number) : null);
    setShowSuccess(true);
  };

  if (showSuccess) {
    return (
      <>
        <main className="min-h-screen bg-gray-50 flex items-center justify-center py-12">
          <div className="max-w-md mx-auto px-4 text-center">
            <div className="bg-white rounded-xl shadow-lg p-8">
              <div className="w-20 h-20 flex items-center justify-center bg-gray-100 rounded-full mx-auto mb-6">
                <i className="ri-check-line text-4xl text-gray-900"></i>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Ticket Created!</h2>
              <p className="text-gray-600 mb-2">
                Your support ticket has been submitted successfully.
              </p>
              {ticketNumber && (
                <p className="text-sm text-gray-500 mb-6">
                  Ticket #{ticketNumber}
                </p>
              )}
              <div className="space-y-3">
                <p className="text-sm text-gray-600">
                  Our team will reply on this ticket. You can check its status under My Tickets.
                </p>
                <Link
                  href="/support/tickets"
                  className="block bg-gray-900 hover:bg-gray-800 text-white py-3 rounded-lg font-semibold transition-colors whitespace-nowrap"
                >
                  View My Tickets
                </Link>
                <Link
                  href="/help"
                  className="block text-gray-900 hover:text-gray-900 font-semibold whitespace-nowrap"
                >
                  Back to Help Center
                </Link>
              </div>
            </div>
          </div>
        </main>
      </>
    );
  }

  if (!authChecked) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center py-12">
        <i className="ri-loader-4-line text-3xl text-gray-500 animate-spin"></i>
      </main>
    );
  }

  if (!userId) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center py-12">
        <div className="max-w-md mx-auto px-4 text-center">
          <div className="bg-white rounded-xl shadow-sm p-8">
            <div className="w-16 h-16 flex items-center justify-center bg-gray-100 rounded-full mx-auto mb-6">
              <i className="ri-lock-line text-3xl text-gray-900"></i>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-3">Sign in to create a ticket</h1>
            <p className="text-gray-600 mb-6">
              Support tickets are linked to your account so you can follow up on them. You can also reach us on the Contact page.
            </p>
            <div className="space-y-3">
              <Link
                href="/auth/login?redirect=/support/ticket"
                className="block bg-gray-900 hover:bg-gray-800 text-white py-3 rounded-lg font-semibold transition-colors whitespace-nowrap"
              >
                Sign In
              </Link>
              <Link href="/contact" className="block text-gray-900 font-semibold whitespace-nowrap">
                Contact Us
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <>
      <main className="min-h-screen bg-gray-50 py-12">
        <div className="max-w-4xl mx-auto px-4">
          <Link
            href="/help"
            className="inline-flex items-center text-gray-900 hover:text-gray-900 font-semibold mb-6 whitespace-nowrap"
          >
            <i className="ri-arrow-left-line mr-2"></i>
            Back to Help Center
          </Link>

          <div className="bg-white rounded-xl shadow-sm p-8">
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Create Support Ticket</h1>
              <p className="text-gray-600">
                Fill out the form below and our team will get back to you
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">
                    Your Name *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600"
                    placeholder="John Doe"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-2">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600"
                    placeholder="you@example.com"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Order Number (if applicable)
                </label>
                <input
                  type="text"
                  value={formData.orderNumber}
                  onChange={(e) => setFormData({ ...formData, orderNumber: e.target.value })}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600"
                  placeholder="ORD-2024-001"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-3">
                  What can we help you with? *
                </label>
                <div className="grid md:grid-cols-2 gap-3">
                  {categories.map((cat) => (
                    <button
                      key={cat.value}
                      type="button"
                      onClick={() => setFormData({ ...formData, category: cat.value })}
                      className={`p-4 rounded-lg border-2 text-left transition-all ${
                        formData.category === cat.value
                          ? 'border-gray-900 bg-gray-50'
                          : 'border-gray-300 hover:border-gray-400'
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <i className={`${cat.icon} text-2xl ${
                          formData.category === cat.value ? 'text-gray-900' : 'text-gray-400'
                        }`}></i>
                        <span className="font-semibold text-gray-900">{cat.label}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Priority Level *
                </label>
                <div className="flex space-x-4">
                  <label className={`flex-1 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                    formData.priority === 'low' ? 'border-gray-700 bg-gray-50' : 'border-gray-300'
                  }`}>
                    <input
                      type="radio"
                      value="low"
                      checked={formData.priority === 'low'}
                      onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                      className="sr-only"
                    />
                    <div className="text-center">
                      <p className="font-semibold text-gray-900">Low</p>
                      <p className="text-xs text-gray-600">3-5 days</p>
                    </div>
                  </label>
                  <label className={`flex-1 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                    formData.priority === 'normal' ? 'border-blue-700 bg-blue-50' : 'border-gray-300'
                  }`}>
                    <input
                      type="radio"
                      value="normal"
                      checked={formData.priority === 'normal'}
                      onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                      className="sr-only"
                    />
                    <div className="text-center">
                      <p className="font-semibold text-gray-900">Normal</p>
                      <p className="text-xs text-gray-600">1-2 days</p>
                    </div>
                  </label>
                  <label className={`flex-1 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                    formData.priority === 'high' ? 'border-red-700 bg-red-50' : 'border-gray-300'
                  }`}>
                    <input
                      type="radio"
                      value="high"
                      checked={formData.priority === 'high'}
                      onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                      className="sr-only"
                    />
                    <div className="text-center">
                      <p className="font-semibold text-gray-900">High</p>
                      <p className="text-xs text-gray-600">Within 24h</p>
                    </div>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Subject *
                </label>
                <input
                  type="text"
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600"
                  placeholder="Brief description of your issue"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-2">
                  Description *
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600 h-32 resize-none"
                  placeholder="Please provide as much detail as possible..."
                  required
                  maxLength={500}
                />
                <p className="text-sm text-gray-500 mt-1">
                  {formData.description.length}/500 characters
                </p>
              </div>

              {submitError && (
                <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg text-sm">
                  {submitError}
                </div>
              )}

              <div className="flex space-x-4 pt-6">
                <button
                  type="button"
                  onClick={() => router.push('/help')}
                  className="flex-1 py-4 border-2 border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 transition-colors whitespace-nowrap"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-4 bg-gray-900 hover:bg-gray-800 text-white rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {isSubmitting ? (
                    <>
                      <i className="ri-loader-4-line animate-spin mr-2"></i>
                      Submitting...
                    </>
                  ) : (
                    'Submit Ticket'
                  )}
                </button>
              </div>
            </form>
          </div>

          <div className="mt-8 bg-blue-50 border border-blue-200 rounded-xl p-6">
            <div className="flex items-start space-x-3">
              <i className="ri-information-line text-2xl text-blue-700 mt-0.5"></i>
              <div>
                <p className="font-semibold text-blue-900 mb-2">Before submitting a ticket</p>
                <ul className="text-sm text-blue-700 space-y-1">
                  <li>• Check our <Link href="/help" className="underline hover:text-blue-900">Help Center</Link> for quick answers</li>
                  <li>• Average response time: 24 hours</li>
                  <li>• Include your order number for faster assistance</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
