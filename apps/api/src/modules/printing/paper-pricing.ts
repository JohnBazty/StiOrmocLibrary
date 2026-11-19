import type { PoolConnection, RowDataPacket } from '../../config/db.js'
import { HttpError } from '../../core/http-error.ts'

export const effectivePaperPrice = `CASE WHEN p.loaded_paper_brand_stock_id IS NULL THEN r.price_per_page
  WHEN r.print_type='Monochrome' THEN b.monochrome_price ELSE b.colored_price END`

/** Parent lock serializes brand loading, rate edits and accepted request prices. */
export async function lockPaperPrice(q: PoolConnection, paperSize: string, printType: string) {
  const [sizes] = await q.execute<RowDataPacket[]>('SELECT paper_stock_id,loaded_paper_brand_stock_id FROM bond_paper_stocks WHERE paper_size_dimension=? AND is_active=TRUE AND deleted_at IS NULL FOR SHARE', [paperSize])
  const [rules] = await q.execute<RowDataPacket[]>('SELECT price_per_page FROM print_pricing_rules WHERE print_type=? AND paper_size=? AND is_active=1 FOR SHARE', [printType, paperSize])
  const size = sizes[0], rule = rules[0]
  if (!size || !rule) throw new HttpError(409, 'PRINT_PRICE_CHANGED', 'The paper size or printing price changed. Review the price before submitting.')
  let price = Number(rule.price_per_page), brandId: number | null = null, brandName: string | null = null
  if (size.loaded_paper_brand_stock_id != null) {
    const [brands] = await q.execute<RowDataPacket[]>('SELECT paper_brand_stock_id,brand,monochrome_price,colored_price FROM paper_brand_stocks WHERE paper_stock_id=? AND paper_brand_stock_id=? AND deleted_at IS NULL FOR SHARE', [size.paper_stock_id, size.loaded_paper_brand_stock_id])
    const brand = brands[0]
    price = Number(printType === 'Monochrome' ? brand?.monochrome_price : brand?.colored_price)
    if (brand) { brandId = Number(brand.paper_brand_stock_id); brandName = String(brand.brand) }
  }
  if (!Number.isFinite(price) || price <= 0) throw new HttpError(409, 'PRINT_PRICE_CHANGED', 'Printing prices for the loaded paper need library review. Refresh the available paper sizes.')
  return { price, brandId, brandName }
}

/** Caller already holds the size lock; a stock purchase does not load the brand. */
export async function loadPaperBrand(q: PoolConnection, paperId: number, brandId: number) {
  const [rows] = await q.execute<RowDataPacket[]>('SELECT brand,monochrome_price,colored_price FROM paper_brand_stocks WHERE paper_stock_id=? AND paper_brand_stock_id=? AND deleted_at IS NULL FOR UPDATE', [paperId, brandId])
  const brand = rows[0]
  if (!brand || Number(brand.monochrome_price) <= 0 || Number(brand.colored_price) <= 0 || brand.monochrome_price == null || brand.colored_price == null) throw new HttpError(422, 'PAPER_BRAND_PRICE_REQUIRED', 'Set this brand’s monochrome and colored prices before opening a ream.')
  await q.execute('UPDATE bond_paper_stocks SET loaded_paper_brand_stock_id=?,configuration_version=configuration_version+1 WHERE paper_stock_id=?', [brandId, paperId])
  return { brand: String(brand.brand), monochromePrice: Number(brand.monochrome_price), coloredPrice: Number(brand.colored_price) }
}
