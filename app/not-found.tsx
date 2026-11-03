import Link from 'next/link';
import BrandLogo from '@/components/BrandLogo';

export default function NotFound() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4 py-16 text-center">
      <Link href="/" aria-label="MultiMey Supplies home" className="mb-10">
        <BrandLogo alt="MultiMey Supplies" className="h-12 w-auto object-contain sm:h-14" />
      </Link>
      <p className="text-sm font-semibold uppercase tracking-widest text-brand-blue">Error 404</p>
      <h1 className="mt-3 text-3xl md:text-4xl font-bold text-gray-900">We couldn&apos;t find that page</h1>
      <p className="mt-4 max-w-md text-gray-600">
        The link may be broken or the page may have moved. Try the shop or head back to the homepage.
      </p>
      <div className="mt-8 flex flex-col sm:flex-row gap-3 w-full max-w-xs sm:max-w-none sm:w-auto">
        <Link
          href="/"
          className="inline-flex items-center justify-center gap-2 bg-gray-900 hover:bg-gray-800 text-white px-6 py-3 rounded-lg font-semibold transition-colors whitespace-nowrap"
        >
          <i className="ri-home-4-line"></i>
          Back to Home
        </Link>
        <Link
          href="/shop"
          className="inline-flex items-center justify-center gap-2 border-2 border-gray-300 hover:border-gray-900 text-gray-900 px-6 py-3 rounded-lg font-semibold transition-colors whitespace-nowrap"
        >
          <i className="ri-store-2-line"></i>
          Go to Shop
        </Link>
      </div>
    </main>
  );
}
