'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import MiniCart from './MiniCart';
import { useCart } from '@/context/CartContext';
import { supabase } from '@/lib/supabase';
import { useCMS } from '@/context/CMSContext';
import AnnouncementBar from './AnnouncementBar';
import BrandLogo from './BrandLogo';

/** Mobile menu: link or expandable parent with sub-items (2 levels under Shop) */
type MobileNavLink = { label: string; href: string };
type ShopSectionItem =
  | MobileNavLink
  | { label: string; children: MobileNavLink[] };
type MobileNavItem =
  | MobileNavLink
  | { label: string; children: ShopSectionItem[] };

/** Static nav items after Categories (not from categories DB) */
const STATIC_MOBILE_NAV_ITEMS: MobileNavItem[] = [
  { label: 'Contact', href: '/contact' },
  { label: 'Register for 1v1 Online Importation Class', href: '/importation-class' },
];

const RECENT_SEARCHES_KEY = 'multimey_recent_searches';
const MAX_RECENT = 6;
const POPULAR_SEARCHES = ['Beauty', 'Skincare', 'Electronics', 'Bags', 'Closet Sales', 'Accessories'];

function buildMobileNavFromCategories(categories: { id: string; name: string; slug: string; parent_id: string | null }[]): MobileNavItem[] {
  const roots = categories.filter((c) => !c.parent_id).sort((a, b) => a.name.localeCompare(b.name));
  const byParent = new Map<string | null, typeof categories>();
  categories.forEach((c) => {
    const key = c.parent_id ?? 'root';
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(c);
  });
  const getChildren = (id: string) => (byParent.get(id) ?? []).sort((a, b) => a.name.localeCompare(b.name));

  const categoryChildren: ShopSectionItem[] = roots.map((root) => {
    const children = getChildren(root.id);
    if (children.length === 0) {
      return { label: root.name, href: `/shop?type=retail&category=${root.slug}` };
    }
    return {
      label: root.name,
      children: children.map((c) => ({ label: c.name, href: `/shop?type=retail&category=${c.slug}` })),
    };
  });

  const retailItem: MobileNavItem =
    categoryChildren.length > 0
      ? { label: 'Retail', children: categoryChildren }
      : { label: 'Retail', href: '/shop?type=retail' };

  const closetItem: MobileNavItem = { label: 'Closet Sales', href: '/shop?type=closet' };

  return [
    { label: 'Home', href: '/' },
    retailItem,
    closetItem,
    ...STATIC_MOBILE_NAV_ITEMS
  ];
}

function isNavItemWithChildren(item: MobileNavItem): item is { label: string; children: ShopSectionItem[] } {
  return 'children' in item && Array.isArray((item as { children?: unknown }).children);
}
function isShopSectionWithSubs(item: ShopSectionItem): item is { label: string; children: MobileNavLink[] } {
  return 'children' in item && Array.isArray((item as { children?: unknown }).children);
}

export default function Header() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [wishlistCount, setWishlistCount] = useState(0);
  const [user, setUser] = useState<any>(null);
  const [expandedMobileSection, setExpandedMobileSection] = useState<string | null>(null);
  const [mobileNavItems, setMobileNavItems] = useState<MobileNavItem[]>(() => buildMobileNavFromCategories([]));

  const { cartCount, isCartOpen, setIsCartOpen } = useCart();
  const { getSetting, getSettingJSON } = useCMS();

  const siteName = getSetting('site_name') || 'MultiMey Supplies';
  const siteLogo = getSetting('site_logo') || '';
  const logoHeight = getSetting('header_logo_height') || '36';
  const showSearch = getSetting('header_show_search') !== 'false';
  const showWishlist = getSetting('header_show_wishlist') !== 'false';
  const showCart = getSetting('header_show_cart') !== 'false';
  const showAccount = getSetting('header_show_account') !== 'false';
  const navLinks = getSettingJSON<{ label: string; href: string }[]>('header_nav_links_json', [
    { label: 'Home', href: '/' },
    { label: 'Retail', href: '/shop?type=retail' },
    { label: 'Closet Sales', href: '/shop?type=closet' },
    { label: 'Contact', href: '/contact' },
    { label: 'Importation Class', href: '/importation-class' }
  ]);

  useEffect(() => {
    const updateWishlistCount = () => {
      const wishlist = JSON.parse(localStorage.getItem('wishlist') || '[]');
      setWishlistCount(wishlist.length);
    };
    updateWishlistCount();
    window.addEventListener('wishlistUpdated', updateWishlistCount);

    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
    };
    checkUser();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => {
      window.removeEventListener('wishlistUpdated', updateWishlistCount);
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    async function loadCategories() {
      const { data, error } = await supabase
        .from('categories')
        .select('id, name, slug, parent_id')
        .eq('status', 'active')
        .order('name');
      if (!error && data?.length) {
        setMobileNavItems(buildMobileNavFromCategories(data));
      } else {
        setMobileNavItems(buildMobileNavFromCategories([]));
      }
    }
    loadCategories();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
      const list = raw ? JSON.parse(raw) : [];
      setRecentSearches(Array.isArray(list) ? list.slice(0, MAX_RECENT) : []);
    } catch {
      setRecentSearches([]);
    }
  }, []);

  const runSearch = (query: string) => {
    const q = query.trim();
    if (!q) return;
    const url = `/shop?search=${encodeURIComponent(q)}`;
    try {
      const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
      const list = raw ? JSON.parse(raw) : [];
      const next = [q, ...(Array.isArray(list) ? list.filter((x: string) => x.trim().toLowerCase() !== q.toLowerCase()) : [])].slice(0, MAX_RECENT);
      localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    setIsSearchOpen(false);
    setSearchQuery('');
    window.location.href = url;
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    runSearch(searchQuery);
  };

  const clearRecentSearches = () => {
    localStorage.removeItem(RECENT_SEARCHES_KEY);
    setRecentSearches([]);
  };

  useEffect(() => {
    if (!isSearchOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsSearchOpen(false);
        setSearchQuery('');
      }
    };
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [isSearchOpen]);

  return (
    <>
      <AnnouncementBar />

      <header className="bg-white border-b border-gray-100 sticky top-0 z-50">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 md:h-20">
            {/* Left: mobile menu + logo */}
            <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-[1.5] sm:flex-1">
              <button
                type="button"
                className="lg:hidden p-1 -ml-1 text-gray-900 hover:text-brand-gold transition-colors"
                onClick={() => setIsMobileMenuOpen(true)}
                aria-label="Open menu"
              >
                <i className="ri-menu-line text-2xl" aria-hidden />
              </button>
              <Link href="/" className="flex items-center shrink-0 group" aria-label={`${siteName} home`}>
                <BrandLogo
                  src={siteLogo}
                  alt={siteName}
                  priority
                  className="h-10 w-auto object-contain transition-opacity duration-500 group-hover:opacity-80 sm:h-12 md:h-16"
                />
              </Link>
            </div>

            {/* Center: nav (desktop) */}
            <nav className="hidden lg:flex items-center justify-center gap-10 flex-[2]" aria-label="Main navigation">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-[13px] uppercase tracking-[0.2em] font-bold text-gray-900 hover:text-brand-gold transition-colors relative group py-2"
                >
                  {link.label}
                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-0 h-[2px] bg-brand-gold transition-all duration-300 group-hover:w-full"></span>
                </Link>
              ))}
            </nav>

            {/* Right: search, wishlist, account, cart */}
            <div className="flex items-center justify-end gap-3 sm:gap-6 flex-1">
              {showSearch && (
                <button
                  type="button"
                  className="text-gray-900 hover:text-brand-gold transition-colors"
                  onClick={() => setIsSearchOpen(true)}
                  aria-label="Search"
                >
                  <i className="ri-search-line text-[20px] sm:text-[22px]" aria-hidden />
                </button>
              )}
              {showWishlist && (
                <Link
                  href="/wishlist"
                  className="text-gray-900 hover:text-brand-gold transition-colors relative"
                  aria-label={wishlistCount > 0 ? `Wishlist, ${wishlistCount} items` : 'Wishlist'}
                >
                  <i className="ri-heart-line text-[20px] sm:text-[22px]" aria-hidden />
                  {wishlistCount > 0 && (
                    <span className="absolute -top-1.5 -right-2 min-w-[16px] sm:min-w-[18px] h-[16px] sm:h-[18px] px-1 bg-brand-blue text-white text-[9px] sm:text-[10px] font-bold rounded-full flex items-center justify-center shadow-sm">
                      {wishlistCount}
                    </span>
                  )}
                </Link>
              )}
              {showAccount && (
                user ? (
                  <Link
                    href="/account"
                    className="text-gray-900 hover:text-brand-gold transition-colors hidden sm:block"
                    aria-label="Account"
                  >
                    <i className="ri-user-line text-[22px]" aria-hidden />
                  </Link>
                ) : (
                  <Link
                    href="/auth/login"
                    className="text-gray-900 hover:text-brand-gold transition-colors hidden sm:block"
                    aria-label="Log in"
                  >
                    <i className="ri-user-line text-[22px]" aria-hidden />
                  </Link>
                )
              )}
              {showCart && (
                <div className="relative flex items-center">
                  <button
                    type="button"
                    className="text-gray-900 hover:text-brand-gold transition-colors relative flex items-center gap-2"
                    onClick={() => setIsCartOpen(!isCartOpen)}
                    aria-label={cartCount > 0 ? `Cart, ${cartCount} items` : 'Cart'}
                    aria-expanded={isCartOpen}
                    aria-controls="mini-cart"
                  >
                    <i className="ri-shopping-bag-line text-[20px] sm:text-[22px]" aria-hidden />
                    {cartCount > 0 && (
                      <span className="absolute -top-1.5 -right-2 min-w-[16px] sm:min-w-[18px] h-[16px] sm:h-[18px] px-1 bg-brand-blue text-white text-[9px] sm:text-[10px] font-bold rounded-full flex items-center justify-center shadow-sm">
                        {cartCount}
                      </span>
                    )}
                  </button>
                  <MiniCart isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Search overlay */}
      {isSearchOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 backdrop-blur-sm pt-[12vh] px-4 sm:pt-[15vh]"
          role="dialog"
          aria-modal="true"
          aria-label="Search"
        >
          <div
            className="w-full max-w-xl bg-white rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-gray-100 text-gray-500">
                  <i className="ri-search-line text-xl" aria-hidden />
                </span>
                <form onSubmit={handleSearch} className="flex-1 min-w-0">
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search products, brands, categories..."
                    className="w-full py-2.5 text-base focus:outline-none placeholder:text-gray-400"
                    autoFocus
                    autoComplete="off"
                  />
                </form>
                <button
                  type="button"
                  className="flex items-center justify-center w-10 h-10 rounded-xl text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors"
                  onClick={() => { setIsSearchOpen(false); setSearchQuery(''); }}
                  aria-label="Close search"
                >
                  <i className="ri-close-line text-2xl" aria-hidden />
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-2 pl-[3.25rem]">Press Enter to search · Try beauty, electronics, bags</p>
            </div>

            <div className="p-4 max-h-[50vh] overflow-y-auto">
              {recentSearches.length > 0 && (
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-gray-700">Recent searches</span>
                    <button
                      type="button"
                      onClick={clearRecentSearches}
                      className="text-xs text-gray-500 hover:text-gray-900"
                    >
                      Clear
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {recentSearches.map((term) => (
                      <button
                        key={term}
                        type="button"
                        onClick={() => runSearch(term)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-100 text-gray-700 text-sm hover:bg-gray-200 transition-colors"
                      >
                        <i className="ri-time-line text-gray-400" />
                        {term}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <span className="text-sm font-semibold text-gray-700 block mb-2">Popular searches</span>
                <div className="flex flex-wrap gap-2">
                  {POPULAR_SEARCHES.map((term) => (
                    <button
                      key={term}
                      type="button"
                      onClick={() => runSearch(term)}
                      className="inline-flex items-center px-4 py-2 rounded-full border border-gray-200 text-gray-700 text-sm hover:border-brand-gold hover:bg-brand-gold/5 hover:text-gray-900 transition-colors"
                    >
                      {term}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <button
            type="button"
            className="absolute inset-0 -z-10"
            aria-label="Close"
            onClick={() => { setIsSearchOpen(false); setSearchQuery(''); }}
          />
        </div>
      )}

      {/* Mobile menu */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-[100] lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div
            className="absolute inset-0 bg-black/20"
            onClick={() => setIsMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute top-0 left-0 bottom-0 w-full max-w-[320px] bg-white shadow-xl flex flex-col">
            <div className="flex items-center justify-between h-16 px-4 border-b border-gray-100">
              <span className="text-sm font-medium text-gray-500">Menu</span>
              <button
                type="button"
                onClick={() => { setIsMobileMenuOpen(false); setExpandedMobileSection(null); }}
                className="p-2 text-gray-500 hover:text-gray-900"
                aria-label="Close menu"
              >
                <i className="ri-close-line text-2xl" aria-hidden />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto py-4" aria-label="Mobile navigation">
              <Link
                href="/"
                className="block px-4 py-3 text-base font-medium text-gray-900"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Home
              </Link>
              {mobileNavItems.map((item) => {
                if (isNavItemWithChildren(item)) {
                  return (
                    <div key={item.label} className="border-b border-gray-100 last:border-b-0">
                      {/* Label — not clickable, always expanded */}
                      <div className="flex w-full items-center px-4 py-3">
                        <span className="text-base font-bold text-brand-blue uppercase tracking-wider text-xs">{item.label}</span>
                      </div>
                      <div className="pb-2">
                        {item.children.map((sub) => {
                          if (isShopSectionWithSubs(sub)) {
                            return (
                              <div key={sub.label}>
                                {sub.children.map((leaf) => (
                                  <Link
                                    key={leaf.href + leaf.label}
                                    href={leaf.href}
                                    className="block px-4 py-2.5 pl-6 text-sm font-medium text-gray-700 hover:text-brand-blue hover:bg-brand-light transition-colors"
                                    onClick={() => setIsMobileMenuOpen(false)}
                                  >
                                    {leaf.label}
                                  </Link>
                                ))}
                              </div>
                            );
                          }
                          return (
                            <Link
                              key={sub.href}
                              href={sub.href}
                              className="block px-4 py-2.5 pl-6 text-sm font-medium text-gray-700 hover:text-brand-blue hover:bg-brand-light transition-colors"
                              onClick={() => setIsMobileMenuOpen(false)}
                            >
                              {sub.label}
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  );
                }
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="block px-4 py-3 text-base font-medium text-gray-700 border-b border-gray-100"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    {item.label}
                  </Link>
                );
              })}
              <div className="border-t border-gray-100 my-4" />
              <Link href="/order-tracking" className="block px-4 py-3 text-sm text-gray-600" onClick={() => setIsMobileMenuOpen(false)}>
                Track order
              </Link>
              <Link href="/wishlist" className="block px-4 py-3 text-sm text-gray-600" onClick={() => setIsMobileMenuOpen(false)}>
                Wishlist
              </Link>
              <Link href={user ? '/account' : '/auth/login'} className="block px-4 py-3 text-sm text-gray-600" onClick={() => setIsMobileMenuOpen(false)}>
                {user ? 'Account' : 'Log in'}
              </Link>
            </nav>
          </div>
        </div>
      )}
    </>
  );
}
