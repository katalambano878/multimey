'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { usePageTitle } from '@/hooks/usePageTitle';
import ProductCard, { type ColorVariant } from '@/components/ProductCard';
import { getColorHex } from '@/components/ProductCard';
import { supabase } from '@/lib/supabase';
import { cachedQuery } from '@/lib/query-cache';
import PageHero from '@/components/PageHero';
import AnimatedSection from '@/components/AnimatedSection';

function ShopContent() {
  usePageTitle('Shop All Products');
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // State
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([{ id: 'all', name: 'All Products', count: 0 }]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [totalProducts, setTotalProducts] = useState(0);

  // Filters
  const [selectedCategory, setSelectedCategory] = useState(() => searchParams.get('category') || 'all');
  const [priceRange, setPriceRange] = useState([0, 5000]);
  const [selectedRating, setSelectedRating] = useState(0);
  const [sortBy, setSortBy] = useState(() => searchParams.get('sort') || 'popular');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  // Infinite scroll: `page` is how many batches are loaded.
  const [page, setPage] = useState(1);
  const productsPerPage = 24;

  // Initialize from URL params (keeps position when returning from product page)
  useEffect(() => {
    // The URL is the source of truth: missing params mean the defaults.
    setSelectedCategory(searchParams.get('category') || 'all');
    setSortBy(searchParams.get('sort') || 'popular');
    // type (retail/closet) is read from searchParams in fetch and classificationParam below
  }, [searchParams]);

  const setSection = (type: 'all' | 'retail' | 'closet') => {
    const params = new URLSearchParams(searchParams.toString());
    if (type === 'all') params.delete('type');
    else params.set('type', type);
    params.delete('page'); // reset to page 1
    setPage(1);
    router.push(`${pathname}${params.toString() ? `?${params.toString()}` : ''}`);
  };

  const selectCategory = (slug: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (slug === 'all') params.delete('category');
    else params.set('category', slug);
    params.delete('page'); // reset to page 1
    setSelectedCategory(slug);
    setPage(1);
    router.push(`${pathname}${params.toString() ? `?${params.toString()}` : ''}`, { scroll: false });
  };

  // Fetch Categories from cached API
  useEffect(() => {
    async function fetchCategories() {
      try {
        const res = await fetch('/api/storefront/categories');
        if (res.ok) {
          const data = await res.json();
          if (data) setCategories(data);
        }
      } catch (err) {
        console.error('Error fetching categories:', err);
      }
    }
    fetchCategories();
  }, []);

  // Anything that changes which products match starts the list again from the top.
  const filterKey = [
    selectedCategory, priceRange.join('-'), selectedRating, sortBy,
    searchParams.get('search') || '', searchParams.get('type') || '', categories.length,
  ].join('|');
  const loadedKeyRef = useRef('');
  const requestRef = useRef(0);

  const firstFilterRef = useRef(true);
  useEffect(() => {
    setPage(1);
    // New filters start a new list, so go back to the top of the results.
    if (firstFilterRef.current) {
      firstFilterRef.current = false;
      return;
    }
    const grid = document.querySelector('[data-product-shop]');
    const top = grid ? grid.getBoundingClientRect().top + window.scrollY - 140 : 0;
    if (window.scrollY > top) window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }, [filterKey]);

  // Fetch Products
  useEffect(() => {
    // A filter change resets page to 1 first; don't append an old page to new filters.
    if (page > 1 && loadedKeyRef.current !== filterKey) return;
    const requestId = ++requestRef.current;
    async function fetchProducts() {
      if (page === 1) setLoading(true);
      else setLoadingMore(true);
      try {
        const search = searchParams.get('search');
        const classification = searchParams.get('type'); // 'retail' or 'closet'

        // Build cache key from all filter params
        // Category count is part of the key: a parent category's subcategories are only
        // known once categories load, so the result must be refetched then.
        const cacheKey = `shop:${selectedCategory}:${categories.length}:${search || ''}:${classification || ''}:${priceRange.join('-')}:${selectedRating}:${sortBy}:${page}`;

        const { data, count, error } = await cachedQuery<{ data: any; count: any; error: any }>(
          cacheKey,
          async () => {
            let query = supabase
              .from('products')
              .select(`
                *,
                categories!inner(name, slug),
                product_images(url, position),
                product_variants(id, name, price, quantity, option1, option2, image_url)
              `, { count: 'exact' })
              .eq('status', 'active');

            // Search
            if (search) {
              query = query.ilike('name', `%${search}%`);
            }

            // Classification Filter (Retail Items / Closet Sales)
            if (classification === 'retail' || classification === 'closet') {
              query = query.eq('metadata->>classification', classification);
            }

            // Category Filter with Subcategories
            if (selectedCategory !== 'all') {
              const categoryObj = categories.find(c => c.slug === selectedCategory);

              if (categoryObj) {
                const targetSlugs = [selectedCategory];
                const childSlugs = categories
                  .filter(c => c.parent_id === categoryObj.id)
                  .map(c => c.slug);
                targetSlugs.push(...childSlugs);
                query = query.in('categories.slug', targetSlugs);
              } else {
                query = query.eq('categories.slug', selectedCategory);
              }
            }

            // Price Filter
            if (priceRange[1] < 5000) {
              query = query.gte('price', priceRange[0]).lte('price', priceRange[1]);
            }

            // Rating Filter
            if (selectedRating > 0) {
              query = query.gte('rating_avg', selectedRating);
            }

            // Primary sort must be the user's choice. (Previously quantity was ordered first,
            // which produced ORDER BY quantity DESC, price DESC — so stock level dominated and
            // "Price: High to Low" looked broken.)
            switch (sortBy) {
              case 'price-low':
                query = query
                  .order('price', { ascending: true, nullsFirst: false })
                  .order('quantity', { ascending: false });
                break;
              case 'price-high':
                query = query
                  .order('price', { ascending: false, nullsFirst: false })
                  .order('quantity', { ascending: false });
                break;
              case 'rating':
                query = query
                  .order('rating_avg', { ascending: false, nullsFirst: false })
                  .order('quantity', { ascending: false });
                break;
              case 'new':
                query = query
                  .order('created_at', { ascending: false })
                  .order('quantity', { ascending: false });
                break;
              case 'popular':
              default:
                query = query
                  .order('created_at', { ascending: false })
                  .order('quantity', { ascending: false });
                break;
            }

            // Pagination
            const from = (page - 1) * productsPerPage;
            const to = from + productsPerPage - 1;
            query = query.range(from, to);

            return query as any;
          },
          2 * 60 * 1000 // Cache for 2 minutes
        );

        if (error) throw error;

        if (data) {
          const formattedProducts = data.map((p: any) => {
            const variants = p.product_variants || [];
            const hasVariants = variants.length > 0;
            const minVariantPrice = hasVariants ? Math.min(...variants.map((v: any) => v.price || p.price)) : undefined;
            const totalVariantStock = hasVariants ? variants.reduce((sum: number, v: any) => sum + (v.quantity || 0), 0) : 0;
            const effectiveStock = hasVariants ? totalVariantStock : p.quantity;
            // Extract unique colors from option2
            const colorVariants: ColorVariant[] = [];
            const seenColors = new Set<string>();
            for (const v of variants) {
              const colorName = v.option2;
              if (colorName && !seenColors.has(colorName.toLowerCase().trim())) {
                const hex = getColorHex(colorName);
                if (hex) {
                  seenColors.add(colorName.toLowerCase().trim());
                  colorVariants.push({ name: colorName.trim(), hex });
                }
              }
            }

            return {
              id: p.id,           // Product UUID for cart/orders
              slug: p.slug,       // Slug for navigation
              name: p.name,
              price: p.price,
              originalPrice: p.compare_at_price,
              image: p.product_images?.[0]?.url || 'https://via.placeholder.com/800x800?text=No+Image',
              rating: p.rating_avg || 0,
              reviewCount: 0, // Need to implement reviews relation
              badge: p.compare_at_price > p.price ? 'Sale' : undefined, // Simple badge logic
              inStock: effectiveStock > 0,
              maxStock: effectiveStock || 50,
              moq: p.moq || 1,
              category: p.categories?.name,
              hasVariants,
              minVariantPrice,
              colorVariants
            };
          });
          if (requestId !== requestRef.current) return; // a newer request superseded this one
          setProducts(prev => {
            if (page === 1) return formattedProducts;
            const seen = new Set(prev.map((p: any) => p.id));
            return [...prev, ...formattedProducts.filter((p: any) => !seen.has(p.id))];
          });
          loadedKeyRef.current = filterKey;
          const loadedSoFar = (page - 1) * productsPerPage + formattedProducts.length;
          setTotalProducts(count || loadedSoFar);
          // A short batch means the end, even if the total count is unavailable.
          setHasMore(formattedProducts.length === productsPerPage && (!count || loadedSoFar < count));
        }
      } catch (err) {
        console.error('Error fetching products:', err);
      } finally {
        if (requestId === requestRef.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    }

    fetchProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, filterKey]);

  const loadMore = useCallback(() => {
    if (!loading && !loadingMore && hasMore) setPage(p => p + 1);
  }, [loading, loadingMore, hasMore]);

  // Load the next batch shortly before the shopper reaches the end of the grid.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const observer = new IntersectionObserver(
      entries => { if (entries[0]?.isIntersecting) loadMore(); },
      { rootMargin: '800px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  const classificationParam = searchParams.get('type');
  const classificationLabel = classificationParam === 'retail' ? 'Retail Items' : classificationParam === 'closet' ? 'Closet Sales' : null;

  return (
    <main className="min-h-screen bg-white">
      <PageHero
        title={classificationLabel || "Shop All Products"}
        subtitle={
          classificationParam === 'retail'
            ? "Browse our curated selection of retail products"
            : classificationParam === 'closet'
            ? "Discover amazing closet sale deals"
            : "Get access to all products, tried and tested that will give you an excellent experience!"
        }
        backgroundImage="/hero8.jpeg"
      />

      {/* Mobile Filter Toggle */}
      <div className="lg:hidden bg-white border-b border-gray-200 py-4 px-4 sticky top-[72px] z-20">
        <div className="flex justify-between items-center">
          <button
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            className="flex items-center space-x-2 text-gray-900 font-medium"
          >
            <i className="ri-filter-3-line text-xl"></i>
            <span>Filters & Sort</span>
          </button>
          <span className="text-sm text-gray-500">{totalProducts} Products</span>
        </div>
      </div>

      <AnimatedSection direction="up" className="py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex gap-8">
            <aside className={`${isFilterOpen ? 'fixed inset-0 z-50 bg-white overflow-y-auto' : 'hidden'} lg:block lg:w-64 lg:flex-shrink-0`}>
              <div className="lg:sticky lg:top-24">
                <div className="bg-white lg:bg-transparent p-6 lg:p-0">
                  <div className="flex items-center justify-between mb-6 lg:hidden">
                    <h2 className="text-xl font-bold text-gray-900">Filters</h2>
                    <button
                      onClick={() => setIsFilterOpen(false)}
                      className="w-10 h-10 flex items-center justify-center text-gray-700"
                    >
                      <i className="ri-close-line text-2xl"></i>
                    </button>
                  </div>

                  <div className="space-y-8">
                    {/* Section: Retail / Closet */}
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-4">Section</h3>
                      <div className="space-y-1">
                        <button
                          onClick={() => { setSection('all'); setIsFilterOpen(false); }}
                          className={`w-full text-left px-4 py-2 rounded-xl transition-colors flex items-center gap-2 ${!classificationParam ? 'bg-brand-gold/20 text-brand-blue font-bold' : 'text-gray-700 hover:bg-gray-50'}`}
                        >
                          <i className="ri-store-3-line text-lg"></i>
                          All Products
                        </button>
                        <button
                          onClick={() => { setSection('retail'); setIsFilterOpen(false); }}
                          className={`w-full text-left px-4 py-2 rounded-xl transition-colors flex items-center gap-2 ${classificationParam === 'retail' ? 'bg-brand-gold/20 text-brand-blue font-bold' : 'text-gray-700 hover:bg-gray-50'}`}
                        >
                          <i className="ri-shopping-bag-3-line text-lg"></i>
                          Retail Items
                        </button>
                        <button
                          onClick={() => { setSection('closet'); setIsFilterOpen(false); }}
                          className={`w-full text-left px-4 py-2 rounded-xl transition-colors flex items-center gap-2 ${classificationParam === 'closet' ? 'bg-brand-gold/20 text-brand-blue font-bold' : 'text-gray-700 hover:bg-gray-50'}`}
                        >
                          <i className="ri-t-shirt-2-line text-lg"></i>
                          Closet Sales
                        </button>
                      </div>
                    </div>

                    {/* Categories */}
                    <div className="border-t border-gray-200 pt-8">
                      <h3 className="font-semibold text-gray-900 mb-4">Categories</h3>
                      <div className="space-y-1">
                        <button
                          onClick={() => {
                            selectCategory('all');
                            setIsFilterOpen(false);
                          }}
                          className={`w-full text-left px-4 py-2 rounded-xl transition-colors ${selectedCategory === 'all'
                            ? 'bg-brand-gold/20 text-brand-blue font-bold'
                            : 'text-gray-700 hover:bg-gray-50'
                            }`}
                        >
                          All Categories
                        </button>

                        {/* Parent Categories */}
                        {categories.filter(c => !c.parent_id && c.id !== 'all').map(parent => {
                          const subcategories = categories.filter(c => c.parent_id === parent.id);
                          const isSelected = selectedCategory === parent.slug;
                          const isChildSelected = subcategories.some(sub => sub.slug === selectedCategory);
                          const isOpen = isSelected || isChildSelected; // Auto-expand if selected

                          return (
                            <div key={parent.id} className="space-y-1">
                              <button
                                onClick={() => {
                                  selectCategory(parent.slug);
                                  // Don't close filter immediately if exploring hierarchy
                                }}
                                className={`w-full text-left px-4 py-2 rounded-xl transition-colors flex justify-between items-center ${isSelected
                                  ? 'bg-brand-gold/20 text-brand-blue font-bold'
                                  : 'text-gray-700 hover:bg-gray-50'
                                  }`}
                              >
                                <span>{parent.name}</span>
                              </button>

                              {/* Subcategories */}
                              {subcategories.length > 0 && (
                                <div className="ml-4 border-l-2 border-brand-gold/30 pl-2 space-y-1 mt-1">
                                  {subcategories.map(child => (
                                    <button
                                      key={child.id}
                                      onClick={() => {
                                        selectCategory(child.slug);
                                        setIsFilterOpen(false);
                                      }}
                                      className={`w-full text-left px-4 py-1.5 rounded-lg text-sm transition-colors ${selectedCategory === child.slug
                                        ? 'text-brand-blue font-bold bg-brand-gold/10'
                                        : 'text-gray-600 hover:text-brand-blue hover:bg-gray-50'
                                        }`}
                                    >
                                      {child.name}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Price Range */}
                    <div className="border-t border-gray-200 pt-8">
                      <h3 className="font-semibold text-gray-900 mb-4">Max Price: GH₵{priceRange[1]}</h3>
                      <div className="space-y-4">
                        <input
                          type="range"
                          min="0"
                          max="5000"
                          step="50"
                          value={priceRange[1]}
                          onChange={(e) => {
                            setPriceRange([0, parseInt(e.target.value)]);
                            setPage(1);
                          }}
                          className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-gray-900"
                        />
                        <div className="flex items-center justify-between text-sm text-gray-600">
                          <span>GH₵0</span>
                          <span>GH₵5000+</span>
                        </div>
                      </div>
                    </div>

                    {/* Rating */}
                    <div className="border-t border-gray-200 pt-8">
                      <h3 className="font-semibold text-gray-900 mb-4">Rating</h3>
                      <div className="space-y-2">
                        {[4, 3, 2, 1].map(rating => (
                          <button
                            key={rating}
                            onClick={() => {
                              setSelectedRating(rating === selectedRating ? 0 : rating);
                              setPage(1);
                            }}
                            className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${selectedRating === rating
                              ? 'bg-gray-100 text-gray-900'
                              : 'text-gray-700 hover:bg-gray-100'
                              }`}
                          >
                            <div className="flex items-center space-x-2">
                              {[1, 2, 3, 4, 5].map(star => (
                                <i
                                  key={star}
                                  className={`${star <= rating ? 'ri-star-fill text-amber-400' : 'ri-star-line text-gray-300'} text-sm`}
                                ></i>
                              ))}
                              <span className="text-sm">& Up</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        // Re-fetch handled by effect dependencies
                        setIsFilterOpen(false);
                      }}
                      className="w-full bg-brand-blue hover:bg-brand-blue/90 text-white py-3 rounded-xl font-bold transition-all whitespace-nowrap shadow-md hover:shadow-lg"
                    >
                      Show Results
                    </button>
                  </div>
                </div>
              </div>
            </aside>

            <div className="flex-1">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
                <p className="text-gray-600">
                  Showing <span className="font-semibold text-gray-900">{products.length}</span> of <span className="font-semibold text-gray-900">{totalProducts}</span> products
                </p>

                <div className="flex items-center space-x-3">
                  <label className="text-sm text-gray-600 whitespace-nowrap">Sort by:</label>
                  <select
                    value={sortBy}
                    onChange={(e) => {
                      const next = e.target.value;
                      setSortBy(next);
                      setPage(1);
                      const params = new URLSearchParams(searchParams.toString());
                      if (next === 'popular') params.delete('sort');
                      else params.set('sort', next);
                      params.delete('page');
                      router.replace(`${pathname}${params.toString() ? `?${params.toString()}` : ''}`, { scroll: false });
                    }}
                    className="px-4 py-2 pr-8 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-blue focus:border-brand-blue text-sm bg-white cursor-pointer transition-all"
                  >
                    <option value="popular">Most Popular</option>
                    <option value="new">Newest</option>
                    <option value="price-low">Price: Low to High</option>
                    <option value="price-high">Price: High to Low</option>
                    <option value="rating">Highest Rated</option>
                  </select>
                </div>
              </div>

              {loading ? (
                <div className={selectedCategory !== 'all' ? 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-8' : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8'}>
                  {[...Array(selectedCategory !== 'all' ? 10 : 6)].map((_, i) => (
                    <div key={i} className="bg-gray-100 rounded-xl aspect-[4/5] animate-pulse"></div>
                  ))}
                </div>
              ) : (
                <>
                  <div className={selectedCategory !== 'all' ? 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-8' : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8'} data-product-shop>
                    {products.map(product => (
                      <ProductCard key={product.id} {...product} />
                    ))}
                  </div>

                  {products.length === 0 && (
                    <div className="text-center py-20">
                      <div className="w-20 h-20 flex items-center justify-center mx-auto mb-6 bg-gray-100 rounded-full">
                        <i className="ri-inbox-line text-4xl text-gray-400"></i>
                      </div>
                      <h3 className="text-2xl font-bold text-gray-900 mb-2">No Products Found</h3>
                      <p className="text-gray-600 mb-8">Try adjusting your filters to find what you're looking for</p>
                      <button
                        onClick={() => {
                          setPriceRange([0, 5000]);
                          setSelectedRating(0);
                          const params = new URLSearchParams(searchParams.toString());
                          params.delete('category');
                          params.delete('type');
                          params.delete('page');
                          setSelectedCategory('all');
                          setPage(1);
                          router.push(`${pathname}${params.toString() ? `?${params.toString()}` : ''}`);
                        }}
                        className="inline-flex items-center bg-gray-900 hover:bg-gray-900 text-white px-6 py-3 rounded-lg font-medium transition-colors whitespace-nowrap"
                      >
                        Clear All Filters
                      </button>
                    </div>
                  )}
                </>
              )}

              {/* Infinite scroll: the sentinel loads the next batch; the button is the fallback. */}
              {!loading && products.length > 0 && (
                <div ref={sentinelRef} className="mt-12 flex flex-col items-center gap-3" aria-live="polite">
                  {loadingMore ? (
                    <p className="text-gray-500 flex items-center gap-2">
                      <i className="ri-loader-4-line animate-spin text-xl"></i>
                      Loading more products…
                    </p>
                  ) : hasMore ? (
                    <button
                      onClick={loadMore}
                      className="px-6 py-3 border border-gray-300 rounded-lg font-medium text-gray-800 hover:bg-gray-50 transition-colors"
                    >
                      Load more products
                    </button>
                  ) : (
                    <p className="text-gray-500 text-sm">You&apos;ve seen all {products.length} products</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </AnimatedSection>
    </main>
  );
}

export default function ShopPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="w-12 h-12 border-4 border-gray-900 border-t-transparent rounded-full animate-spin"></div></div>}>
      <ShopContent />
    </Suspense>
  );
}