import { Archive } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader, SectionCard } from '../../components/ui'

export function BorrowingPoliciesArchivedPage() {
  return <>
    <PageHeader eyebrow="Library administration" title="Borrowing policies archived" />
    <SectionCard className="max-w-xl p-6">
      <Archive size={28} aria-hidden="true" />
      <h2 className="mt-4 text-lg font-bold">Archived for now</h2>
      <p className="mt-2 text-sm">The policy editor is temporarily unavailable. Your saved borrowing rules and history are preserved. Those rules still apply to borrowing.</p>
      <Link to="/librarian/dashboard" className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-[#0b5ea2] px-4 text-sm font-bold text-white">Back to dashboard</Link>
    </SectionCard>
  </>
}
