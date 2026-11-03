'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import OrderSummary from '@/components/OrderSummary';
import { useCart } from '@/context/CartContext';
import { supabase } from '@/lib/supabase';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useRecaptcha } from '@/hooks/useRecaptcha';
import { useCMS } from '@/context/CMSContext';

function parseShippingAmount(raw: string, fallback: number): number {
  const n = parseFloat(String(raw).replace(/,/g, ''));
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

export default function CheckoutPage() {
  usePageTitle('Checkout');
  const router = useRouter();
  const { cart, subtotal: cartSubtotal, clearCart } = useCart();
  const { getSetting } = useCMS();

  const [isLoading, setIsLoading] = useState(false);
  const [checkoutType, setCheckoutType] = useState<'guest' | 'account'>('guest');
  const [saveAddress, setSaveAddress] = useState(false);
  const [user, setUser] = useState<any>(null);
  const { getToken } = useRecaptcha();

  const [shippingData, setShippingData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    region: ''
  });

  // Ghana Regions for dropdown
  const ghanaRegions = [
    'Greater Accra',
    'Ashanti',
    'Western',
    'Central',
    'Eastern',
    'Northern',
    'Volta',
    'Upper East',
    'Upper West',
    'Brong-Ahafo',
    'Ahafo',
    'Bono',
    'Bono East',
    'North East',
    'Savannah',
    'Oti',
    'Western North'
  ];

  const [deliveryMethod, setDeliveryMethod] = useState<'doorstep' | 'house_pickup'>('doorstep');
  const [housePickupAcknowledged, setHousePickupAcknowledged] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'paystack' | 'moolre' | 'stripe' | 'paypal'>('moolre');
  const [errors, setErrors] = useState<any>({});



  // Check auth and cart
  useEffect(() => {
    async function checkUser() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUser(session.user);
        setCheckoutType('account'); // Auto-select account checkout if logged in
        // Pre-fill email if available
        setShippingData(prev => ({ ...prev, email: session.user.email || '' }));
      }
    }
    checkUser();

    // Small delay to ensure cart load
    const timer = setTimeout(() => {
      if (cart.length === 0 && !isLoading) {
        // router.push('/cart'); // Optional: redirect if empty
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [cart, router, isLoading]);

  // Calculate Totals (shipping amounts from admin Settings → Shipping & delivery)
  const subtotal = cartSubtotal;
  const currencySymbol = getSetting('currency_symbol') || 'GH₵';
  const doorstepShippingPrice = parseShippingAmount(getSetting('shipping_doorstep_price'), 50);
  const housePickupShippingPrice = parseShippingAmount(getSetting('shipping_house_pickup_price'), 0);
  const shippingCost = deliveryMethod === 'doorstep' ? doorstepShippingPrice : housePickupShippingPrice;
  const tax = 0; // No Tax

  // Coupon preview; /api/orders re-checks the code and computes the real discount.
  const [couponInput, setCouponInput] = useState('');
  const [coupon, setCoupon] = useState<{ code: string; discount: number; freeShipping: boolean } | null>(null);
  const [couponError, setCouponError] = useState('');
  const [couponChecking, setCouponChecking] = useState(false);

  const checkCoupon = async (code: string) => {
    if (!code.trim()) return;
    setCouponChecking(true);
    setCouponError('');
    try {
      const res = await fetch('/api/coupons/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, subtotal, shipping: shippingCost, email: shippingData.email }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCoupon(null);
        setCouponError(result.error || 'That coupon code is not valid.');
      } else {
        setCoupon(result);
      }
    } finally {
      setCouponChecking(false);
    }
  };

  // Re-check when the cart total or delivery method changes the discount.
  useEffect(() => {
    if (coupon) checkCoupon(coupon.code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtotal, shippingCost]);

  const discount = coupon?.discount || 0;
  const total = Math.max(0, subtotal + shippingCost + tax - discount);

  const validateShipping = () => {
    const newErrors: any = {};
    if (!shippingData.firstName) newErrors.firstName = 'First name is required';
    if (!shippingData.lastName) newErrors.lastName = 'Last name is required';
    if (!shippingData.email) newErrors.email = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(shippingData.email)) newErrors.email = 'Invalid email';
    if (!shippingData.phone) newErrors.phone = 'Phone is required';
    if (!shippingData.address) newErrors.address = 'Address is required';
    if (!shippingData.city) newErrors.city = 'City is required';
    if (!shippingData.region) newErrors.region = 'Region is required';
    if (deliveryMethod === 'house_pickup' && !housePickupAcknowledged) {
      newErrors.pickupPermission = 'Please confirm you have permission from the business owner for house pickup.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleContinueToPayment = async () => {
    if (!validateShipping()) {
      // Scroll to top smoothly so user can see the errors
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    // Initiate payment with selected method
    await handlePlaceOrder();
  };



  const handlePlaceOrder = async () => {
    if (cart.length === 0) {
      alert('Your cart is empty');
      return;
    }

    setIsLoading(true);

    // reCAPTCHA verification
    const isHuman = await getToken('checkout');
    if (!isHuman) {
      alert('Security verification failed. Please try again.');
      setIsLoading(false);
      return;
    }

    try {
      // The server prices the cart, checks stock and creates the order.
      const { data: { session } } = await supabase.auth.getSession();
      const orderRes = await fetch('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          items: cart.map(item => ({
            id: item.id,
            variant: item.variant ?? null,
            variantId: item.variantId ?? null,
            quantity: item.quantity,
          })),
          shipping: shippingData,
          deliveryMethod,
          paymentMethod,
          couponCode: coupon?.code || null,
        }),
      });
      const orderResult = await orderRes.json().catch(() => ({}));
      if (!orderRes.ok || !orderResult.orderNumber) {
        throw new Error(orderResult.error || 'We could not place your order. Please try again.');
      }
      const orderNumber: string = orderResult.orderNumber;

      // Start payment. The payment route charges the order total stored on the server.
      const endpoint = {
        paystack: '/api/payment/paystack',
        moolre: '/api/payment/moolre',
        stripe: '/api/payment/stripe',
        paypal: '/api/payment/paypal',
      }[paymentMethod];

      try {
        const paymentRes = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId: orderNumber }),
        });
        const paymentResult = await paymentRes.json();
        if (!paymentResult.success) {
          throw new Error(paymentResult.message || 'Payment initialization failed');
        }
        clearCart();
        window.location.href = paymentResult.url;
        return;
      } catch (paymentErr: any) {
        // The order exists; send the shopper to its payment page so a retry reuses it.
        console.error('Payment Error:', paymentErr);
        clearCart();
        alert('We saved your order but could not open the payment page: ' + paymentErr.message + '\nYou can try paying again on the next page.');
        router.push(`/pay/${orderNumber}`);
        return;
      }

    } catch (err: any) {
      console.error('Checkout error:', err);
      alert('Failed to place order: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  if (cart.length === 0 && !isLoading) {
    return (
      <main className="min-h-screen bg-gray-50 py-20">
        <div className="max-w-md mx-auto text-center px-4">
          <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm">
            <i className="ri-shopping-cart-line text-4xl text-gray-300"></i>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Your cart is empty</h1>
          <p className="text-gray-600 mb-8">Add some items to start the checkout process.</p>
          <Link href="/shop" className="inline-block bg-gray-900 text-white px-8 py-3 rounded-lg font-semibold hover:bg-gray-800 transition-colors">
            Return to Shop
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8">
          <Link href="/cart" className="text-gray-600 hover:text-gray-900 font-medium inline-flex items-center whitespace-nowrap">
            <i className="ri-arrow-left-line mr-2"></i>
            Back to Cart
          </Link>
        </div>

        <h1 className="text-3xl font-bold text-gray-900 mb-8">Checkout</h1>

        <div className="mb-6 bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">
          <h2 className="text-2xl font-serif text-gray-900 mb-6">How would you like to checkout?</h2>
            <div className="grid md:grid-cols-2 gap-5">
              <button
                onClick={() => !user && setCheckoutType('guest')}
                className={`p-5 rounded-2xl border-2 transition-all text-left cursor-pointer relative overflow-hidden group ${checkoutType === 'guest'
                  ? 'border-brand-blue bg-brand-gold/5'
                  : 'border-gray-100 hover:border-gray-300 bg-white'
                  } ${user ? 'opacity-50 cursor-not-allowed' : ''}`}
                disabled={!!user}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${checkoutType === 'guest' ? 'bg-brand-blue text-white' : 'bg-gray-100 text-gray-500 group-hover:bg-gray-200'}`}>
                    <i className="ri-user-line text-xl"></i>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${checkoutType === 'guest' ? 'border-brand-blue bg-brand-blue' : 'border-gray-300'
                    }`}>
                    {checkoutType === 'guest' && <i className="ri-check-line text-white text-xs"></i>}
                  </div>
                </div>
                <h3 className="text-base font-bold text-gray-900 mb-1.5">Guest Checkout</h3>
                <p className="text-[13px] text-gray-500 leading-relaxed">Fast and easy checkout without creating an account.</p>
                {user && <p className="text-[11px] font-semibold text-amber-600 mt-2 flex items-center"><i className="ri-error-warning-fill mr-1"></i> You are logged in</p>}
              </button>

              <button
                onClick={() => setCheckoutType('account')}
                className={`p-5 rounded-2xl border-2 transition-all text-left cursor-pointer relative overflow-hidden group ${checkoutType === 'account'
                  ? 'border-brand-blue bg-brand-gold/5'
                  : 'border-gray-100 hover:border-gray-300 bg-white'
                  }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${checkoutType === 'account' ? 'bg-brand-blue text-white' : 'bg-gray-100 text-gray-500 group-hover:bg-gray-200'}`}>
                    <i className="ri-account-circle-line text-xl"></i>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${checkoutType === 'account' ? 'border-brand-blue bg-brand-blue' : 'border-gray-300'
                    }`}>
                    {checkoutType === 'account' && <i className="ri-check-line text-white text-xs"></i>}
                  </div>
                </div>
                <h3 className="text-base font-bold text-gray-900 mb-1.5">{user ? 'My Account' : 'Create Account'}</h3>
                <p className="text-[13px] text-gray-500 leading-relaxed">
                  {user ? `Logged in as ${user.email}` : 'Save your details for faster checkout next time.'}
                </p>
              </button>
            </div>
          </div>

        <div className="grid lg:grid-cols-12 gap-8 lg:gap-12 mt-10">
          <div className="lg:col-span-7 xl:col-span-8">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8 mb-6">
              <h2 className="text-2xl font-serif text-gray-900 mb-8">Shipping Information</h2>

                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <input
                          type="text"
                          value={shippingData.firstName}
                          onChange={(e) => setShippingData({ ...shippingData, firstName: e.target.value })}
                          className={`w-full px-5 py-4 bg-gray-50/50 border rounded-xl focus:ring-2 focus:ring-gray-900 focus:border-gray-900 transition-all text-sm placeholder-gray-400 ${errors.firstName ? 'border-red-500 bg-red-50/30' : 'border-gray-200'
                            }`}
                          placeholder="First Name *"
                        />
                        {errors.firstName && <p className="text-xs text-red-500 mt-2 font-medium flex items-center"><i className="ri-error-warning-line mr-1"></i>{errors.firstName}</p>}
                      </div>
                      <div>
                        <input
                          type="text"
                          value={shippingData.lastName}
                          onChange={(e) => setShippingData({ ...shippingData, lastName: e.target.value })}
                          className={`w-full px-5 py-4 bg-gray-50/50 border rounded-xl focus:ring-2 focus:ring-gray-900 focus:border-gray-900 transition-all text-sm placeholder-gray-400 ${errors.lastName ? 'border-red-500 bg-red-50/30' : 'border-gray-200'
                            }`}
                          placeholder="Last Name *"
                        />
                        {errors.lastName && <p className="text-xs text-red-500 mt-2 font-medium flex items-center"><i className="ri-error-warning-line mr-1"></i>{errors.lastName}</p>}
                      </div>
                    </div>

                    <div>
                      <input
                        type="email"
                        value={shippingData.email}
                        readOnly={!!user}
                        onChange={(e) => setShippingData({ ...shippingData, email: e.target.value })}
                        className={`w-full px-5 py-4 bg-gray-50/50 border rounded-xl focus:ring-2 focus:ring-gray-900 focus:border-gray-900 transition-all text-sm placeholder-gray-400 ${errors.email ? 'border-red-500 bg-red-50/30' : 'border-gray-200'
                          } ${user ? 'bg-gray-100 cursor-not-allowed text-gray-500' : ''}`}
                        placeholder="Email Address *"
                      />
                      {errors.email && <p className="text-xs text-red-500 mt-2 font-medium flex items-center"><i className="ri-error-warning-line mr-1"></i>{errors.email}</p>}
                    </div>

                    <div>
                      <input
                        type="tel"
                        value={shippingData.phone}
                        onChange={(e) => setShippingData({ ...shippingData, phone: e.target.value })}
                        className={`w-full px-5 py-4 bg-gray-50/50 border rounded-xl focus:ring-2 focus:ring-gray-900 focus:border-gray-900 transition-all text-sm placeholder-gray-400 ${errors.phone ? 'border-red-500 bg-red-50/30' : 'border-gray-200'
                          }`}
                        placeholder="Phone Number (+233 XX XXX XXXX) *"
                      />
                      {errors.phone && <p className="text-xs text-red-500 mt-2 font-medium flex items-center"><i className="ri-error-warning-line mr-1"></i>{errors.phone}</p>}
                    </div>

                    <div>
                      <input
                        type="text"
                        value={shippingData.address}
                        onChange={(e) => setShippingData({ ...shippingData, address: e.target.value })}
                        className={`w-full px-5 py-4 bg-gray-50/50 border rounded-xl focus:ring-2 focus:ring-gray-900 focus:border-gray-900 transition-all text-sm placeholder-gray-400 ${errors.address ? 'border-red-500 bg-red-50/30' : 'border-gray-200'
                          }`}
                        placeholder="Street Address *"
                      />
                      {errors.address && <p className="text-xs text-red-500 mt-2 font-medium flex items-center"><i className="ri-error-warning-line mr-1"></i>{errors.address}</p>}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <input
                          type="text"
                          value={shippingData.city}
                          onChange={(e) => setShippingData({ ...shippingData, city: e.target.value })}
                          className={`w-full px-5 py-4 bg-gray-50/50 border rounded-xl focus:ring-2 focus:ring-gray-900 focus:border-gray-900 transition-all text-sm placeholder-gray-400 ${errors.city ? 'border-red-500 bg-red-50/30' : 'border-gray-200'
                            }`}
                          placeholder="City *"
                        />
                        {errors.city && <p className="text-xs text-red-500 mt-2 font-medium flex items-center"><i className="ri-error-warning-line mr-1"></i>{errors.city}</p>}
                      </div>
                      <div>
                        <div className="relative">
                          <select
                            value={shippingData.region}
                            onChange={(e) => setShippingData({ ...shippingData, region: e.target.value })}
                            className={`w-full px-5 py-4 bg-gray-50/50 border rounded-xl focus:ring-2 focus:ring-gray-900 focus:border-gray-900 transition-all text-sm appearance-none ${errors.region ? 'border-red-500 bg-red-50/30' : 'border-gray-200'
                              } ${!shippingData.region ? 'text-gray-400' : 'text-gray-900'}`}
                          >
                            <option value="" disabled hidden>Region *</option>
                            {ghanaRegions.map((region) => (
                              <option key={region} value={region} className="text-gray-900">{region}</option>
                            ))}
                          </select>
                          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-gray-500">
                            <i className="ri-arrow-down-s-line text-lg"></i>
                          </div>
                        </div>
                        {errors.region && <p className="text-xs text-red-500 mt-2 font-medium flex items-center"><i className="ri-error-warning-line mr-1"></i>{errors.region}</p>}
                      </div>
                    </div>

                    {checkoutType === 'account' && (
                      <label className="flex items-center space-x-3 cursor-pointer mt-4 p-4 border border-brand-gold/30 rounded-xl bg-brand-gold/5 hover:bg-brand-gold/10 transition-colors">
                        <input
                          type="checkbox"
                          checked={saveAddress}
                          onChange={(e) => setSaveAddress(e.target.checked)}
                          className="w-5 h-5 text-brand-blue rounded border-gray-300 focus:ring-brand-blue"
                        />
                        <span className="text-sm font-medium text-gray-700">Save this address for future orders</span>
                      </label>
                    )}
                  </div>
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8 mb-6">
                  <h2 className="text-2xl font-serif text-gray-900 mb-8">Delivery</h2>
                  <div className="space-y-4">
                    <label
                      onClick={() => { setDeliveryMethod('doorstep'); setHousePickupAcknowledged(false); }}
                      className={`flex items-center justify-between p-5 border-2 rounded-xl cursor-pointer transition-all ${deliveryMethod === 'doorstep' ? 'border-brand-blue bg-brand-gold/5 shadow-sm' : 'border-gray-100 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center space-x-4 min-w-0">
                        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${deliveryMethod === 'doorstep' ? 'border-brand-blue bg-brand-blue' : 'border-gray-300'}`}>
                          {deliveryMethod === 'doorstep' && <div className="w-2 h-2 bg-white rounded-full"></div>}
                        </div>
                        <div>
                          <p className="font-bold text-gray-900 text-[15px]">Delivery</p>
                          <p className="text-sm text-gray-500 mt-0.5">Standard doorstep delivery to your address</p>
                        </div>
                      </div>
                      <p className="font-bold text-amber-600 bg-amber-50 px-3 py-1 rounded-lg border border-amber-200 text-xs tracking-wider uppercase shadow-sm flex-shrink-0 ml-2">
                        {currencySymbol}{doorstepShippingPrice.toFixed(2)}
                      </p>
                    </label>

                    <div>
                      <label
                        onClick={() => setDeliveryMethod('house_pickup')}
                        className={`flex items-start justify-between p-5 border-2 rounded-xl cursor-pointer transition-all ${deliveryMethod === 'house_pickup' ? 'border-brand-blue bg-brand-gold/5 shadow-sm' : 'border-gray-100 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-start space-x-4 min-w-0">
                          <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors ${deliveryMethod === 'house_pickup' ? 'border-brand-blue bg-brand-blue' : 'border-gray-300'}`}>
                            {deliveryMethod === 'house_pickup' && <div className="w-2 h-2 bg-white rounded-full"></div>}
                          </div>
                          <div>
                            <p className="font-bold text-gray-900 text-[15px]">House pickup</p>
                            <p className="text-sm text-amber-800 mt-1 font-medium">You must get permission from the business owner before choosing this option.</p>
                            <p className="text-sm text-gray-500 mt-1">
                              {housePickupShippingPrice <= 0
                                ? 'Collect from our location after approval — no pickup fee.'
                                : `Collect from our location after approval — pickup fee applies.`}
                            </p>
                          </div>
                        </div>
                        <p className="font-bold text-brand-blue bg-brand-gold/20 px-3 py-1 rounded-lg border border-brand-gold/30 text-xs tracking-wider uppercase shadow-sm flex-shrink-0 ml-2">
                          {housePickupShippingPrice <= 0 ? 'FREE' : `${currencySymbol}${housePickupShippingPrice.toFixed(2)}`}
                        </p>
                      </label>
                      {deliveryMethod === 'house_pickup' && (
                        <div className="mt-3 ml-10 sm:ml-14 p-4 bg-amber-50/80 border border-amber-200 rounded-xl">
                          <label className="flex items-start gap-3 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={housePickupAcknowledged}
                              onChange={(e) => setHousePickupAcknowledged(e.target.checked)}
                              className="w-5 h-5 mt-0.5 text-brand-blue rounded border-gray-300 focus:ring-brand-blue"
                            />
                            <span className="text-sm text-gray-800">
                              I confirm I have received permission from the business owner to use house pickup.
                            </span>
                          </label>
                          {errors.pickupPermission && (
                            <p className="text-sm text-red-600 mt-2">{errors.pickupPermission}</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <h2 className="text-2xl font-serif text-gray-900 mt-12 mb-6">Payment Method</h2>
                  <p className="text-sm text-gray-500 mb-6">Select your preferred payment method.</p>
                  <div className="grid grid-cols-1 gap-4">
                    {/* 
                    <label
                      className={`flex items-center gap-4 p-5 border-2 rounded-xl cursor-pointer transition-all relative overflow-hidden group ${paymentMethod === 'paystack' ? 'border-brand-blue bg-brand-gold/5 shadow-sm' : 'border-gray-100 hover:border-gray-300'}`}
                    >
                      <input
                        type="radio"
                        name="payment"
                        value="paystack"
                        checked={paymentMethod === 'paystack'}
                        onChange={() => setPaymentMethod('paystack')}
                        className="sr-only"
                      />
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors z-10 ${paymentMethod === 'paystack' ? 'border-brand-blue bg-brand-blue' : 'border-gray-300 group-hover:border-gray-400'}`}>
                           {paymentMethod === 'paystack' && <div className="w-2 h-2 bg-white rounded-full"></div>}
                      </div>
                      <div className="w-10 h-10 bg-white rounded-lg shadow-sm border border-gray-100 flex items-center justify-center flex-shrink-0 z-10">
                         <i className="ri-bank-card-line text-xl text-gray-700"></i>
                      </div>
                      <div className="min-w-0 z-10">
                        <p className="font-bold text-gray-900 text-[14px]">Paystack</p>
                        <p className="text-[11px] text-gray-500 mt-0.5 truncate">Card & Mobile Money</p>
                      </div>
                    </label>
                    */}

                    <label
                      onClick={() => setPaymentMethod('moolre')}
                      className={`flex items-center gap-4 p-5 border-2 rounded-xl cursor-pointer transition-all relative overflow-hidden group ${paymentMethod === 'moolre' ? 'border-brand-blue bg-brand-gold/5 shadow-sm' : 'border-gray-100 hover:border-gray-300'}`}
                    >
                      <input
                        type="radio"
                        name="payment"
                        value="moolre"
                        checked={paymentMethod === 'moolre'}
                        onChange={() => setPaymentMethod('moolre')}
                        className="sr-only"
                      />
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors z-10 ${paymentMethod === 'moolre' ? 'border-brand-blue bg-brand-blue' : 'border-gray-300 group-hover:border-gray-400'}`}>
                           {paymentMethod === 'moolre' && <div className="w-2 h-2 bg-white rounded-full"></div>}
                      </div>
                      <div className="w-10 h-10 bg-white rounded-lg shadow-sm border border-gray-100 flex items-center justify-center flex-shrink-0 z-10">
                         <i className="ri-smartphone-line text-xl text-gray-700"></i>
                      </div>
                      <div className="min-w-0 z-10">
                        <p className="font-bold text-gray-900 text-[14px]">Mobile Money</p>
                        <p className="text-[11px] text-gray-500 mt-0.5 truncate">Pay securely with Mobile Money</p>
                      </div>
                    </label>

                    {/* 
                    <label
                      className={`flex items-center gap-4 p-5 border-2 rounded-xl cursor-pointer transition-all relative overflow-hidden group ${paymentMethod === 'stripe' ? 'border-brand-blue bg-brand-gold/5 shadow-sm' : 'border-gray-100 hover:border-gray-300'}`}
                    >
                      <input
                        type="radio"
                        name="payment"
                        value="stripe"
                        checked={paymentMethod === 'stripe'}
                        onChange={() => setPaymentMethod('stripe')}
                        className="sr-only"
                      />
                       <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors z-10 ${paymentMethod === 'stripe' ? 'border-brand-blue bg-brand-blue' : 'border-gray-300 group-hover:border-gray-400'}`}>
                           {paymentMethod === 'stripe' && <div className="w-2 h-2 bg-white rounded-full"></div>}
                      </div>
                      <div className="w-10 h-10 bg-white rounded-lg shadow-sm border border-gray-100 flex items-center justify-center flex-shrink-0 z-10">
                         <i className="ri-bank-card-2-line text-xl text-gray-700"></i>
                      </div>
                      <div className="min-w-0 z-10">
                        <p className="font-bold text-gray-900 text-[14px]">Stripe</p>
                        <p className="text-[11px] text-gray-500 mt-0.5 truncate">Credit/Debit Cards</p>
                      </div>
                    </label>

                    <label
                      className={`flex items-center gap-4 p-5 border-2 rounded-xl cursor-pointer transition-all relative overflow-hidden group ${paymentMethod === 'paypal' ? 'border-brand-blue bg-brand-gold/5 shadow-sm' : 'border-gray-100 hover:border-gray-300'}`}
                    >
                      <input
                        type="radio"
                        name="payment"
                        value="paypal"
                        checked={paymentMethod === 'paypal'}
                        onChange={() => setPaymentMethod('paypal')}
                        className="sr-only"
                      />
                       <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors z-10 ${paymentMethod === 'paypal' ? 'border-brand-blue bg-brand-blue' : 'border-gray-300 group-hover:border-gray-400'}`}>
                           {paymentMethod === 'paypal' && <div className="w-2 h-2 bg-white rounded-full"></div>}
                      </div>
                      <div className="w-10 h-10 bg-white rounded-lg shadow-sm border border-gray-100 flex items-center justify-center flex-shrink-0 z-10">
                         <i className="ri-paypal-line text-xl text-gray-700"></i>
                      </div>
                      <div className="min-w-0 z-10">
                        <p className="font-bold text-gray-900 text-[14px]">PayPal</p>
                        <p className="text-[11px] text-gray-500 mt-0.5 truncate">PayPal Balance</p>
                      </div>
                    </label>
                    */}
                  </div>

                  <div className="mt-10">
                    <button
                      onClick={handleContinueToPayment}
                      disabled={isLoading}
                      className="w-full bg-brand-blue hover:bg-brand-blue/90 text-white h-14 rounded-xl font-bold transition-all whitespace-nowrap cursor-pointer disabled:opacity-70 shadow-lg hover:shadow-xl hover:-translate-y-0.5 flex items-center justify-center text-[15px]"
                    >
                      {isLoading ? (
                        <>
                          <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Processing...
                        </>
                      ) : (
                        <>
                          Complete Order <i className="ri-secure-payment-line ml-2 text-lg"></i>
                        </>
                      )}
                    </button>
                  </div>
                </div>
          </div>

          <div className="lg:col-span-5 xl:col-span-4">
            <div className="sticky top-24">
              <OrderSummary
                items={cart}
                subtotal={subtotal}
                shipping={shippingCost}
                tax={tax}
                total={total}
                discount={discount}
                couponCode={coupon?.code}
                couponSlot={
                  coupon ? (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-green-700 font-medium"><i className="ri-coupon-3-line mr-1"></i>{coupon.code} applied</span>
                      <button type="button" onClick={() => { setCoupon(null); setCouponInput(''); }} className="text-gray-500 hover:text-gray-900 underline">Remove</button>
                    </div>
                  ) : (
                    <form onSubmit={(e) => { e.preventDefault(); checkCoupon(couponInput); }} className="space-y-2">
                      <label htmlFor="coupon" className="text-sm font-medium text-gray-700">Coupon code</label>
                      <div className="flex gap-2">
                        <input
                          id="coupon"
                          value={couponInput}
                          onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                          className="flex-1 min-w-0 px-3 py-2 border border-gray-300 rounded-lg text-sm uppercase"
                          placeholder="Enter code"
                          autoComplete="off"
                        />
                        <button type="submit" disabled={couponChecking || !couponInput.trim()} className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-semibold disabled:opacity-50">
                          {couponChecking ? 'Checking…' : 'Apply'}
                        </button>
                      </div>
                      {couponError && <p className="text-sm text-red-600">{couponError}</p>}
                    </form>
                  )
                }
              />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
