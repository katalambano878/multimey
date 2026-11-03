import Link from 'next/link';

// There is no phone verification flow, so this page no longer pretends to check codes.
export default function VerifyPhonePage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-black rounded-full flex items-center justify-center mx-auto mb-4">
            <i className="ri-phone-line text-3xl text-white"></i>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">No phone verification needed</h1>
          <p className="text-gray-600 mb-8">
            You don&apos;t need to verify your phone to shop or track orders. You can update your
            details from your account at any time.
          </p>
          <Link
            href="/account"
            className="block w-full bg-black text-white py-3 rounded-lg font-semibold hover:bg-gray-800 transition-colors whitespace-nowrap"
          >
            Back to My Account
          </Link>
        </div>
      </div>
    </div>
  );
}
