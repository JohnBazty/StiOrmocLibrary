import { db } from '../src/config/db.js'
import { renderBookLabel } from '../src/modules/catalog/book-label.renderer.ts'

const APPLY_FLAG = '--apply'
const shouldApply = process.argv.includes(APPLY_FLAG)
const lockName = 'smartlib-existing-book-asset-code-backfill'
const institutionalBarcodePattern = /^STIORMOC\d{10}$/
const year = new Date().getFullYear()

function barcodeFor(sequence) {
  return `STIORMOC${year}${String(sequence).padStart(6, '0')}`
}

async function loadBookCopies(connection, lockRows) {
  const [rows] = await connection.execute(
    `SELECT pc.physical_copy_id, pc.title_id, pc.material_id, pc.accession_number,
            pc.barcode, pc.qr_code_data
       FROM physical_copies pc
       INNER JOIN titles t ON t.title_id = pc.title_id
      WHERE t.record_type = 'Book'
      ORDER BY pc.physical_copy_id${lockRows ? ' FOR UPDATE' : ''}`,
  )
  return rows
}

async function reserveSequences(connection, count) {
  if (count === 0) return null
  await connection.execute(
    `INSERT INTO barcode_sequences (\`sequence_year\`, \`last_value\`)
     VALUES (?, 0)
     ON DUPLICATE KEY UPDATE \`last_value\` = \`last_value\``,
    [year],
  )
  const [rows] = await connection.execute(
    'SELECT `last_value` FROM barcode_sequences WHERE `sequence_year` = ? FOR UPDATE',
    [year],
  )
  const first = Number(rows[0]?.last_value ?? 0) + 1
  const final = first + count - 1
  if (final > 999999) throw new Error(`The ${year} institutional barcode sequence is exhausted.`)
  await connection.execute(
    'UPDATE barcode_sequences SET `last_value` = ?, `updated_at` = NOW() WHERE `sequence_year` = ?',
    [final, year],
  )
  return first
}

async function backfill() {
  const connection = await db.getConnection()
  let namedLockHeld = false
  try {
    const [lockRows] = await connection.execute('SELECT GET_LOCK(?, 15) AS acquired', [lockName])
    namedLockHeld = Number(lockRows[0]?.acquired) === 1
    if (!namedLockHeld) throw new Error('Another asset-code backfill is already running.')

    const previewRows = await loadBookCopies(connection, false)
    const preview = {
      total: previewRows.length,
      needsNewBarcode: previewRows.filter((row) => !institutionalBarcodePattern.test(String(row.barcode))).length,
      needsQrCode: previewRows.filter((row) => !String(row.qr_code_data ?? '').startsWith('data:image/png;base64,')).length,
    }

    if (!shouldApply) {
      console.log(JSON.stringify({ mode: 'dry-run', ...preview }, null, 2))
      console.log(`No data changed. Re-run with ${APPLY_FLAG} to apply the backfill.`)
      return
    }

    await connection.beginTransaction()
    const copies = await loadBookCopies(connection, true)
    const replacements = copies.filter((copy) => !institutionalBarcodePattern.test(String(copy.barcode)))
    let nextSequence = await reserveSequences(connection, replacements.length)
    let replacedBarcodes = 0
    let generatedQrCodes = 0

    for (const copy of copies) {
      const previousBarcode = String(copy.barcode)
      const needsReplacement = !institutionalBarcodePattern.test(previousBarcode)
      const replacementBarcode = needsReplacement ? barcodeFor(nextSequence++) : previousBarcode
      const needsQr = needsReplacement || !String(copy.qr_code_data ?? '').startsWith('data:image/png;base64,')
      if (!needsQr) continue

      const rendered = await renderBookLabel({
        title_id: Number(copy.title_id),
        barcode: replacementBarcode,
        accession_number: String(copy.accession_number),
      })

      if (needsReplacement && copy.material_id != null) {
        await connection.execute(
          'UPDATE materials SET barcode = ? WHERE material_id = ?',
          [replacementBarcode, copy.material_id],
        )
      }
      await connection.execute(
        `UPDATE physical_copies
            SET barcode = ?, qr_code_data = ?, row_version = row_version + 1
          WHERE physical_copy_id = ?`,
        [replacementBarcode, rendered.qrCodeData, copy.physical_copy_id],
      )

      if (needsReplacement) {
        await connection.execute(
          `INSERT INTO physical_copy_asset_code_history
             (physical_copy_id, material_id, title_id, accession_number,
              previous_barcode, replacement_barcode, replaced_at)
           VALUES (?, ?, ?, ?, ?, ?, NOW())`,
          [copy.physical_copy_id, copy.material_id, copy.title_id, copy.accession_number,
            previousBarcode, replacementBarcode],
        )
        replacedBarcodes += 1
      }
      generatedQrCodes += 1
    }

    await connection.commit()
    console.log(JSON.stringify({
      mode: 'applied', total: copies.length, replacedBarcodes, generatedQrCodes,
    }, null, 2))
  } catch (error) {
    try { await connection.rollback() } catch {}
    throw error
  } finally {
    if (namedLockHeld) {
      try { await connection.execute('SELECT RELEASE_LOCK(?)', [lockName]) } catch {}
    }
    connection.release()
    await db.end()
  }
}

backfill().catch((error) => {
  console.error(`[asset-code-backfill] ${error.message}`)
  process.exitCode = 1
})
