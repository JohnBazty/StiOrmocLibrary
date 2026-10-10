import type { Response } from 'express'
import { db } from '../../config/db.js'
import { createBrandedTablePdf } from '../reports/branded-table-pdf.ts'
import { createIntegrityProtectedCsvStream } from '../reports/csv-integrity.ts'
import { listDiscrepancies, getStocktakeSession } from './stocktake.repository.ts'
import { stocktakeSessionDetail } from './stocktake.service.ts'

type ExportFilters = {
  page: number
  limit: number
  query: string | null
  status: string | null
  findingCode: string | null
  assetKind: string | null
}

function escapeCsv(value: unknown) {
  const text = value == null ? '' : String(value)
  const escaped = /^[=+\-@]/.test(text) ? `'${text}` : text
  return `"${escaped.replace(/"/g, '""')}"`
}

async function* discrepancyRows(sessionId: number, filters: ExportFilters) {
  const pageSize = 200
  let page = 1
  for (;;) {
    const result = await listDiscrepancies(db, sessionId, {
      ...filters,
      page,
      limit: pageSize,
    })
    for (const item of result.items) yield item
    if (page >= result.pagination.total_pages) break
    page += 1
  }
}

export async function exportStocktakeDiscrepanciesCsv(
  sessionId: number,
  filters: ExportFilters,
  response: Response,
) {
  const session = await stocktakeSessionDetail(sessionId)
  const headers = [
    'session_id', 'session_name', 'scope', 'status', 'finding_code', 'finding_status',
    'asset_kind', 'barcode', 'accession_number', 'title', 'home_shelf', 'created_at',
  ]
  async function* content() {
    yield `${headers.join(',')}\r\n`
    for await (const row of discrepancyRows(sessionId, filters)) {
      yield [
        session.stocktake_session_id,
        session.session_name,
        `${session.scope_kind}:${session.scope_label}`,
        session.status,
        row.finding_code,
        row.status,
        row.asset_kind ?? '',
        row.barcode ?? '',
        row.accession_number ?? '',
        row.title ?? '',
        row.home_shelf_label ?? '',
        row.created_at ?? '',
      ].map(escapeCsv).join(',') + '\r\n'
    }
  }
  response.set({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="stocktake-${sessionId}-discrepancies.csv"`,
    'Cache-Control': 'private, no-store',
    'X-SmartLib-CSV-Integrity': 'HMAC-SHA256; version=v1',
  })
  createIntegrityProtectedCsvStream(content(), 'stocktake_discrepancies', headers.length).pipe(response)
}

export async function exportStocktakeDiscrepanciesPdf(
  sessionId: number,
  filters: ExportFilters,
  response: Response,
) {
  const session = await getStocktakeSession(db, sessionId)
  if (!session) {
    await stocktakeSessionDetail(sessionId)
  }
  response.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="stocktake-${sessionId}-discrepancies.pdf"`,
    'Cache-Control': 'private, no-store',
  })
  const document = createBrandedTablePdf(discrepancyRows(sessionId, filters), {
    title: 'STOCKTAKE DISCREPANCY REPORT',
    subtitle: `Session ${sessionId} · ${session?.session_name ?? ''} · ${session?.scope_label ?? ''}`,
    emptyMessage: 'No discrepancies matched the selected filters.',
    columns: [
      { key: 'finding_code', label: 'Finding', width: 90 },
      { key: 'status', label: 'Status', width: 70 },
      { key: 'asset_kind', label: 'Kind', width: 60 },
      { key: 'barcode', label: 'Barcode', width: 110 },
      { key: 'accession_number', label: 'Accession', width: 110 },
      { key: 'title', label: 'Title', width: 220 },
      { key: 'home_shelf_label', label: 'Home shelf', width: 100 },
    ],
  })
  document.pipe(response)
}
