import Image from 'next/image';

/** Present on the first paint, before store settings finish loading. */
export const BRAND_LOGO =
  '/storage/v1/object/public/site-assets/branding/MultiMey-Supplies-logo-design--1772709983890.png';

export default function BrandLogo({
  src,
  alt,
  priority = false,
  className = 'h-10 w-auto object-contain sm:h-12 md:h-16',
}: {
  src?: string;
  alt: string;
  priority?: boolean;
  className?: string;
}) {
  const logo = src && src.trim() ? src : BRAND_LOGO;

  return (
    <Image
      src={logo}
      alt={alt}
      width={320}
      height={92}
      priority={priority}
      sizes="320px"
      className={className}
    />
  );
}
