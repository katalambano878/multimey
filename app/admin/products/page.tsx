'use client';

import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const ADMIN_PRODUCTS_SCROLL_KEY = 'admin_products_scroll';

function buildProductsQuery(category: string, status: string, sort: string) {
  const params = new URLSearchParams();
  if (category) params.set('category', category);
  if (status) params.set('status', status);
  if (sort && sort !== 'newest') params.set('sort', sort);
  return params.toString();
}

export default function ProductsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [sortBy, setSortBy] = useState(() => searchParams.get('sort') || 'newest');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState(() => searchParams.get('category') || '');
  const [filterStatus, setFilterStatus] = useState(() => searchParams.get('status') || '');
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<any[]>([]);
  const scrollRestored = useRef(false);

  // Statistics
  const [stats, setStats] = useState({
    total: 0,
    lowStock: 0,
    outOfStock: 0,
    active: 0
  });

  const statusColors: any = {
    'active': 'bg-gray-100 text-gray-900',
    'draft': 'bg-gray-100 text-gray-700',
    'archived': 'bg-amber-100 text-amber-700',
  };

  // Restore filters/sort from URL on load and when returning from edit
  useEffect(() => {
    const cat = searchParams.get('category') ?? '';
    const status = searchParams.get('status') ?? '';
    const sort = searchParams.get('sort') ?? 'newest';
    setFilterCategory(cat);
    setFilterStatus(status);
    setSortBy(sort || 'newest');
  }, [searchParams]);

  useEffect(() => {
    fetchProducts();
    fetchCategories();
  }, [sortBy, filterCategory, filterStatus]);

  // Restore scroll position when returning from edit
  useEffect(() => {
    if (scrollRestored.current || loading) return;
    const saved = sessionStorage.getItem(ADMIN_PRODUCTS_SCROLL_KEY);
    if (saved) {
      const y = parseInt(saved, 10);
      if (!isNaN(y) && y > 0) {
        scrollRestored.current = true;
        sessionStorage.removeItem(ADMIN_PRODUCTS_SCROLL_KEY);
        requestAnimationFrame(() => window.scrollTo(0, y));
      }
    }
  }, [loading]);

  const updateUrl = (category: string, status: string, sort: string) => {
    const q = buildProductsQuery(category, status, sort);
    const url = q ? `${pathname}?${q}` : pathname;
    router.replace(url);
  };

  const productsReturnUrl = pathname + (buildProductsQuery(filterCategory, filterStatus, sortBy) ? `?${buildProductsQuery(filterCategory, filterStatus, sortBy)}` : '');

  const saveScrollBeforeEdit = () => {
    sessionStorage.setItem(ADMIN_PRODUCTS_SCROLL_KEY, String(window.scrollY));
  };

  const fetchCategories = async () => {
    const { data } = await supabase.from('categories').select('id, name').order('name');
    if (data) setCategories(data);
  };

  const fetchProducts = async () => {
    try {
      setLoading(true);
      let query = supabase
        .from('products')
        .select(`
          *,
          categories(name),
          product_variants(count),
          product_images(url, position)
        `);

      // Apply filters
      if (filterCategory) query = query.eq('category_id', filterCategory);
      if (filterStatus) query = query.eq('status', filterStatus);

      // Apply sorting
      if (sortBy === 'newest') query = query.order('created_at', { ascending: false });
      if (sortBy === 'price_asc') query = query.order('price', { ascending: true });
      if (sortBy === 'price_desc') query = query.order('price', { ascending: false });
      if (sortBy === 'name') query = query.order('name', { ascending: true });
      if (sortBy === 'stock') query = query.order('quantity', { ascending: true });

      const { data, error } = await query;

      if (error) throw error;

      if (data) {
        // Transform data for UI
        const transformedProducts = data.map((p: any) => ({
          ...p,
          category: p.categories?.name || 'Uncategorized',
          image: p.product_images?.find((img: any) => img.position === 0)?.url
            || p.product_images?.[0]?.url
            || 'https://via.placeholder.com/300?text=No+Image',
          variantsCount: p.product_variants?.[0]?.count || 0,
          stock: p.quantity,
          sales: 0, // Placeholder for now
          rating: p.rating_avg || 0
        }));

        setProducts(transformedProducts);

        // Calculate stats locally for now (better to do count queries in production)
        setStats({
          total: transformedProducts.length,
          lowStock: transformedProducts.filter(p => p.quantity < (p.metadata?.low_stock_threshold || 5) && p.quantity > 0).length,
          outOfStock: transformedProducts.filter(p => p.quantity === 0).length,
          active: transformedProducts.filter(p => p.status === 'active').length
        });
      }
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setLoading(false);
    }
  };

  // Select-all only covers the products currently shown by search/filters.
  const handleSelectAll = () => {
    const visibleIds = filteredProducts.map(p => p.id);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedProducts.includes(id));
    setSelectedProducts(allVisibleSelected ? [] : visibleIds);
  };

  const handleSelectProduct = (productId: string) => {
    if (selectedProducts.includes(productId)) {
      setSelectedProducts(selectedProducts.filter(id => id !== productId));
    } else {
      setSelectedProducts([...selectedProducts, productId]);
    }
  };

  // Products that appear in past orders are archived instead of deleted, so
  // order history keeps its product links. Each step stops on the first error.
  const deleteProductsById = async (ids: string[]): Promise<{ error: string | null; archived: number }> => {
    const { data: ordered, error: orderedError } = await supabase
      .from('order_items')
      .select('product_id')
      .in('product_id', ids);
    if (orderedError) return { error: orderedError.message, archived: 0 };

    const orderedIds = Array.from(new Set((ordered || []).map((r: any) => r.product_id)));
    const deletable = ids.filter(id => !orderedIds.includes(id));

    if (orderedIds.length) {
      const { error } = await supabase.from('products').update({ status: 'archived' }).in('id', orderedIds);
      if (error) return { error: error.message, archived: 0 };
    }

    if (deletable.length) {
      const { data: reviewRows } = await supabase.from('reviews').select('id').in('product_id', deletable);
      const reviewIds = (reviewRows || []).map((r: any) => r.id);
      if (reviewIds.length) {
        const { error } = await supabase.from('review_images').delete().in('review_id', reviewIds);
        if (error) return { error: error.message, archived: orderedIds.length };
      }
      for (const table of ['cart_items', 'wishlist_items', 'reviews', 'product_images', 'product_variants']) {
        const { error } = await supabase.from(table).delete().in('product_id', deletable);
        if (error) return { error: `${table}: ${error.message}`, archived: orderedIds.length };
      }
      const { error } = await supabase.from('products').delete().in('id', deletable);
      if (error) return { error: error.message, archived: orderedIds.length };
    }
    return { error: null, archived: orderedIds.length };
  };

  const handleDeleteProduct = async (productId: string) => {
    if (confirm('Are you sure you want to delete this product?')) {
      const { error, archived } = await deleteProductsById([productId]);
      if (!error) {
        if (archived) {
          setProducts(products.map(p => (p.id === productId ? { ...p, status: 'archived' } : p)));
          alert('This product has past orders, so it was archived instead of deleted. It no longer shows in the shop.');
        } else {
          setProducts(products.filter(p => p.id !== productId));
          alert('Product deleted successfully');
        }
      } else {
        alert('Error deleting product: ' + error);
      }
    }
  };

  const handleBulkDelete = async () => {
    if (confirm(`Are you sure you want to delete ${selectedProducts.length} products?`)) {
      const { error, archived } = await deleteProductsById(selectedProducts);
      if (!error) {
        setSelectedProducts([]);
        await fetchProducts();
        alert(archived
          ? `Done. ${archived} product${archived === 1 ? ' has' : 's have'} past orders, so ${archived === 1 ? 'it was' : 'they were'} archived instead of deleted.`
          : 'Products deleted successfully');
      } else {
        alert('Error deleting products: ' + error);
      }
    }
  };

  const filteredProducts = products.filter(product => {
    const term = searchQuery.toLowerCase();
    return product.name.toLowerCase().includes(term) ||
      (product.sku && product.sku.toLowerCase().includes(term)) ||
      (product.category && product.category.toLowerCase().includes(term));
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Products</h1>
          <p className="text-gray-600 mt-1">Manage your product catalog and inventory</p>
        </div>
        <Link
          href="/admin/products/new"
          className="px-6 py-3 bg-gray-900 hover:bg-gray-800 text-white rounded-lg font-semibold transition-colors whitespace-nowrap cursor-pointer flex items-center justify-center md:items-start"
        >
          <i className="ri-add-line mr-2"></i>
          Add Product
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border-2 border-gray-200 p-4">
          <p className="text-sm text-gray-600 mb-1">Total Products</p>
          <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
        </div>
        <div className="bg-white rounded-xl border-2 border-gray-200 p-4">
          <p className="text-sm text-gray-600 mb-1">Active</p>
          <p className="text-2xl font-bold text-gray-900">{stats.active}</p>
        </div>
        <div className="bg-white rounded-xl border-2 border-gray-200 p-4">
          <p className="text-sm text-gray-600 mb-1">Low Stock</p>
          <p className="text-2xl font-bold text-amber-700">{stats.lowStock}</p>
        </div>
        <div className="bg-white rounded-xl border-2 border-gray-200 p-4">
          <p className="text-sm text-gray-600 mb-1">Out of Stock</p>
          <p className="text-2xl font-bold text-red-700">{stats.outOfStock}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
            <div className="flex-1 max-w-md">
              <div className="relative">
                <i className="ri-search-line absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-lg w-5 h-5 flex items-center justify-center"></i>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search products by name, SKU, or category..."
                  className="w-full pl-12 pr-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600 text-sm"
                />
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="px-4 py-3 border-2 border-gray-300 text-gray-700 rounded-lg hover:border-gray-400 transition-colors font-medium whitespace-nowrap cursor-pointer"
              >
                <i className="ri-filter-line mr-2"></i>
                Filters
              </button>
              <select
                value={sortBy}
                onChange={(e) => {
                  const v = e.target.value;
                  setSortBy(v);
                  updateUrl(filterCategory, filterStatus, v);
                }}
                className="px-4 py-3 pr-8 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600 font-medium cursor-pointer"
              >
                <option value="newest">Newest First</option>
                <option value="name">Sort by Name</option>
                <option value="price_asc">Price: Low to High</option>
                <option value="price_desc">Price: High to Low</option>
                <option value="stock">Sort by Stock</option>
              </select>
              <div className="flex border-2 border-gray-300 rounded-lg overflow-hidden">
                <button
                  onClick={() => setViewMode('list')}
                  className={`w-10 h-10 flex items-center justify-center transition-colors cursor-pointer ${viewMode === 'list' ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                >
                  <i className="ri-list-check text-xl w-5 h-5 flex items-center justify-center"></i>
                </button>
                <button
                  onClick={() => setViewMode('grid')}
                  className={`w-10 h-10 flex items-center justify-center border-l-2 border-gray-300 transition-colors cursor-pointer ${viewMode === 'grid' ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                >
                  <i className="ri-grid-line text-xl w-5 h-5 flex items-center justify-center"></i>
                </button>
              </div>
            </div>
          </div>

          {showFilters && (
            <div className="mt-4 p-4 bg-gray-50 rounded-lg grid md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Category</label>
                <select
                  value={filterCategory}
                  onChange={(e) => {
                    const v = e.target.value;
                    setFilterCategory(v);
                    updateUrl(v, filterStatus, sortBy);
                  }}
                  className="w-full px-3 py-2 pr-8 border-2 border-gray-300 rounded-lg text-sm cursor-pointer focus:ring-2 focus:ring-gray-600 focus:border-gray-600"
                >
                  <option value="">All Categories</option>
                  {categories.map((cat: any) => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
                <select
                  value={filterStatus}
                  onChange={(e) => {
                    const v = e.target.value;
                    setFilterStatus(v);
                    updateUrl(filterCategory, v, sortBy);
                  }}
                  className="w-full px-3 py-2 pr-8 border-2 border-gray-300 rounded-lg text-sm cursor-pointer focus:ring-2 focus:ring-gray-600 focus:border-gray-600"
                >
                  <option value="">All Status</option>
                  <option value="active">Active</option>
                  <option value="draft">Draft</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {selectedProducts.length > 0 && (
          <div className="p-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
            <p className="text-gray-800 font-semibold">
              {selectedProducts.length} product{selectedProducts.length > 1 ? 's' : ''} selected
            </p>
            <div className="flex items-center space-x-2">
              <button
                onClick={handleBulkDelete}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors whitespace-nowrap cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="p-12 text-center text-gray-500">
            <i className="ri-loader-4-line animate-spin text-3xl mb-2 inline-block"></i>
            <p>Loading products...</p>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <i className="ri-inbox-line text-4xl mb-4 text-gray-300 inline-block"></i>
            <p className="text-lg">No products found</p>
            <p className="text-sm text-gray-400 mt-1">Try adjusting your search or filters</p>
          </div>
        ) : viewMode === 'list' ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="py-4 px-6">
                    <input
                      type="checkbox"
                      checked={filteredProducts.length > 0 && filteredProducts.every(p => selectedProducts.includes(p.id))}
                      onChange={handleSelectAll}
                      className="w-4 h-4 text-gray-900 border-gray-300 rounded focus:ring-gray-600 cursor-pointer"
                    />
                  </th>
                  <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Product</th>
                  <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">SKU</th>
                  <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Category</th>
                  <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Price</th>
                  <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Stock</th>
                  <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Status</th>
                  <th className="text-left py-4 px-4 text-sm font-semibold text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product) => (
                  <tr key={product.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="py-4 px-6">
                      <input
                        type="checkbox"
                        checked={selectedProducts.includes(product.id)}
                        onChange={() => handleSelectProduct(product.id)}
                        className="w-4 h-4 text-gray-900 border-gray-300 rounded focus:ring-gray-600 cursor-pointer"
                      />
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-16 h-16 bg-gray-100 rounded-lg overflow-hidden border border-gray-200">
                          <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900">{product.name}</p>
                          <div className="flex items-center mt-1">
                            <span className="text-xs text-gray-400">ID: {product.id.substring(0, 8)}...</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-4 text-gray-700 text-sm font-mono">{product.sku || '-'}</td>
                    <td className="py-4 px-4 text-gray-700 text-sm">{product.category}</td>
                    <td className="py-4 px-4 font-semibold text-gray-900 whitespace-nowrap">GH₵ {product.price.toFixed(2)}</td>
                    <td className="py-4 px-4 text-gray-700">
                      {product.stock}
                      {product.stock <= (product.metadata?.low_stock_threshold || 5) && product.stock > 0 && (
                        <span className="ml-2 w-2 h-2 rounded-full bg-amber-500 inline-block" title="Low Stock"></span>
                      )}
                      {product.stock === 0 && (
                        <span className="ml-2 w-2 h-2 rounded-full bg-red-500 inline-block" title="Out of Stock"></span>
                      )}
                    </td>
                    <td className="py-4 px-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap capitalize ${statusColors[product.status] || 'bg-gray-100 text-gray-600'}`}>
                        {product.status}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center space-x-2">
                        <Link
                          href={`/admin/products/${product.id}?return=${encodeURIComponent(productsReturnUrl)}`}
                          onClick={saveScrollBeforeEdit}
                          className="w-8 h-8 flex items-center justify-center text-gray-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                        >
                          <i className="ri-edit-line text-lg"></i>
                        </Link>
                        <button
                          onClick={() => handleDeleteProduct(product.id)}
                          className="w-8 h-8 flex items-center justify-center text-gray-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                        >
                          <i className="ri-delete-bin-line text-lg"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-6 grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredProducts.map((product) => (
              <div key={product.id} className="border-2 border-gray-200 rounded-xl p-4 hover:shadow-lg transition-shadow">
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={selectedProducts.includes(product.id)}
                    onChange={() => handleSelectProduct(product.id)}
                    className="absolute top-2 left-2 w-5 h-5 text-gray-900 border-gray-300 rounded focus:ring-gray-600 cursor-pointer z-10"
                  />
                  <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden mb-3 border border-gray-200">
                    <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
                  </div>
                </div>
                <span className={`inline-block px-2 py-1 rounded-full text-xs font-semibold mb-2 capitalize ${statusColors[product.status] || 'bg-gray-100 text-gray-600'}`}>
                  {product.status}
                </span>
                <h3 className="font-semibold text-gray-900 mb-1 line-clamp-2">{product.name}</h3>
                <p className="text-sm text-gray-600 mb-2">{product.category}</p>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-lg font-bold text-gray-900">GH₵ {product.price}</p>
                </div>
                <div className="flex items-center justify-between text-sm text-gray-600 mb-3 pb-3 border-b border-gray-200">
                  <span>Stock: {product.stock}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Link
                    href={`/admin/products/${product.id}?return=${encodeURIComponent(productsReturnUrl)}`}
                    onClick={saveScrollBeforeEdit}
                    className="flex-1 bg-gray-900 hover:bg-gray-800 text-white py-2 rounded-lg text-sm font-medium text-center transition-colors whitespace-nowrap cursor-pointer"
                  >
                    Edit
                  </Link>
                  <button
                    onClick={() => handleDeleteProduct(product.id)}
                    className="w-9 h-9 flex items-center justify-center border-2 border-gray-300 text-gray-700 hover:border-red-600 hover:text-red-600 rounded-lg transition-colors cursor-pointer"
                  >
                    <i className="ri-delete-bin-line"></i>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="p-6 border-t border-gray-200 flex items-center justify-between">
          <p className="text-sm text-gray-500">
            {filteredProducts.length === 0 ? 'No products' : `Showing ${filteredProducts.length} product${filteredProducts.length !== 1 ? 's' : ''}`}
          </p>
        </div>
      </div>
    </div>
  );
}
