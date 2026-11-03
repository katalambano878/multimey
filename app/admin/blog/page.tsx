'use client';

import Link from 'next/link';

// The storefront blog (/blog) is written into the site's code, not the
// database, so there is nothing to edit here yet. This page used to show
// sample posts with links to editor pages that don't exist.
export default function AdminBlogPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Blog</h1>
        <p className="text-gray-600 mt-1">Articles shown on the shop&apos;s blog page</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-8 max-w-2xl">
        <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-4">
          <i className="ri-article-line text-2xl text-gray-700"></i>
        </div>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Blog editing isn&apos;t available yet</h2>
        <p className="text-gray-600 mb-6">
          The articles on the blog page are part of the website itself. To add or change an article,
          ask your developer. You can see what customers see on the live blog.
        </p>
        <Link
          href="/blog"
          target="_blank"
          className="inline-flex items-center bg-gray-900 hover:bg-gray-800 text-white px-5 py-2.5 rounded-lg font-semibold transition-colors"
        >
          <i className="ri-external-link-line mr-2"></i>
          View blog
        </Link>
      </div>
    </div>
  );
}
