interface OrderItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  image: string;
  variant?: string;
}

interface OrderSummaryProps {
  items: OrderItem[];
  subtotal: number;
  shipping: number;
  tax: number;
  total: number;
  discount?: number;
  couponCode?: string | null;
  couponSlot?: React.ReactNode;
}

export default function OrderSummary({ items, subtotal, shipping, tax, total, discount = 0, couponCode, couponSlot }: OrderSummaryProps) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8 sticky top-24">
      <h2 className="text-xl font-bold text-gray-900 mb-6">Order Summary</h2>

      <div className="space-y-5 mb-6">
        {items.map((item) => (
          <div key={`${item.id}-${item.variant || 'novar'}`} className="flex space-x-4">
            <div className="relative w-20 h-20 bg-gray-50 rounded-xl overflow-hidden flex-shrink-0 border border-gray-100">
              <img
                src={item.image}
                alt={item.name}
                className="w-full h-full object-cover"
              />
              <div className="absolute -top-2 -right-2 w-6 h-6 flex items-center justify-center bg-gray-900 text-white text-[11px] font-bold rounded-full border-2 border-white shadow-sm">
                {item.quantity}
              </div>
            </div>
            <div className="flex-1 flex flex-col justify-center">
              <h3 className="font-semibold text-gray-900 text-sm line-clamp-2 leading-tight">{item.name}</h3>
              {item.variant && <p className="text-xs text-gray-500 mt-1">{item.variant}</p>}
              <p className="text-gray-900 font-bold mt-1.5 text-sm">GH₵{item.price.toFixed(2)}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-gray-100 pt-5 space-y-3">
        <div className="flex justify-between text-[15px] text-gray-600">
          <span>Subtotal</span>
          <span className="font-medium text-gray-900">GH₵{subtotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-[15px] text-gray-600">
          <span>Shipping</span>
          <span className="font-medium text-gray-900">
            {shipping === 0 ? 'FREE' : `GH₵${shipping.toFixed(2)}`}
          </span>
        </div>
        {discount > 0 && (
          <div className="flex justify-between text-[15px] text-green-700">
            <span>Discount{couponCode ? ` (${couponCode})` : ''}</span>
            <span className="font-medium">−GH₵{discount.toFixed(2)}</span>
          </div>
        )}
      </div>

      {couponSlot && <div className="border-t border-gray-100 mt-5 pt-5">{couponSlot}</div>}

      <div className="border-t border-gray-100 mt-5 pt-5">
        <div className="flex justify-between items-center">
          <span className="text-lg font-bold text-gray-900">Total</span>
          <div className="text-right">
            <span className="text-2xl font-bold text-gray-900 tracking-tight">GH₵{total.toFixed(2)}</span>
          </div>
        </div>
      </div>

      <div className="mt-8 p-4 bg-green-50/50 border border-green-100 rounded-xl flex items-center justify-center space-x-2 text-green-800">
        <i className="ri-shield-check-fill text-xl text-green-600"></i>
        <span className="text-[13px] font-bold tracking-wide uppercase">100% Secure Checkout</span>
      </div>
    </div>
  );
}
