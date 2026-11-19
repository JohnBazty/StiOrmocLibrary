import { ArrowDownToLine, ArrowRight, ArrowUpFromLine, Download, Undo2, Wallet } from 'lucide-react'
import { useState } from 'react'
import { ResponsiveTable } from '../../components/ResponsiveTable'
import { Button, EmptyState, SectionCard, StatusBadge } from '../../components/ui'
import { moneyOutStatus, type MoneyOutRecord, type PracticeTransfer } from './money-out-api'
import { paymentMoney } from './payments-api'

export type FundsActivityRow = {
  id: string
  type: 'Refund' | 'Withdrawal' | 'TopUp'
  status: string
  reference: string
  date: string
  amount: number
  fee: number
  note: string
  provider?: MoneyOutRecord
  local?: PracticeTransfer
}

export function fundsActivity(operations: MoneyOutRecord[], additions: PracticeTransfer[]): FundsActivityRow[] {
  return [
    ...operations.map(row => ({
      id: 'provider-' + row.id,
      type: row.type,
      status: moneyOutStatus(row.state, row.type),
      reference: row.reference,
      date: row.createdAt,
      amount: row.type === 'Withdrawal' ? row.principalCentavos : row.totalCentavos,
      fee: row.feeCentavos,
      note: row.destination ? row.destination.name + ' · ' + row.destination.account : 'Original payment method',
      provider: row,
    })),
    ...additions.map(row => ({
      id: 'local-' + row.id,
      type: row.direction,
      status:
        row.state === 'Succeeded'
          ? row.direction === 'Withdrawal'
            ? 'Recorded locally'
            : 'Recorded'
          : row.state === 'Draft'
            ? 'Ready to review'
            : 'Cancelled',
      reference: row.reference,
      date: row.createdAt,
      amount: row.amountCentavos,
      fee: row.feeCentavos,
      note: row.reason,
      local: row,
    })),
  ].sort((a, b) => Date.parse(b.date) - Date.parse(a.date) || a.id.localeCompare(b.id))
}

const title = (row: FundsActivityRow) =>
  row.type === 'TopUp'
    ? 'Funds added from school bank'
    : row.type === 'Refund'
      ? 'Payment refund'
      : row.local
        ? 'Previous local withdrawal'
        : 'Withdrawal to school bank'

export function FundsActivity({
  operations,
  additions,
  onSelect,
}: {
  operations: MoneyOutRecord[]
  additions: PracticeTransfer[]
  onSelect: (row: FundsActivityRow) => void
}) {
  const [filter, setFilter] = useState('All')
  const rows = fundsActivity(operations, additions)
  const visible = rows.filter(row => filter === 'All' || row.type === filter)

  function exportCsv() {
    const cell = (value: unknown) => '"' + String(value ?? '').replace(/^[=+@-]/, "'").replaceAll('"', '""') + '"'
    const csv = [
      ['Reference', 'Activity', 'Status', 'Amount PHP', 'Fee PHP', 'Date (Asia/Manila)', 'Source'],
      ...rows.map(row => [
        row.reference,
        title(row),
        row.status,
        (row.amount / 100).toFixed(2),
        (row.fee / 100).toFixed(2),
        new Date(row.date).toLocaleString('en-PH', { timeZone: 'Asia/Manila' }),
        row.local ? 'Local record' : 'Xendit',
      ]),
    ]
      .map(row => row.map(cell).join(','))
      .join('\r\n')
    const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'library-funds.csv'
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <SectionCard aria-label="Funds activity" className="mt-5 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--sl-border)] px-5 py-4">
        <div>
          <h2 className="font-display text-base font-semibold text-[var(--sl-text-header)]">Funds activity</h2>
          <div role="group" aria-label="Funds activity filter" className="mt-2.5 flex flex-wrap gap-1.5">
            {[
              ['All', 'All activity'],
              ['Withdrawal', 'Withdrawals'],
              ['TopUp', 'Additions'],
              ['Refund', 'Refunds'],
            ].map(([value, label]) => {
              const active = value === filter
              return (
                <button
                  type="button"
                  key={value}
                  aria-pressed={active}
                  onClick={() => setFilter(value)}
                  className={`inline-flex min-h-8 items-center rounded-[6px] border px-3 py-1 text-xs font-semibold transition-colors ${
                    active
                      ? 'border-[#0b5ea2] bg-[#0b5ea2] text-white'
                      : 'border-[var(--sl-border-strong)] bg-[var(--sl-bg-elevated)] text-[var(--sl-text-secondary)] hover:bg-[var(--sl-bg-subtle)] hover:text-[var(--sl-text-header)]'
                  }`}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>
        <Button variant="secondary" size="sm" disabled={!rows.length} onClick={exportCsv}>
          <Download size={15} aria-hidden="true" /> Export records
        </Button>
      </div>

      {visible.length ? (
        <ResponsiveTable label="Funds activity table">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead className="border-b border-[var(--sl-border)] bg-[var(--sl-bg-subtle)]">
              <tr>
                {['Activity & destination', 'Reference & date', 'Status', 'Amount & fee', 'Actions'].map(col => (
                  <th key={col} scope="col" className="px-4 py-2.5">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--sl-border)]">
              {visible.map(row => (
                <tr key={row.id} className="align-top">
                  <td className="px-4 py-3.5">
                    <div className="flex items-start gap-2.5">
                      <span className="mt-0.5 rounded-[6px] bg-[#0b5ea2]/10 p-1.5 text-[#0b5ea2] dark:bg-white/10 dark:text-[#93c5fd]">
                        {row.type === 'Refund' ? (
                          <Undo2 size={15} aria-hidden="true" />
                        ) : row.type === 'TopUp' ? (
                          <ArrowUpFromLine size={15} aria-hidden="true" />
                        ) : (
                          <ArrowDownToLine size={15} aria-hidden="true" />
                        )}
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold text-[var(--sl-text-header)]">{title(row)}</p>
                        <p className="mt-0.5 break-words text-xs text-[var(--sl-text-secondary)]">{row.note}</p>
                        {row.local && row.type === 'Withdrawal' ? (
                          <p className="mt-0.5 text-[11px] text-[var(--sl-text-muted)]">
                            Local record only. No Xendit transfer was sent.
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-xs text-[var(--sl-text-secondary)] tabular-nums">
                    <p className="font-mono font-semibold text-[var(--sl-text-header)]">{row.reference}</p>
                    <p className="mt-0.5">{new Date(row.date).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</p>
                  </td>
                  <td className="px-4 py-3.5">
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="px-4 py-3.5 tabular-nums">
                    <p className="font-bold text-[var(--sl-text-header)]">{paymentMoney(row.amount)}</p>
                    {row.fee > 0 ? (
                      <p className="mt-0.5 text-xs text-[var(--sl-text-muted)]">
                        {row.type === 'Refund' ? 'Includes refunded fee: ' : 'Transfer fee: '}
                        {paymentMoney(row.fee)}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <Button variant="secondary" size="sm" onClick={() => onSelect(row)}>
                      {row.local?.state === 'Draft' && row.type === 'TopUp' ? 'Review addition' : 'View details'}
                      <ArrowRight size={14} aria-hidden="true" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ResponsiveTable>
      ) : (
        <EmptyState
          icon={Wallet}
          title={`No ${filter === 'All' ? 'funds activity' : filter === 'TopUp' ? 'additions' : filter.toLowerCase() + 's'} yet`}
          description="Your saved reviews and confirmed transfers appear here."
        />
      )}
    </SectionCard>
  )
}
