import { SectionCard } from '../../components/ui'
import { PublicCatalogPage } from '../catalog/PublicCatalogPage'
import { STRINGS, type Lang } from './i18n'

export function SearchFlow({ lang }: { lang: Lang }) {
  const t = STRINGS[lang]
  return (
    <SectionCard>
      <h2>{t.search}</h2>
      {/* Kiosk search is informational — no borrow/reserve action (it links to student login). */}
      <PublicCatalogPage embedded renderBookAction={() => null} />
    </SectionCard>
  )
}
