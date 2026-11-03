"use client";

import { useState, type FormEvent } from 'react';
import { useCMS } from '@/context/CMSContext';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useRecaptcha } from '@/hooks/useRecaptcha';
import AnimatedSection from '@/components/AnimatedSection';

interface TeamContact {
  name: string;
  phone: string;
  role: string;
}

export default function ContactPage() {
  usePageTitle('Contact Us');
  const { getSetting, getSettingJSON } = useCMS();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    subject: '',
    message: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState('idle' as 'idle' | 'success' | 'error');
  const { getToken, verifying } = useRecaptcha();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitStatus('idle');

    // reCAPTCHA verification
    const isHuman = await getToken('contact');
    if (!isHuman) {
      setSubmitStatus('error');
      setIsSubmitting(false);
      return;
    }

    try {
      const res = await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'contact',
          payload: {
            name: formData.name,
            email: formData.email,
            subject: formData.subject,
            message: formData.phone.trim()
              ? `${formData.message}\n\nPhone: ${formData.phone.trim()}`
              : formData.message,
          },
        }),
      });

      if (!res.ok) {
        setSubmitStatus('error');
        return;
      }

      setSubmitStatus('success');
      setFormData({ name: '', email: '', phone: '', subject: '', message: '' });
    } catch (error) {
      setSubmitStatus('error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // CMS-driven config (fallbacks = store details)
  const contactEmail = getSetting('contact_email') || 'info@multimeysupplies.com';
  const contactPhone = getSetting('contact_phone') || '+233209597443';
  const whatsappNumber = getSetting('social_whatsapp') || contactPhone;
  const whatsappLink = `https://wa.me/${whatsappNumber.replace(/\D/g, '')}`;
  const contactAddress = getSetting('contact_address') || 'Accra, Ghana';
  const heroTitle = getSetting('contact_hero_title') || 'Get In Touch';
  const heroSubtitle = getSetting('contact_hero_subtitle') || 'We\'d love to hear from you. Our team is always here to chat.';
  const contactHours = getSetting('contact_hours') || 'Mon-Fri, 8am-6pm GMT';
  const contactVisitHours = getSetting('contact_visit_hours') || 'Mon-Sat, 9am-6pm';
  const contactMapLink = getSetting('contact_map_link') || 'https://maps.google.com';
  const teamContacts = getSettingJSON('contact_team_json', []) as TeamContact[];

  const contactMethods = [
    {
      icon: 'ri-whatsapp-line',
      title: 'WhatsApp',
      value: whatsappNumber,
      link: whatsappLink,
      description: getSetting('contact_whatsapp_hours') || 'No calls. But chat with us instantly.'
    },
    {
      icon: 'ri-snapchat-line',
      title: 'Snapchat',
      value: '@saftlyf',
      link: 'https://www.snapchat.com/add/saftlyf',
      description: 'Streak us your packages!!'
    },
    {
      icon: 'ri-mail-line',
      title: 'Email Us',
      value: contactEmail,
      link: `mailto:${contactEmail}`,
      description: 'We respond within 24 hours'
    },
    {
      icon: 'ri-map-pin-line',
      title: 'Visit Us',
      value: contactAddress,
      link: contactMapLink,
      description: contactVisitHours
    }
  ];

  const faqs = [
    {
      question: 'What are your delivery times?',
      answer: 'Standard delivery takes 2-5 business days. Express delivery (next-day) is available for Accra only.'
    },
    {
      question: 'Do you offer international shipping?',
      answer: 'Currently, we ship within Ghana only. We plan to expand to neighbouring countries soon.'
    },
    {
      question: 'What payment methods do you accept?',
      answer: 'We accept mobile money (MTN, Vodafone, AirtelTigo) and credit/debit cards through our secure Moolre payment gateway.'
    }
  ];

  const content = (() =>
    <div className="min-h-screen bg-gray-50 font-sans">
      <div className="bg-gray-900 text-white pb-32 lg:pb-48 pt-24 lg:pt-32 relative overflow-hidden">
        <div className="absolute inset-0 grid grid-cols-3">
          <img src="/hero-1.png" alt="" className="w-full h-full object-cover object-center" />
          <img src="/hero-1.png" alt="" className="w-full h-full object-cover object-center" />
          <img src="/hero-1.png" alt="" className="w-full h-full object-cover object-center" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-gray-900/50 to-gray-900"></div>

        <AnimatedSection className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
          <h1 className="text-4xl md:text-6xl font-bold mb-6 tracking-tight">{heroTitle}</h1>
          <p className="text-xl text-gray-300 max-w-2xl mx-auto leading-relaxed font-light">
            {heroSubtitle}
          </p>
        </AnimatedSection>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-24 lg:-mt-32 relative z-20 pb-24">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Contact Info Cards */}
          <AnimatedSection direction="left" delay={0.1} className="lg:col-span-1 space-y-6">
            {contactMethods.map((method, index) => (
              <a
                key={index}
                href={method.link}
                target={method.link.startsWith('http') ? '_blank' : '_self'}
                rel={method.link.startsWith('http') ? 'noopener noreferrer' : ''}
                className="block bg-white p-8 rounded-2xl shadow-sm hover:shadow-xl transition-all duration-300 border border-gray-100 group hover-lift"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center group-hover:bg-gray-900 transition-colors duration-300 flex-shrink-0">
                    <i className={`${method.icon} text-2xl text-gray-900 group-hover:text-white transition-colors duration-300`}></i>
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 text-lg mb-1">{method.title}</h3>
                    <p className="text-gray-600 font-medium mb-2">{method.value}</p>
                    <p className="text-sm text-gray-400">{method.description}</p>
                  </div>
                </div>
              </a>
            ))}

            {/* Team Contacts */}
            {teamContacts.length > 0 && (
              <div className="bg-gradient-to-br from-gray-800 to-gray-900 text-white rounded-2xl p-8 shadow-lg hover-lift">
                <h3 className="text-xl font-bold mb-6">Direct Lines</h3>
                <div className="space-y-4">
                  {teamContacts.map((contact: TeamContact, index: number) => (
                    <div key={index} className="flex items-center justify-between border-b border-white/10 pb-4 last:border-0 last:pb-0">
                      <div>
                        <p className="font-medium text-white">{contact.name}</p>
                        <p className="text-xs text-gray-400">{contact.role}</p>
                      </div>
                      <div className="flex gap-2">
                        <a href={`https://wa.me/233${contact.phone.replace(/^0/, '')}`} className="w-8 h-8 bg-white/10 rounded-full flex items-center justify-center hover:bg-white hover:text-gray-900 transition-colors">
                          <i className="ri-whatsapp-line text-sm"></i>
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </AnimatedSection>

          {/* Contact Form */}
          <AnimatedSection direction="right" delay={0.2} className="lg:col-span-2">
            <div className="bg-white rounded-3xl shadow-xl p-8 lg:p-12 border border-gray-100 hover-lift">
              <h2 className="text-3xl font-bold text-gray-900 mb-2">Send us a Message</h2>
              <p className="text-gray-500 mb-6">Fill out the form below and we'll get back to you shortly.</p>
              <a
                href={whatsappLink}
                target="_blank"
                rel="noopener noreferrer"
                className="mb-10 flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 px-5 py-4 text-green-900 hover:bg-green-100 transition-colors"
              >
                <i className="ri-whatsapp-line text-2xl text-green-600"></i>
                <span className="text-sm">
                  <span className="font-bold">Need a fast reply?</span> Chat with us on WhatsApp at {whatsappNumber}.
                </span>
              </a>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label htmlFor="name" className="text-sm font-medium text-gray-900">Full Name</label>
                    <input
                      type="text"
                      id="name"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-gray-900/20 focus:border-gray-900 outline-none transition-all"
                      placeholder="John Doe"
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="email" className="text-sm font-medium text-gray-900">Email Address</label>
                    <input
                      type="email"
                      id="email"
                      required
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-gray-900/20 focus:border-gray-900 outline-none transition-all"
                      placeholder="john@example.com"
                    />
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label htmlFor="phone" className="text-sm font-medium text-gray-900">Phone Number</label>
                    <input
                      type="tel"
                      id="phone"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-gray-900/20 focus:border-gray-900 outline-none transition-all"
                      placeholder="+233 XX XXX XXXX"
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="subject" className="text-sm font-medium text-gray-900">Subject</label>
                    <input
                      type="text"
                      id="subject"
                      required
                      value={formData.subject}
                      onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-gray-900/20 focus:border-gray-900 outline-none transition-all"
                      placeholder="How can we help?"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label htmlFor="message" className="text-sm font-medium text-gray-900">Message</label>
                  <textarea
                    id="message"
                    required
                    rows={6}
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-gray-900/20 focus:border-gray-900 outline-none transition-all resize-none"
                    placeholder="Tell us more about your inquiry..."
                  ></textarea>
                </div>

                {submitStatus === 'success' && (
                  <div className="bg-green-50 border border-green-200 text-green-800 px-6 py-4 rounded-xl flex items-center gap-3">
                    <i className="ri-checkbox-circle-fill text-xl"></i>
                    <div>
                      <p className="font-bold">Thanks — we&apos;ve received your message.</p>
                      <p className="text-sm">For a faster reply, chat with us on WhatsApp.</p>
                    </div>
                  </div>
                )}

                {submitStatus === 'error' && (
                  <div className="bg-red-50 border border-red-200 text-red-800 px-6 py-4 rounded-xl flex items-center gap-3">
                    <i className="ri-error-warning-fill text-xl"></i>
                    <div>
                      <p className="font-bold">We couldn&apos;t send your message</p>
                      <p className="text-sm">
                        Please try again, or{' '}
                        <a href={whatsappLink} target="_blank" rel="noopener noreferrer" className="underline font-semibold">message us on WhatsApp</a>.
                      </p>
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting || verifying}
                  className="w-full bg-gray-900 text-white py-4 rounded-xl font-bold text-lg hover:bg-gray-800 transition-all hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isSubmitting || verifying ? (
                    <>
                      <i className="ri-loader-4-line animate-spin"></i>
                      <span>{verifying ? 'Verifying...' : 'Sending Message...'}</span>
                    </>
                  ) : (
                    <>
                      <span>Send Message</span>
                      <i className="ri-send-plane-fill"></i>
                    </>
                  )}
                </button>
              </form>
            </div>
          </AnimatedSection>

          {/* FAQ Section - full width, centered */}
          <AnimatedSection className="w-full mt-16">
            <div className="w-full text-center">
              <h2 className="text-2xl font-bold text-gray-900 mb-8">Frequently Asked Questions</h2>
              <div className="space-y-4 text-left w-full">
                {faqs.map((faq, index) => (
                  <details key={index} className="group bg-white rounded-2xl border border-gray-100 overflow-hidden">
                    <summary className="flex items-center justify-between px-6 py-5 cursor-pointer hover:bg-gray-50 transition-colors list-none">
                      <span className="font-medium text-gray-900">{faq.question}</span>
                      <span className="bg-gray-100 rounded-full w-8 h-8 flex items-center justify-center transition-transform group-open:rotate-180">
                        <i className="ri-arrow-down-s-line text-gray-600"></i>
                      </span>
                    </summary>
                    <div className="px-6 pb-6 pt-2 text-gray-600 leading-relaxed border-t border-gray-50">
                      {faq.answer}
                    </div>
                  </details>
                ))}
              </div>
            </div>
          </AnimatedSection>
        </div>
      </div>
    </div>)();

  return content;
}
