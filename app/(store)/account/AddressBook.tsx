'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase';

interface AddressRow {
  id: string;
  full_name: string;
  phone: string;
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  is_default: boolean | null;
}

type AddressForm = {
  full_name: string;
  phone: string;
  address_line1: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  is_default: boolean;
};

const EMPTY_FORM: AddressForm = {
  full_name: '',
  phone: '',
  address_line1: '',
  city: '',
  state: '',
  postal_code: '',
  country: 'Ghana',
  is_default: false,
};

const inputClass =
  'w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent';

export default function AddressBook() {
  const [userId, setUserId] = useState<string | null>(null);
  const [addresses, setAddresses] = useState<AddressRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AddressForm>(EMPTY_FORM);

  const loadAddresses = async (uid: string) => {
    const { data, error: loadError } = await supabase
      .from('addresses')
      .select('id, full_name, phone, address_line1, address_line2, city, state, postal_code, country, is_default')
      .eq('user_id', uid)
      .order('created_at', { ascending: true });
    if (loadError) {
      console.error('Failed to load addresses:', loadError);
      setError('We could not load your addresses.');
    } else {
      setAddresses((data as AddressRow[]) || []);
    }
  };

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id ?? null;
      setUserId(uid);
      if (uid) await loadAddresses(uid);
      setLoading(false);
    })();
  }, []);

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  // Only one default address at a time
  const clearOtherDefaults = async (uid: string, keepId: string) => {
    await supabase.from('addresses').update({ is_default: false }).eq('user_id', uid).neq('id', keepId);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    setSaving(true);
    setError('');

    const payload = {
      full_name: form.full_name.trim(),
      phone: form.phone.trim(),
      address_line1: form.address_line1.trim(),
      address_line2: null, // the form edits a single combined line
      city: form.city.trim(),
      state: form.state.trim(),
      postal_code: form.postal_code.trim(),
      country: form.country.trim() || 'Ghana',
      is_default: form.is_default || addresses.length === 0,
    };

    let savedId = editingId;
    if (editingId) {
      const { error: updateError } = await supabase.from('addresses').update(payload).eq('id', editingId);
      if (updateError) {
        console.error('Failed to update address:', updateError);
        setError('We could not save this address. Please check the details and try again.');
        setSaving(false);
        return;
      }
    } else {
      const { data, error: insertError } = await supabase
        .from('addresses')
        .insert({ ...payload, user_id: userId, type: 'shipping' })
        .select('id')
        .single();
      if (insertError || !data) {
        console.error('Failed to add address:', insertError);
        setError('We could not save this address. Please check the details and try again.');
        setSaving(false);
        return;
      }
      savedId = data.id;
    }

    if (payload.is_default && savedId) await clearOtherDefaults(userId, savedId);
    await loadAddresses(userId);
    setSaving(false);
    closeForm();
  };

  const startEdit = (address: AddressRow) => {
    setEditingId(address.id);
    setForm({
      full_name: address.full_name || '',
      phone: address.phone || '',
      address_line1: [address.address_line1, address.address_line2].filter(Boolean).join(', '),
      city: address.city || '',
      state: address.state || '',
      postal_code: address.postal_code || '',
      country: address.country || 'Ghana',
      is_default: !!address.is_default,
    });
    setShowForm(true);
  };

  const deleteAddress = async (id: string) => {
    if (!userId) return;
    if (!window.confirm('Delete this address?')) return;
    setError('');
    const { error: deleteError } = await supabase.from('addresses').delete().eq('id', id);
    if (deleteError) {
      console.error('Failed to delete address:', deleteError);
      setError('We could not delete this address.');
      return;
    }
    setAddresses((prev) => prev.filter((addr) => addr.id !== id));
  };

  const setDefault = async (id: string) => {
    if (!userId) return;
    setError('');
    const { error: defaultError } = await supabase.from('addresses').update({ is_default: true }).eq('id', id);
    if (defaultError) {
      setError('We could not update your default address.');
      return;
    }
    await clearOtherDefaults(userId, id);
    await loadAddresses(userId);
  };

  const field = (key: keyof AddressForm) => ({
    value: form[key] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm((prev) => ({ ...prev, [key]: e.target.value })),
  });

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <i className="ri-loader-4-line animate-spin text-3xl text-gray-500"></i>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        <h2 className="text-2xl font-bold text-gray-900">Address Book</h2>
        {!showForm && (
          <button
            onClick={() => {
              setEditingId(null);
              setForm(EMPTY_FORM);
              setShowForm(true);
            }}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg font-semibold hover:bg-gray-800 transition-colors whitespace-nowrap"
          >
            <i className="ri-add-line mr-2"></i>
            Add New Address
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg mb-6 text-sm">{error}</div>
      )}

      {showForm && (
        <div className="bg-white border-2 border-gray-900 rounded-lg p-6 mb-6">
          <h3 className="text-xl font-bold text-gray-900 mb-4">
            {editingId ? 'Edit Address' : 'New Address'}
          </h3>
          <form onSubmit={handleSubmit} className="grid md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="addr-name" className="block text-sm font-semibold text-gray-900 mb-2">Full Name</label>
              <input id="addr-name" type="text" required className={inputClass} placeholder="Ama Mensah" {...field('full_name')} />
            </div>
            <div>
              <label htmlFor="addr-phone" className="block text-sm font-semibold text-gray-900 mb-2">Phone Number</label>
              <input id="addr-phone" type="tel" required className={inputClass} placeholder="+233 24 123 4567" {...field('phone')} />
            </div>
            <div className="md:col-span-2">
              <label htmlFor="addr-line1" className="block text-sm font-semibold text-gray-900 mb-2">Street Address / Landmark</label>
              <input id="addr-line1" type="text" required className={inputClass} placeholder="House number, street, landmark" {...field('address_line1')} />
            </div>
            <div>
              <label htmlFor="addr-city" className="block text-sm font-semibold text-gray-900 mb-2">City / Town</label>
              <input id="addr-city" type="text" required className={inputClass} placeholder="Accra" {...field('city')} />
            </div>
            <div>
              <label htmlFor="addr-state" className="block text-sm font-semibold text-gray-900 mb-2">Region</label>
              <input id="addr-state" type="text" required className={inputClass} placeholder="Greater Accra" {...field('state')} />
            </div>
            <div>
              <label htmlFor="addr-postal" className="block text-sm font-semibold text-gray-900 mb-2">Digital Address / Postal Code (optional)</label>
              <input id="addr-postal" type="text" className={inputClass} placeholder="GA-123-4567" {...field('postal_code')} />
            </div>
            <div>
              <label htmlFor="addr-country" className="block text-sm font-semibold text-gray-900 mb-2">Country</label>
              <input id="addr-country" type="text" required className={inputClass} placeholder="Ghana" {...field('country')} />
            </div>
            <div className="md:col-span-2">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={form.is_default}
                  onChange={(e) => setForm((prev) => ({ ...prev, is_default: e.target.checked }))}
                  className="w-4 h-4 text-gray-900 border-gray-300 rounded focus:ring-gray-900"
                />
                <span className="ml-2 text-sm text-gray-700">Set as default address</span>
              </label>
            </div>
            <div className="md:col-span-2 flex space-x-3">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 py-3 bg-gray-900 text-white rounded-lg font-semibold hover:bg-gray-800 transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving...' : 'Save Address'}
              </button>
              <button
                type="button"
                onClick={closeForm}
                className="flex-1 py-3 border-2 border-gray-300 text-gray-900 rounded-lg font-semibold hover:bg-gray-50 transition-colors whitespace-nowrap"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {addresses.length === 0 && !showForm && (
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-600">
          <i className="ri-map-pin-line text-3xl text-gray-400 mb-2 block"></i>
          You haven&apos;t saved any addresses yet.
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {addresses.map((address) => (
          <div
            key={address.id}
            className={`bg-white border-2 rounded-lg p-6 relative ${address.is_default ? 'border-gray-900' : 'border-gray-200'}`}
          >
            {address.is_default && (
              <div className="absolute top-4 right-4">
                <span className="px-3 py-1 bg-gray-900 text-white text-xs font-semibold rounded-full whitespace-nowrap">
                  Default
                </span>
              </div>
            )}

            <div className="mb-4">
              <h3 className="text-lg font-bold text-gray-900">{address.full_name}</h3>
              <p className="text-gray-600">{address.phone}</p>
            </div>

            <div className="text-gray-700 space-y-1 mb-6">
              <p>{address.address_line1}</p>
              {address.address_line2 && <p>{address.address_line2}</p>}
              <p>{[address.city, address.state].filter(Boolean).join(', ')} {address.postal_code}</p>
              <p>{address.country}</p>
            </div>

            <div className="flex space-x-2">
              <button
                onClick={() => startEdit(address)}
                className="flex-1 py-2 border border-gray-300 text-gray-900 rounded-lg font-semibold hover:bg-gray-50 transition-colors whitespace-nowrap"
              >
                Edit
              </button>
              {!address.is_default && (
                <button
                  onClick={() => setDefault(address.id)}
                  className="flex-1 py-2 border border-gray-900 text-gray-900 rounded-lg font-semibold hover:bg-gray-50 transition-colors whitespace-nowrap"
                >
                  Set Default
                </button>
              )}
              <button
                onClick={() => deleteAddress(address.id)}
                aria-label="Delete address"
                className="px-4 py-2 border border-red-600 text-red-600 rounded-lg font-semibold hover:bg-red-50 transition-colors whitespace-nowrap"
              >
                <i className="ri-delete-bin-line"></i>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
