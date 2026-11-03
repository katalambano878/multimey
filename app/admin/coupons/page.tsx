'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

type CouponType = 'percentage' | 'fixed_amount' | 'free_shipping';

interface Coupon {
  id: string;
  code: string;
  description: string | null;
  type: CouponType;
  value: number;
  minimum_purchase: number | null;
  maximum_discount: number | null;
  usage_limit: number | null;
  usage_count: number | null;
  per_user_limit: number | null;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  created_at: string;
}

interface FormState {
  code: string;
  description: string;
  type: CouponType;
  value: string;
  minimum_purchase: string;
  maximum_discount: string;
  usage_limit: string;
  per_user_limit: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
}

const EMPTY_FORM: FormState = {
  code: '',
  description: '',
  type: 'percentage',
  value: '',
  minimum_purchase: '',
  maximum_discount: '',
  usage_limit: '',
  per_user_limit: '1',
  start_date: '',
  end_date: '',
  is_active: true,
};

const TYPE_LABELS: Record<CouponType, string> = {
  percentage: 'Percentage',
  fixed_amount: 'Fixed amount',
  free_shipping: 'Free delivery',
};

function couponStatus(c: Coupon): 'Active' | 'Scheduled' | 'Expired' | 'Disabled' | 'Used up' {
  const now = Date.now();
  if (!c.is_active) return 'Disabled';
  if (c.end_date && new Date(c.end_date).getTime() < now) return 'Expired';
  if (c.usage_limit != null && (c.usage_count || 0) >= c.usage_limit) return 'Used up';
  if (c.start_date && new Date(c.start_date).getTime() > now) return 'Scheduled';
  return 'Active';
}

const STATUS_COLORS: Record<string, string> = {
  Active: 'bg-green-100 text-green-800',
  Scheduled: 'bg-blue-100 text-blue-700',
  Expired: 'bg-gray-100 text-gray-600',
  'Used up': 'bg-gray-100 text-gray-600',
  Disabled: 'bg-red-100 text-red-700',
};

const toDateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : '');
const numOrNull = (v: string) => (v.trim() === '' ? null : Number(v));

export default function AdminCouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchCoupons = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('coupons').select('*').order('created_at', { ascending: false });
    if (error) console.error('Error fetching coupons:', error);
    setCoupons((data || []) as Coupon[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchCoupons();
  }, []);

  const openNew = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setShowForm(true);
  };

  const openEdit = (c: Coupon) => {
    setEditing(c);
    setForm({
      code: c.code,
      description: c.description || '',
      type: c.type,
      value: String(c.value ?? ''),
      minimum_purchase: c.minimum_purchase ? String(c.minimum_purchase) : '',
      maximum_discount: c.maximum_discount != null ? String(c.maximum_discount) : '',
      usage_limit: c.usage_limit != null ? String(c.usage_limit) : '',
      per_user_limit: c.per_user_limit != null ? String(c.per_user_limit) : '',
      start_date: toDateInput(c.start_date),
      end_date: toDateInput(c.end_date),
      is_active: c.is_active,
    });
    setFormError('');
    setShowForm(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = form.code.trim().toUpperCase();
    const value = form.type === 'free_shipping' ? 0 : Number(form.value);
    if (!/^[A-Z0-9_-]{3,40}$/.test(code)) return setFormError('Use 3–40 letters, numbers, - or _ for the code.');
    if (form.type !== 'free_shipping' && (!Number.isFinite(value) || value <= 0)) return setFormError('Enter a discount value above 0.');
    if (form.type === 'percentage' && value > 100) return setFormError('A percentage discount cannot be more than 100.');
    if (form.start_date && form.end_date && form.end_date < form.start_date) return setFormError('The end date is before the start date.');

    const row = {
      code,
      description: form.description.trim() || null,
      type: form.type,
      value,
      minimum_purchase: numOrNull(form.minimum_purchase) ?? 0,
      maximum_discount: numOrNull(form.maximum_discount),
      usage_limit: numOrNull(form.usage_limit),
      per_user_limit: numOrNull(form.per_user_limit),
      // Dates are whole days: valid from the start of the start date to the end of the end date.
      start_date: form.start_date ? new Date(`${form.start_date}T00:00:00`).toISOString() : null,
      end_date: form.end_date ? new Date(`${form.end_date}T23:59:59`).toISOString() : null,
      is_active: form.is_active,
      updated_at: new Date().toISOString(),
    };

    setSaving(true);
    const { error } = editing
      ? await supabase.from('coupons').update(row).eq('id', editing.id)
      : await supabase.from('coupons').insert([row]);
    setSaving(false);
    if (error) {
      setFormError(/duplicate|unique/i.test(error.message) ? 'A coupon with this code already exists.' : error.message);
      return;
    }
    setShowForm(false);
    fetchCoupons();
  };

  const toggleActive = async (c: Coupon) => {
    const { error } = await supabase.from('coupons').update({ is_active: !c.is_active }).eq('id', c.id);
    if (error) alert('Could not update the coupon: ' + error.message);
    else fetchCoupons();
  };

  const remove = async (c: Coupon) => {
    if (!confirm(`Delete coupon ${c.code}? Orders that already used it keep their discount.`)) return;
    const { error } = await supabase.from('coupons').delete().eq('id', c.id);
    if (error) alert('Could not delete the coupon: ' + error.message);
    else fetchCoupons();
  };

  const visible = coupons.filter(c => statusFilter === 'all' || couponStatus(c) === statusFilter);
  const activeCount = coupons.filter(c => couponStatus(c) === 'Active').length;
  const totalUses = coupons.reduce((sum, c) => sum + (c.usage_count || 0), 0);
  const input = 'w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Coupons & Promotions</h1>
          <p className="text-gray-600 mt-1">Discount codes customers can enter at checkout</p>
        </div>
        <button onClick={openNew} className="bg-gray-900 hover:bg-gray-800 text-white px-6 py-3 rounded-lg font-semibold transition-colors whitespace-nowrap cursor-pointer">
          <i className="ri-add-line mr-2"></i>
          Create Coupon
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border-2 border-gray-200 p-4">
          <p className="text-sm text-gray-600 mb-1">Total Coupons</p>
          <p className="text-2xl font-bold text-gray-900">{coupons.length}</p>
        </div>
        <div className="bg-white rounded-xl border-2 border-gray-200 p-4">
          <p className="text-sm text-gray-600 mb-1">Active</p>
          <p className="text-2xl font-bold text-gray-900">{activeCount}</p>
        </div>
        <div className="bg-white rounded-xl border-2 border-gray-200 p-4">
          <p className="text-sm text-gray-600 mb-1">Times Used (paid orders)</p>
          <p className="text-2xl font-bold text-gray-900">{totalUses}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between gap-4">
          <h2 className="text-lg font-bold text-gray-900">All Coupons</h2>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-4 py-2 pr-8 border-2 border-gray-300 rounded-lg font-medium cursor-pointer"
            aria-label="Filter by status"
          >
            <option value="all">All Status</option>
            <option value="Active">Active</option>
            <option value="Scheduled">Scheduled</option>
            <option value="Expired">Expired</option>
            <option value="Used up">Used up</option>
            <option value="Disabled">Disabled</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left py-4 px-6 text-sm font-semibold text-gray-700">Code</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Discount</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Min Purchase</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Usage</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Valid Period</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Status</th>
                <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="p-8 text-center text-gray-500">Loading coupons...</td></tr>
              ) : visible.length === 0 ? (
                <tr><td colSpan={7} className="p-8 text-center text-gray-500">No coupons yet. Create one to offer a discount at checkout.</td></tr>
              ) : (
                visible.map(c => {
                  const status = couponStatus(c);
                  return (
                    <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="py-4 px-6">
                        <div className="flex items-center space-x-2">
                          <span className="font-mono font-bold text-gray-900 bg-gray-100 px-3 py-1 rounded">{c.code}</span>
                          <button
                            onClick={() => navigator.clipboard?.writeText(c.code)}
                            title="Copy code"
                            className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-900 rounded transition-colors cursor-pointer"
                          >
                            <i className="ri-file-copy-line"></i>
                          </button>
                        </div>
                        {c.description && <p className="text-xs text-gray-500 mt-1">{c.description}</p>}
                      </td>
                      <td className="py-4 px-4 font-semibold text-gray-900 whitespace-nowrap">
                        {c.type === 'percentage' ? `${Number(c.value)}%` : c.type === 'fixed_amount' ? `GH₵ ${Number(c.value).toFixed(2)}` : 'Free delivery'}
                        {c.type === 'percentage' && c.maximum_discount ? <span className="block text-xs font-normal text-gray-500">up to GH₵ {Number(c.maximum_discount).toFixed(2)}</span> : null}
                      </td>
                      <td className="py-4 px-4 text-gray-700 whitespace-nowrap">
                        {Number(c.minimum_purchase) > 0 ? `GH₵ ${Number(c.minimum_purchase).toFixed(2)}` : 'No minimum'}
                      </td>
                      <td className="py-4 px-4 text-gray-900 whitespace-nowrap">
                        {c.usage_count || 0} / {c.usage_limit ?? '∞'}
                      </td>
                      <td className="py-4 px-4 text-sm text-gray-700 whitespace-nowrap">
                        <p>{c.start_date ? new Date(c.start_date).toLocaleDateString() : 'Now'}</p>
                        <p className="text-gray-500">{c.end_date ? new Date(c.end_date).toLocaleDateString() : 'No expiry'}</p>
                      </td>
                      <td className="py-4 px-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${STATUS_COLORS[status]}`}>{status}</span>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center space-x-1">
                          <button onClick={() => openEdit(c)} title="Edit" className="w-8 h-8 flex items-center justify-center text-gray-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg cursor-pointer">
                            <i className="ri-edit-line text-lg"></i>
                          </button>
                          <button onClick={() => toggleActive(c)} title={c.is_active ? 'Disable' : 'Enable'} className="w-8 h-8 flex items-center justify-center text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg cursor-pointer">
                            <i className={`${c.is_active ? 'ri-pause-circle-line' : 'ri-play-circle-line'} text-lg`}></i>
                          </button>
                          <button onClick={() => remove(c)} title="Delete" className="w-8 h-8 flex items-center justify-center text-gray-600 hover:text-red-700 hover:bg-red-50 rounded-lg cursor-pointer">
                            <i className="ri-delete-bin-line text-lg"></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <form
            onSubmit={save}
            onClick={e => e.stopPropagation()}
            className="bg-white p-6 sm:p-8 rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto space-y-4"
          >
            <h2 className="text-xl font-bold text-gray-900">{editing ? `Edit ${editing.code}` : 'Create Coupon'}</h2>

            <div>
              <label htmlFor="coupon-code" className="block text-sm font-semibold text-gray-900 mb-1">Code</label>
              <input id="coupon-code" value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} className={`${input} font-mono uppercase`} placeholder="WELCOME10" required />
            </div>
            <div>
              <label htmlFor="coupon-description" className="block text-sm font-semibold text-gray-900 mb-1">Description <span className="font-normal text-gray-500">(only you see this)</span></label>
              <input id="coupon-description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className={input} placeholder="New customer discount" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="coupon-type" className="block text-sm font-semibold text-gray-900 mb-1">Type</label>
                <select id="coupon-type" value={form.type} onChange={e => setForm({ ...form, type: e.target.value as CouponType })} className={input}>
                  {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              {form.type !== 'free_shipping' && (
                <div>
                  <label htmlFor="coupon-value" className="block text-sm font-semibold text-gray-900 mb-1">{form.type === 'percentage' ? 'Percent off' : 'Amount off (GH₵)'}</label>
                  <input id="coupon-value" type="number" min="0" step="0.01" value={form.value} onChange={e => setForm({ ...form, value: e.target.value })} className={input} required />
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="coupon-minimum_purchase" className="block text-sm font-semibold text-gray-900 mb-1">Minimum order (GH₵)</label>
                <input id="coupon-minimum_purchase" type="number" min="0" step="0.01" value={form.minimum_purchase} onChange={e => setForm({ ...form, minimum_purchase: e.target.value })} className={input} placeholder="None" />
              </div>
              {form.type === 'percentage' && (
                <div>
                  <label htmlFor="coupon-maximum_discount" className="block text-sm font-semibold text-gray-900 mb-1">Max discount (GH₵)</label>
                  <input id="coupon-maximum_discount" type="number" min="0" step="0.01" value={form.maximum_discount} onChange={e => setForm({ ...form, maximum_discount: e.target.value })} className={input} placeholder="No cap" />
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="coupon-usage_limit" className="block text-sm font-semibold text-gray-900 mb-1">Total uses allowed</label>
                <input id="coupon-usage_limit" type="number" min="1" step="1" value={form.usage_limit} onChange={e => setForm({ ...form, usage_limit: e.target.value })} className={input} placeholder="Unlimited" />
              </div>
              <div>
                <label htmlFor="coupon-per_user_limit" className="block text-sm font-semibold text-gray-900 mb-1">Uses per customer</label>
                <input id="coupon-per_user_limit" type="number" min="1" step="1" value={form.per_user_limit} onChange={e => setForm({ ...form, per_user_limit: e.target.value })} className={input} placeholder="Unlimited" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="coupon-start_date" className="block text-sm font-semibold text-gray-900 mb-1">Starts</label>
                <input id="coupon-start_date" type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} className={input} />
              </div>
              <div>
                <label htmlFor="coupon-end_date" className="block text-sm font-semibold text-gray-900 mb-1">Ends</label>
                <input id="coupon-end_date" type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} className={input} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-900">
              <input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} />
              Customers can use this code
            </label>

            {formError && <p className="text-sm text-red-600">{formError}</p>}

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 border-2 border-gray-300 rounded-lg font-semibold text-gray-700 hover:border-gray-400">Cancel</button>
              <button type="submit" disabled={saving} className="px-5 py-2 bg-gray-900 text-white rounded-lg font-semibold hover:bg-gray-800 disabled:opacity-50">
                {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Coupon'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
