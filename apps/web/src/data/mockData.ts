export type Book = {
  id: number
  title: string
  author: string
  category: string
  year: number
  isbn: string
  shelf: string
  available: number
  total: number
  status: string
  cover: string
  accent: string
}

export const books: Book[] = [
  { id: 1, title: 'Clean Code', author: 'Robert C. Martin', category: 'Software Engineering', year: 2008, isbn: '978-0132350884', shelf: 'IT-A12', available: 3, total: 5, status: 'available', cover: 'CC', accent: 'from-[#003399] to-[#003399]' },
  { id: 2, title: 'Database System Concepts', author: 'Abraham Silberschatz', category: 'Database', year: 2019, isbn: '978-0078022159', shelf: 'IT-B04', available: 1, total: 4, status: 'available', cover: 'DB', accent: 'from-[#003399] to-[#003399]' },
  { id: 3, title: 'Computer Networks', author: 'Andrew S. Tanenbaum', category: 'Networking', year: 2021, isbn: '978-0136764052', shelf: 'IT-C08', available: 0, total: 3, status: 'borrowed', cover: 'CN', accent: 'from-[#003399] to-[#003399]' },
  { id: 4, title: 'The Design of Everyday Things', author: 'Don Norman', category: 'UI/UX Design', year: 2013, isbn: '978-0465050659', shelf: 'DES-A03', available: 2, total: 2, status: 'available', cover: 'DE', accent: 'from-[#003399] to-[#003399]' },
  { id: 5, title: 'Artificial Intelligence: A Modern Approach', author: 'Stuart Russell and Peter Norvig', category: 'Artificial Intelligence', year: 2020, isbn: '978-0134610993', shelf: 'IT-D11', available: 1, total: 3, status: 'available', cover: 'AI', accent: 'from-[#003399] to-[#003399]' },
  { id: 6, title: 'Introduction to Algorithms', author: 'Thomas H. Cormen', category: 'Programming', year: 2022, isbn: '978-0262046305', shelf: 'IT-A02', available: 0, total: 2, status: 'reserved', cover: 'IA', accent: 'from-[#003399] to-[#003399]' },
]

export const researchPapers = [
  { id: 'TH-0014', title: 'Smart Campus Attendance Monitoring Using QR Technology', authors: 'A. Reyes, M. Torres, and J. Lim', department: 'BS Information Technology', year: 2025, shelf: 'TH-BSIT-2025-014', availability: 'Room use' },
  { id: 'TH-0009', title: 'Cloud-Based Inventory Platform for Small Enterprises', authors: 'K. Villanueva and P. Ramos', department: 'BS Computer Science', year: 2024, shelf: 'TH-BSCS-2024-009', availability: 'Available' },
  { id: 'TH-0021', title: 'Student Service Queue Management with Predictive Analytics', authors: 'D. Gomez, L. Tan, and R. Uy', department: 'BS Information Technology', year: 2025, shelf: 'TH-BSIT-2025-021', availability: 'Available' },
  { id: 'TH-0011', title: 'Mobile Learning Companion for Senior High School Students', authors: 'C. Mercado and J. Flores', department: 'BS Information Technology', year: 2024, shelf: 'TH-BSIT-2024-011', availability: 'Room use' },
]

export const loans = [
  { id: 'BR-1048', user: 'John Bazty Cantay', studentId: '02000241372', book: 'Clean Code', copy: 'BC-00128', borrowed: 'Aug 14, 2026 - 9:20 AM', due: 'Aug 15, 2026 - 8:59 AM', status: 'active' },
  { id: 'BR-1047', user: 'Mika Santos', studentId: '02000241918', book: 'Computer Networks', copy: 'BC-00087', borrowed: 'Aug 13, 2026 - 2:04 PM', due: 'Aug 14, 2026 - 8:59 AM', status: 'overdue' },
  { id: 'BR-1046', user: 'Elizabeth Dumaran', studentId: 'FAC-014', book: 'The Design of Everyday Things', copy: 'BC-00167', borrowed: 'Aug 13, 2026 - 10:10 AM', due: 'Aug 15, 2026 - 8:59 AM', status: 'active' },
  { id: 'BR-1044', user: 'Paolo Rivera', studentId: '02000241762', book: 'Database System Concepts', copy: 'BC-00042', borrowed: 'Aug 11, 2026 - 1:45 PM', due: 'Aug 12, 2026 - 8:59 AM', status: 'returned' },
]

export const reservations = [
  { id: 'RS-3004', user: 'John Bazty Cantay', book: 'Introduction to Algorithms', queue: 2, requested: 'Aug 13, 2026', status: 'queued' },
  { id: 'RS-3003', user: 'Mika Santos', book: 'Database System Concepts', queue: 1, requested: 'Aug 12, 2026', status: 'available' },
  { id: 'RS-3001', user: 'Cara Lim', book: 'Computer Networks', queue: 1, requested: 'Aug 10, 2026', status: 'queued' },
]

export const fines = [
  { id: 'FN-0912', user: 'Mika Santos', studentId: '02000241918', book: 'Computer Networks', amount: '₱24.00', reason: '12 hours overdue', status: 'unpaid' },
  { id: 'FN-0911', user: 'Paolo Rivera', studentId: '02000241762', book: 'Web Development with Node and Express', amount: '₱10.00', reason: '1 day overdue', status: 'paid' },
  { id: 'FN-0909', user: 'Jessa Tan', studentId: '02000241620', book: 'Introduction to Algorithms', amount: '₱30.00', reason: '3 days overdue', status: 'partially_paid' },
]

export const attendance = [
  { id: 1, user: 'John Bazty Cantay', studentId: '02000241372', date: 'Aug 15, 2026', checkIn: '8:12 AM', checkOut: '-', purpose: 'Library visit' },
  { id: 2, user: 'Mika Santos', studentId: '02000241918', date: 'Aug 15, 2026', checkIn: '8:31 AM', checkOut: '9:45 AM', purpose: 'Research' },
  { id: 3, user: 'Elizabeth Dumaran', studentId: 'FAC-014', date: 'Aug 15, 2026', checkIn: '9:04 AM', checkOut: '-', purpose: 'Faculty research' },
  { id: 4, user: 'John Bazty Cantay', studentId: '02000241372', date: 'Aug 12, 2026', checkIn: '1:18 PM', checkOut: '3:02 PM', purpose: 'Printing' },
]

export const printRequests = [
  { id: 'PR-2041', user: 'John Bazty Cantay', file: 'Capstone-Chapter-1.pdf', pages: 18, copies: 1, type: 'Black & white', amount: '₱36.00', status: 'ready_for_pickup', created: 'Aug 15, 2026 - 8:40 AM' },
  { id: 'PR-2040', user: 'Mika Santos', file: 'Network-Lab-Activity.docx', pages: 6, copies: 2, type: 'Color', amount: '₱72.00', status: 'printing', created: 'Aug 15, 2026 - 8:22 AM' },
  { id: 'PR-2039', user: 'Paolo Rivera', file: 'Enrollment-Form.pdf', pages: 2, copies: 1, type: 'Black & white', amount: '₱4.00', status: 'pending', created: 'Aug 15, 2026 - 8:11 AM' },
]

export const inventory = [
  { id: 'BC-00128', book: 'Clean Code', category: 'Software Engineering', condition: 'Good', status: 'borrowed', lastAudit: 'Aug 10, 2026' },
  { id: 'BC-00087', book: 'Computer Networks', category: 'Networking', condition: 'Good', status: 'borrowed', lastAudit: 'Aug 08, 2026' },
  { id: 'BC-00167', book: 'The Design of Everyday Things', category: 'UI/UX Design', condition: 'Good', status: 'available', lastAudit: 'Aug 14, 2026' },
  { id: 'BC-00042', book: 'Database System Concepts', category: 'Database', condition: 'For repair', status: 'unavailable', lastAudit: 'Aug 14, 2026' },
]

export const supplies = [
  { id: 'INK-001', name: 'Epson 003 Black Ink', type: 'Ink', printer: 'Front Desk Epson L3210', level: 72, unit: '%' },
  { id: 'INK-002', name: 'Epson 003 Cyan Ink', type: 'Ink', printer: 'Front Desk Epson L3210', level: 18, unit: '%' },
  { id: 'PAP-001', name: 'A4 Bond Paper', type: 'Paper', printer: 'Shared stock', level: 8, unit: 'reams' },
  { id: 'PAP-002', name: 'Short Bond Paper', type: 'Paper', printer: 'Shared stock', level: 3, unit: 'reams' },
]

export const users = [
  { id: '02000241372', name: 'John Bazty Cantay', email: 'cantay242@gmail.com', role: 'Student', program: 'BSIT-3A', status: 'active', clearance: 'cleared' },
  { id: '02000241918', name: 'Mika Santos', email: 'mika.santos@sti.edu', role: 'Student', program: 'BSCS-2B', status: 'active', clearance: 'blocked' },
  { id: 'FAC-014', name: 'Elizabeth Dumaran', email: 'elizabeth.dumaran@sti.edu', role: 'Faculty', program: 'IT Faculty', status: 'active', clearance: 'cleared' },
  { id: '02000241762', name: 'Paolo Rivera', email: 'paolo.rivera@sti.edu', role: 'Student', program: 'BSIT-2A', status: 'inactive', clearance: 'cleared' },
]

export const notifications = [
  { id: 1, type: 'Due reminder', title: 'Book due tomorrow', message: 'Clean Code is due tomorrow at 8:59 AM.', time: '12 minutes ago', read: false },
  { id: 2, type: 'Printing', title: 'Print request is ready', message: 'PR-2041 is ready for pickup at the library counter.', time: '34 minutes ago', read: false },
  { id: 3, type: 'Reservation', title: 'Reservation queue update', message: 'You are now number 2 for Introduction to Algorithms.', time: 'Yesterday', read: true },
  { id: 4, type: 'System', title: 'Library schedule', message: 'The library will close at 4:00 PM this Saturday.', time: 'Aug 12, 2026', read: true },
]

export const reports = [
  { id: 'REP-01', name: 'Daily Attendance Summary', description: 'Visitor totals, purposes, entry times, and peak hours.', category: 'Attendance', updated: 'Today, 9:30 AM' },
  { id: 'REP-02', name: 'Borrowed and Overdue Books', description: 'Active cycles, due dates, outstanding items, and borrower details.', category: 'Circulation', updated: 'Today, 9:18 AM' },
  { id: 'REP-03', name: 'Inventory Condition Audit', description: 'Copy condition, missing items, shelf status, and audit history.', category: 'Inventory', updated: 'Aug 14, 2026' },
  { id: 'REP-04', name: 'Printing Revenue Summary', description: 'Completed jobs, page volume, payment totals, and service mix.', category: 'Printing', updated: 'Aug 14, 2026' },
  { id: 'REP-05', name: 'Outstanding Library Fines', description: 'Unpaid and partially paid penalties grouped by student.', category: 'Finance', updated: 'Today, 8:59 AM' },
]

export const adminKpis = [
  { label: 'Total books', value: '2,486', note: '+18 this month', tone: 'emerald' },
  { label: 'Active borrowed', value: '184', note: '7.4% of collection', tone: 'blue' },
  { label: 'Available books', value: '2,241', note: '90.1% available', tone: 'teal' },
  { label: 'Overdue books', value: '24', note: '6 need follow-up', tone: 'orange' },
  { label: 'Active users', value: '1,348', note: '+42 this semester', tone: 'violet' },
  { label: 'Daily attendance', value: '216', note: 'Peak at 10:00 AM', tone: 'cyan' },
  { label: 'Reservations', value: '31', note: '9 ready for pickup', tone: 'pink' },
  { label: 'Total penalties', value: '₱2,840', note: '₱1,920 unpaid', tone: 'red' },
]
