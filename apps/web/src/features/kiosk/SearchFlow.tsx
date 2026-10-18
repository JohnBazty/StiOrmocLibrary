import { Button, SectionCard } from '../../components/ui'
import { PublicCatalogPage } from '../catalog/PublicCatalogPage'
import { STRINGS, type Lang } from './i18n'

export function SearchFlow({ lang, onDone }: { lang: Lang; onDone: () => void }) {
  const t = STRINGS[lang]
  return (
    <SectionCard>
      <div className="flex justify-between items-center">
        <h2>{t.search}</h2>
        <Button variant="secondary" onClick={onDone}>{t.done}</Button>
      </div>
      {/* Kiosk search is informational — no borrow/reserve action (it links to student login). */}
      <PublicCatalogPage embedded renderBookAction={() => null} />
    </SectionCard>
  )
}
