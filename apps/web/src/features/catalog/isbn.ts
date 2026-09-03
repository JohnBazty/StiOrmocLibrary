export function normalizeIsbnInput(value: string) {
  return value
    .normalize('NFKC')
    .trim()
    .replace(/^ISBN(?:-1[03])?\s*:?\s*/i, '')
    .replace(/[\s\u00A0\-\u2010-\u2015\u2212]+/g, '')
    .toUpperCase()
}

export function isbnInputError(value: string): string | null {
  const isbn = normalizeIsbnInput(value)
  if (!isbn) return null
  if (isbn.length !== 10 && isbn.length !== 13) return 'Enter exactly 10 or 13 ISBN characters.'
  if (isbn.length === 13) {
    if (!/^\d{13}$/.test(isbn)) return 'ISBN-13 must contain digits only.'
    if (!/^97[89]/.test(isbn)) return 'ISBN-13 must begin with 978 or 979.'
    const sum = [...isbn.slice(0, 12)].reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3), 0)
    const expected = String((10 - (sum % 10)) % 10)
    return isbn[12] === expected ? null : `Incorrect check digit. The final digit must be ${expected}.`
  }
  if (!/^\d{9}[\dX]$/.test(isbn)) return 'ISBN-10 must use 9 digits followed by a digit or X.'
  const sum = [...isbn.slice(0, 9)].reduce((total, digit, index) => total + Number(digit) * (10 - index), 0)
  const check = (11 - (sum % 11)) % 11
  const expected = check === 10 ? 'X' : String(check)
  return isbn[9] === expected ? null : `Incorrect check digit. The final character must be ${expected}.`
}
