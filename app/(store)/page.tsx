'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';
import { useCMS } from '@/context/CMSContext';
import ProductCard, { type ColorVariant, getColorHex } from '@/components/ProductCard';
import AnimatedSection, { AnimatedGrid } from '@/components/AnimatedSection';
import { usePageTitle } from '@/hooks/usePageTitle';
import { motion } from 'framer-motion';

/** Max featured products to load on the homepage (Supabase fetch). Raise if you need more than this. */
const FEATURED_PRODUCTS_HOME_LIMIT = 200;

export default function Home() {
  usePageTitle('');
  const { getSetting, getActiveBanners } = useCMS();
  const [featuredProducts, setFeaturedProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const { data: productsData, error: productsError } = await supabase
          .from('products')
          .select('*, product_variants(*), product_images(*)')
          .eq('status', 'active')
          .eq('featured', true)
          .order('quantity', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(FEATURED_PRODUCTS_HOME_LIMIT);

        if (productsError) throw productsError;
        setFeaturedProducts(productsData || []);

        const { data: categoriesData, error: categoriesError } = await supabase
          .from('categories')
          .select('id, name, slug, image_url, metadata')
          .eq('status', 'active')
          .order('name');

        if (categoriesError) throw categoriesError;

        const featuredCategories = (categoriesData || []).filter(
          (cat: any) => cat.metadata?.featured === true
        );
        setCategories(featuredCategories);
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  // ── CMS-driven config ────────────────────────────────────────────
  const heroHeadline = getSetting('hero_headline') || 'Welcome to MultiMey Supplies';
  const heroSubheadline = getSetting('hero_subheadline') || 'Premium quality, crafted for you.';
  const HERO_SLIDES = ['/hero-1.png', '/hero-2.png'];
  const HERO_SLIDE_CONTENT: Array<{
    tag?: string;
    headline?: string;
    subheadline?: string;
    primaryText?: string;
    primaryLink?: string;
    secondaryText?: string;
    secondaryLink?: string;
    showBadge?: boolean;
    showStats?: boolean;
  } | null> = [
    {
      tag: 'BEAUTY & SUPPLIES',
      headline: 'Curated Personal Essentials',
      subheadline: 'Thoughtfully Sourced for You, to improve the quality of your everyday life.',
      primaryText: 'Retail Items',
      primaryLink: '/shop?type=retail',
      secondaryText: 'Closet Sales',
      secondaryLink: '/shop?type=closet',
      showBadge: false,
      showStats: false,
    }, // slide 0: hero-1.png
    {
      tag: 'ELECTRONICS & APPLIANCES',
      headline: 'Top-Quality Electronics & Gadgets',
      subheadline: 'From smart kitchen appliances to everyday electronics — imported directly and priced to move.',
      primaryText: 'Retail Items',
      primaryLink: '/shop?type=retail',
      secondaryText: 'Closet Sales',
      secondaryLink: '/shop?type=closet',
      showBadge: false,
      showStats: false,
    }, // slide 1: hero-2.png
  ];
  const HERO_INTERVAL_MS = 3000;
  const HERO_SLIDE_COUNT = 2; // Slide 0: Beauty (hero-1), Slide 1: Electronics (hero-2)
  const [heroIndex, setHeroIndex] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setHeroIndex((i) => (i + 1) % HERO_SLIDE_COUNT), HERO_INTERVAL_MS);
    return () => clearInterval(t);
  }, []);
  const slideContent = HERO_SLIDE_CONTENT[heroIndex];
  const heroPrimaryText = slideContent?.primaryText ?? getSetting('hero_primary_btn_text');
  const heroPrimaryLink = slideContent?.primaryLink ?? getSetting('hero_primary_btn_link') ?? '/shop';
  const heroSecondaryText = slideContent?.secondaryText ?? getSetting('hero_secondary_btn_text');
  const heroSecondaryLink = slideContent?.secondaryLink ?? getSetting('hero_secondary_btn_link') ?? '/about';
  const heroTagText = slideContent?.tag ?? getSetting('hero_tag_text');
  const heroBadgeLabel = getSetting('hero_badge_label');
  const heroBadgeText = getSetting('hero_badge_text');
  const heroBadgeSubtext = getSetting('hero_badge_subtext');
  const heroHeadlineDisplay = slideContent?.headline ?? heroHeadline;
  const heroSubheadlineDisplay = slideContent?.subheadline ?? heroSubheadline;
  const showHeroBadge = slideContent?.showBadge !== false;
  const showHeroStats = slideContent?.showStats !== false;

  const features = [
    { icon: getSetting('feature1_icon'), title: getSetting('feature1_title'), desc: getSetting('feature1_desc') },
    { icon: getSetting('feature2_icon'), title: getSetting('feature2_title'), desc: getSetting('feature2_desc') },
    { icon: getSetting('feature3_icon'), title: getSetting('feature3_title'), desc: getSetting('feature3_desc') },
    { icon: getSetting('feature4_icon'), title: getSetting('feature4_title'), desc: getSetting('feature4_desc') },
  ];

  const stat1Title = getSetting('hero_stat1_title');
  const stat1Desc = getSetting('hero_stat1_desc');
  const stat2Title = getSetting('hero_stat2_title');
  const stat2Desc = getSetting('hero_stat2_desc');
  const stat3Title = getSetting('hero_stat3_title');
  const stat3Desc = getSetting('hero_stat3_desc');

  const activeBanners = getActiveBanners('top');

  const renderBanners = () => {
    if (activeBanners.length === 0) return null;
    return (
      <div className="bg-gray-900 text-white py-2 overflow-hidden relative z-50">
        <div className="flex animate-marquee whitespace-nowrap">
          {activeBanners.concat(activeBanners).map((banner, index) => (
            <span key={index} className="mx-8 text-sm font-medium tracking-wide flex items-center">
              {banner.title}
            </span>
          ))}
        </div>
      </div>
    );
  };

  return (
    <main className="flex-col items-center justify-between min-h-screen bg-white">
      {renderBanners()}

      {/* Hero Section */}
      <section className="relative w-full min-h-[500px] md:min-h-[600px] lg:min-h-[700px] flex flex-col justify-center items-center overflow-hidden bg-gradient-to-br from-brand-blue/95 to-brand-blue/70">
        <div className="absolute inset-0 z-0">
          {/* Both slides always in DOM so both images load; only active one visible */}
          {HERO_SLIDES.map((src, index) => (
            <motion.div
              key={src}
              initial={false}
              animate={{
                opacity: heroIndex === index ? 1 : 0,
                scale: heroIndex === index ? 1 : 1.05,
              }}
              transition={{ duration: 0.8, ease: 'easeInOut' }}
              className={`absolute inset-0 ${heroIndex === index ? 'z-10' : 'z-0'}`}
            >
              <Image
                src={src}
                fill
                className="object-cover object-center opacity-50"
                alt={index === 0 ? 'Curated Personal Essentials' : 'Electronics & Gadgets'}
                priority={index === 0}
                sizes="100vw"
                quality={70}
              />
            </motion.div>
          ))}
        </div>

        {/* Content */}
        <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 text-center mt-16">
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.6 }}
            className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-white leading-tight mb-6"
          >
            {heroHeadlineDisplay}
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.6 }}
            className="text-lg sm:text-xl text-white/90 mb-10 font-medium max-w-2xl mx-auto"
          >
            {heroSubheadlineDisplay}
          </motion.p>
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.6 }}
            className="flex flex-col sm:flex-row gap-4 justify-center items-center"
          >
            <Link
              href={heroPrimaryLink}
              className="w-full sm:w-auto inline-flex items-center justify-center bg-brand-blue text-white hover:bg-brand-blue/90 px-8 py-4 rounded-xl font-semibold text-lg transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5"
            >
              {heroPrimaryText}
            </Link>
            {heroSecondaryText && (
              <Link
                href={heroSecondaryLink}
                className="w-full sm:w-auto inline-flex items-center justify-center bg-brand-gold text-brand-blue hover:bg-brand-gold/90 px-8 py-4 rounded-xl font-semibold text-lg transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5"
              >
                {heroSecondaryText}
              </Link>
            )}
          </motion.div>
        </div>
      </section>

      {/* Featured Products */}
      <section className="py-24 bg-stone-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <AnimatedSection className="text-center mb-16">
            <span className="text-gray-500 font-bold tracking-widest uppercase text-xs mb-3 block">New Arrivals</span>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Featured Products</h2>
            <p className="text-gray-600 text-lg max-w-2xl mx-auto">Handpicked favorites just for you.</p>
          </AnimatedSection>

          {loading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="bg-gray-200 aspect-[3/4] rounded-2xl mb-4"></div>
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                </div>
              ))}
            </div>
          ) : (
            <AnimatedGrid className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 lg:gap-8">
              {featuredProducts.map((product) => {
                const variants = product.product_variants || [];
                const hasVariants = variants.length > 0;
                const minVariantPrice = hasVariants ? Math.min(...variants.map((v: any) => v.price || product.price)) : undefined;
                const totalVariantStock = hasVariants ? variants.reduce((sum: number, v: any) => sum + (v.quantity || 0), 0) : 0;
                const effectiveStock = hasVariants ? totalVariantStock : product.quantity;

                const colorVariants: ColorVariant[] = [];
                const seenColors = new Set<string>();
                for (const v of variants) {
                  const colorName = (v as any).option2;
                  if (colorName && !seenColors.has(colorName.toLowerCase().trim())) {
                    const hex = getColorHex(colorName);
                    if (hex) {
                      seenColors.add(colorName.toLowerCase().trim());
                      colorVariants.push({ name: colorName.trim(), hex });
                    }
                  }
                }

                return (
                  <ProductCard
                    key={product.id}
                    id={product.id}
                    slug={product.slug}
                    name={product.name}
                    price={product.price}
                    originalPrice={product.compare_at_price}
                    image={product.product_images?.[0]?.url || 'https://via.placeholder.com/400x500'}
                    rating={product.rating_avg || 5}
                    reviewCount={product.review_count || 0}
                    badge={product.featured ? 'Featured' : undefined}
                    inStock={effectiveStock > 0}
                    maxStock={effectiveStock || 50}
                    moq={product.moq || 1}
                    hasVariants={hasVariants}
                    minVariantPrice={minVariantPrice}
                    colorVariants={colorVariants}
                    brand={product.brand || product.vendor}
                  />
                );
              })}
            </AnimatedGrid>
          )}

          <div className="text-center mt-20">
            <Link
              href="/shop"
              className="inline-flex items-center justify-center bg-brand-blue text-white px-12 py-5 rounded-full font-bold text-lg hover:bg-brand-blue/90 transition-all shadow-xl hover:shadow-2xl hover:-translate-y-1"
            >
              Shop All Products
            </Link>
          </div>
        </div>
      </section>

      {/* Trust Features */}
      <section className="py-16 bg-brand-light border-y border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
            {features.map((feature, i) => (
              <AnimatedSection key={i} delay={i * 0.1} className="relative group">
                <div className="flex flex-col items-center text-center p-6 md:p-8 rounded-2xl bg-white border border-gray-100 hover:border-brand-gold/50 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
                  <div className="w-16 h-16 bg-brand-gold/10 rounded-full flex items-center justify-center mb-5 text-brand-blue group-hover:bg-brand-blue group-hover:text-brand-gold transition-colors duration-300">
                    <i className={`${feature.icon} text-3xl`}></i>
                  </div>
                  <h3 className="font-bold text-gray-900 mb-2 text-[16px]">{feature.title}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">{feature.desc}</p>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

    </main>
  );
}
