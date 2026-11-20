/**
 * The system logo. Every brand mark (portal sidebar, login, admin login, sign-in popup)
 * uses this one file, so replacing the official logo means replacing
 * apps/web/public/brand-logo.webp only (keep a small web size; the source is logo.jpg).
 */
export const BRAND_LOGO_SRC = '/brand-logo.webp'

export function BrandLogo({ className = 'h-10 w-10' }: { className?: string }) {
  // Decorative: the school name is always written next to it.
  return (
    <img
      src={BRAND_LOGO_SRC}
      alt=""
      width={256}
      height={160}
      decoding="async"
      className={`${className} shrink-0 rounded-xl bg-[#FFE500] object-contain p-0.5`}
    />
  )
}
