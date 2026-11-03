import Link from 'next/link';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import ScrollReveal from '@/components/ScrollReveal';

export const revalidate = 0;

export default async function CategoriesPage() {
  const { data: categoriesData } = await supabase
    .from('categories')
    .select(`
      id,
      name,
      slug,
      description,
      image_url,
      position
    `)
    .eq('status', 'active')
    .order('position', { ascending: true });

  const categories = categoriesData?.map((c: any) => {
    return {
      ...c,
      image: c.image_url || 'https://images.unsplash.com/photo-1560869713-7d0a29430803?q=80&w=2626&auto=format&fit=crop',
    };
  }) || [];

  return (
    <div className="min-h-screen bg-brand-light">
      {/* Hero Section */}
      <div className="bg-brand-blue text-white py-20 lg:py-28 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] mix-blend-overlay"></div>
        </div>
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
          <span className="text-brand-gold font-bold tracking-widest uppercase text-xs mb-4 block">Collections</span>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 tracking-tight">Shop by Category</h1>
          <div className="w-24 h-1 bg-brand-gold mx-auto mb-6 rounded-full"></div>
          <p className="text-lg md:text-xl text-white/80 max-w-2xl mx-auto leading-relaxed">
            Curated selections of our finest products, organized just for you.
          </p>
        </div>
      </div>

      {/* Categories Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-24">
        {categories.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 lg:gap-12">
            {categories.map((category: any) => (
              <ScrollReveal 
                key={category.id} 
                direction="up"
              >
                <Link
                  href={`/shop?category=${category.slug}`}
                  className="group block"
                >
                  <div className="relative aspect-[4/3] rounded-2xl overflow-hidden mb-6 shadow-md group-hover:shadow-xl transition-all duration-500">
                    <img
                      src={category.image}
                      alt={category.name}
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-brand-blue/0 group-hover:bg-brand-blue/20 transition-colors duration-500"></div>
                    
                    {/* Floating Badge */}
                    <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-sm text-brand-blue text-xs font-bold px-3 py-1.5 rounded-full opacity-0 group-hover:opacity-100 transform translate-y-2 group-hover:translate-y-0 transition-all duration-300">
                      Explore
                    </div>
                  </div>
                  
                  <div className="text-center px-4">
                    <h3 className="text-2xl font-bold text-gray-900 mb-2 group-hover:text-brand-blue transition-colors">
                      {category.name}
                    </h3>
                    <p className="text-gray-500 text-sm line-clamp-2 mb-4">
                      {category.description || `Discover our premium collection of ${category.name.toLowerCase()}.`}
                    </p>
                    <span className="inline-flex items-center text-brand-gold font-bold text-sm uppercase tracking-wider group-hover:text-brand-blue transition-colors">
                      Shop Now <i className="ri-arrow-right-line ml-2 transform group-hover:translate-x-1 transition-transform"></i>
                    </span>
                  </div>
                </Link>
              </ScrollReveal>
            ))}
          </div>
        ) : (
          <div className="text-center py-32 bg-white rounded-3xl border border-dashed border-gray-200 shadow-sm">
            <div className="w-20 h-20 bg-brand-light rounded-full flex items-center justify-center mx-auto mb-6 text-brand-blue">
              <i className="ri-store-2-line text-4xl"></i>
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">No collections found</h3>
            <p className="text-gray-500">Check back soon for new arrivals.</p>
          </div>
        )}
      </div>

      {/* Bottom CTA */}
      <div className="bg-white border-t border-gray-100 py-16">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Can't Find What You're Looking For?</h2>
          <p className="text-gray-600 mb-8">Try our advanced search or contact our team for personalized recommendations.</p>
          <div className="flex flex-wrap gap-4 justify-center">
            <Link
              href="/shop"
              className="bg-brand-blue text-white px-8 py-4 rounded-xl font-bold hover:bg-brand-blue/90 transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5"
            >
              Search All Products
            </Link>
            <Link
              href="/contact"
              className="bg-white text-brand-blue border-2 border-brand-blue px-8 py-4 rounded-xl font-bold hover:bg-brand-light transition-all"
            >
              Contact Support
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
