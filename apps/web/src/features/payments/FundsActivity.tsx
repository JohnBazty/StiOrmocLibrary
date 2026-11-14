import { useState } from 'react'
import { ArrowDownToLine, ArrowRight, ArrowUpFromLine, Download, Undo2, Wallet } from 'lucide-react'
import { Button } from '../../components/ui'
import { moneyOutStatus, type MoneyOutRecord, type PracticeTransfer } from './money-out-api'
import { paymentMoney } from './payments-api'

export type FundsActivityRow = { id: string; type: 'Refund' | 'Withdrawal' | 'TopUp'; status: string; reference: string; date: string; amount: number; fee: number; note: string; provider?: MoneyOutRecord; local?: PracticeTransfer }
export function fundsActivity(operations: MoneyOutRecord[], additions: PracticeTransfer[]): FundsActivityRow[] {
  return [
    ...operations.map(row => ({ id: 'provider-' + row.id, type: row.type, status: moneyOutStatus(row.state, row.type), reference: row.reference,
      date: row.createdAt, amount: row.type === 'Withdrawal' ? row.principalCentavos : row.totalCentavos, fee: row.feeCentavos,
      note: row.destination ? row.destination.name + ' · ' + row.destination.account : 'Original payment method', provider: row })),
    ...additions.map(row => ({ id: 'local-' + row.id, type: row.direction, status: row.state === 'Succeeded' ? row.direction === 'Withdrawal' ? 'Recorded locally' : 'Completed' : row.state === 'Draft' ? 'Ready to review' : 'Cancelled',
      reference: row.reference, date: row.createdAt, amount: row.amountCentavos, fee: row.feeCentavos, note: row.reason, local: row })),
  ].sort((a, b) => Date.parse(b.date) - Date.parse(a.date) || a.id.localeCompare(b.id))
}
const title = (row: FundsActivityRow) => row.type === 'TopUp' ? 'Funds added from school bank' : row.type === 'Refund' ? 'Payment refund' : row.local ? 'Previous local withdrawal' : 'Withdrawal to school bank'
export function FundsActivity({ operations, additions, onSelect }: { operations: MoneyOutRecord[]; additions: PracticeTransfer[]; onSelect: (row: FundsActivityRow) => void }) {
  const [filter, setFilter] = useState('All'), rows = fundsActivity(operations, additions)
  const visible = rows.filter(row => filter === 'All' || row.type === filter)
  function exportCsv() {
    const cell = (value: unknown) => '"' + String(value ?? '').replace(/^[=+@-]/, "'").replaceAll('"', '""') + '"'
    const csv = [['Reference', 'Activity', 'Status', 'Amount PHP', 'Fee PHP', 'Date (Asia/Manila)', 'Source'], ...rows.map(row => [row.reference, title(row), row.status,
      (row.amount / 100).toFixed(2), (row.fee / 100).toFixed(2), new Date(row.date).toLocaleString('en-PH', { timeZone: 'Asia/Manila' }), row.local ? 'Local record' : 'Xendit'])].map(row => row.map(cell).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })), link = document.createElement('a')
    link.href = url; link.download = 'library-funds.csv'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return <section className="payment-surface mt-6 overflow-hidden" aria-label="Funds activity">
    <div className="payment-toolbar"><div><h2 className="mb-3 text-lg font-bold">Funds activity</h2><div role="group" aria-label="Funds activity filter" className="payment-filters">{[['All', 'All activity'], ['Withdrawal', 'Withdrawals'], ['TopUp', 'Additions'], ['Refund', 'Refunds']].map(([value, label]) => <button type="button" key={value} aria-pressed={value === filter} onClick={() => setFilter(value)}>{label}</button>)}</div></div><Button variant="secondary" className="payment-button" disabled={!rows.length} onClick={exportCsv}><Download size={16}/>Export records</Button></div>
    {visible.length ? visible.map(row => <article className="payment-row" key={row.id}><div className="payment-row-main"><span className="payment-service-icon">{row.type === 'Refund' ? <Undo2 size={21}/> : row.type === 'TopUp' ? <ArrowUpFromLine size={21}/> : <ArrowDownToLine size={21}/>}</span><div className="min-w-0"><h3 className="font-bold">{title(row)}</h3><p className="payment-row-meta">{row.reference} · {new Date(row.date).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</p><span className={'payment-chip ' + (['Completed','Refunded'].includes(row.status) ? 'payment-chip-success' : '')}>{row.status}</span></div><strong className="payment-row-amount">{paymentMoney(row.amount)}</strong></div>
      <div className="payment-row-footer"><div><p className="payment-muted break-words text-sm">{row.note}</p>{row.fee > 0 ? <p className="payment-field-note">{row.type === 'Refund' ? 'Includes refunded fee: ' : 'Transfer fee: '}{paymentMoney(row.fee)}</p> : null}{row.local && row.type === 'Withdrawal' ? <p className="payment-field-note">Local record only. No Xendit transfer was sent.</p> : null}</div><Button variant="secondary" className="payment-button" onClick={() => onSelect(row)}>{row.local?.state === 'Draft' && row.type === 'TopUp' ? 'Review addition' : 'View details'}<ArrowRight size={16}/></Button></div></article>)
      : <div className="payment-empty"><Wallet size={28}/><h3 className="text-lg font-semibold">No {filter === 'All' ? 'funds activity' : filter === 'TopUp' ? 'additions' : filter.toLowerCase() + 's'} yet</h3><p className="payment-muted">Your saved reviews and confirmed transfers appear here.</p></div>}
  </section>
}
