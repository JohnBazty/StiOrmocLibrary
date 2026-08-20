export const demoUsers = [
  {
    id: 1,
    studentOrEmployeeNo: '02000241372',
    name: 'John Bazty Cantay',
    email: 'cantay242@gmail.com',
    role: 'student',
    course: 'BS Information Technology',
    section: 'BSIT-3A',
    status: 'active',
    avatar: 'JC',
  },
  {
    id: 2,
    studentOrEmployeeNo: 'LIB-001',
    name: 'Judelyn Martinez',
    email: 'library.ormoc@sti.edu',
    role: 'librarian',
    course: 'Library Services',
    section: 'Staff',
    status: 'active',
    avatar: 'JM',
  },
  {
    id: 3,
    studentOrEmployeeNo: '02000241918',
    name: 'Mika Santos',
    email: 'mika.santos@sti.edu',
    role: 'student',
    course: 'BS Computer Science',
    section: 'BSCS-2B',
    status: 'active',
    avatar: 'MS',
  },
  {
    id: 4,
    studentOrEmployeeNo: 'FAC-014',
    name: 'Elizabeth Dumaran',
    email: 'elizabeth.dumaran@sti.edu',
    role: 'faculty',
    course: 'Information Technology',
    section: 'Faculty',
    status: 'active',
    avatar: 'ED',
  },
]

export const books = [
  {
    id: 1,
    title: 'Clean Code',
    author: 'Robert C. Martin',
    category: 'Software Engineering',
    year: 2008,
    isbn: '978-0132350884',
    shelf: 'IT-A12',
    availableCopies: 3,
    totalCopies: 5,
    status: 'available',
    color: 'emerald',
    summary: 'A practical guide to writing readable and maintainable software.',
  },
  {
    id: 2,
    title: 'Database System Concepts',
    author: 'Abraham Silberschatz',
    category: 'Database',
    year: 2019,
    isbn: '978-0078022159',
    shelf: 'IT-B04',
    availableCopies: 1,
    totalCopies: 4,
    status: 'available',
    color: 'blue',
    summary: 'Database foundations, relational design, transactions, and storage.',
  },
  {
    id: 3,
    title: 'Computer Networks',
    author: 'Andrew S. Tanenbaum',
    category: 'Networking',
    year: 2021,
    isbn: '978-0136764052',
    shelf: 'IT-C08',
    availableCopies: 0,
    totalCopies: 3,
    status: 'borrowed',
    color: 'violet',
    summary: 'A layered exploration of modern computer network technologies.',
  },
  {
    id: 4,
    title: 'The Design of Everyday Things',
    author: 'Don Norman',
    category: 'UI/UX Design',
    year: 2013,
    isbn: '978-0465050659',
    shelf: 'DES-A03',
    availableCopies: 2,
    totalCopies: 2,
    status: 'available',
    color: 'amber',
    summary: 'Core principles for usable, understandable, human-centered design.',
  },
  {
    id: 5,
    title: 'Artificial Intelligence: A Modern Approach',
    author: 'Stuart Russell and Peter Norvig',
    category: 'Artificial Intelligence',
    year: 2020,
    isbn: '978-0134610993',
    shelf: 'IT-D11',
    availableCopies: 1,
    totalCopies: 3,
    status: 'available',
    color: 'rose',
    summary: 'A broad introduction to intelligent agents and AI techniques.',
  },
  {
    id: 6,
    title: 'Introduction to Algorithms',
    author: 'Thomas H. Cormen',
    category: 'Programming',
    year: 2022,
    isbn: '978-0262046305',
    shelf: 'IT-A02',
    availableCopies: 0,
    totalCopies: 2,
    status: 'reserved',
    color: 'slate',
    summary: 'Comprehensive coverage of algorithms and data structures.',
  },
]

export const researchPapers = [
  {
    id: 1,
    title: 'Smart Campus Attendance Monitoring Using QR Technology',
    authors: 'A. Reyes, M. Torres, and J. Lim',
    department: 'BS Information Technology',
    year: 2025,
    shelf: 'TH-BSIT-2025-014',
    availability: 'Room use',
  },
  {
    id: 2,
    title: 'Cloud-Based Inventory Platform for Small Enterprises',
    authors: 'K. Villanueva and P. Ramos',
    department: 'BS Computer Science',
    year: 2024,
    shelf: 'TH-BSCS-2024-009',
    availability: 'Available',
  },
  {
    id: 3,
    title: 'Student Service Queue Management with Predictive Analytics',
    authors: 'D. Gomez, L. Tan, and R. Uy',
    department: 'BS Information Technology',
    year: 2025,
    shelf: 'TH-BSIT-2025-021',
    availability: 'Available',
  },
]

export const borrowTransactions = [
  {
    id: 'BR-1048',
    user: 'John Bazty Cantay',
    userId: '02000241372',
    book: 'Clean Code',
    copy: 'BC-00128',
    borrowedAt: 'Aug 14, 2026 - 9:20 AM',
    dueAt: 'Aug 15, 2026 - 8:59 AM',
    status: 'active',
  },
  {
    id: 'BR-1047',
    user: 'Mika Santos',
    userId: '02000241918',
    book: 'Computer Networks',
    copy: 'BC-00087',
    borrowedAt: 'Aug 13, 2026 - 2:04 PM',
    dueAt: 'Aug 14, 2026 - 8:59 AM',
    status: 'overdue',
  },
  {
    id: 'BR-1046',
    user: 'Elizabeth Dumaran',
    userId: 'FAC-014',
    book: 'The Design of Everyday Things',
    copy: 'BC-00167',
    borrowedAt: 'Aug 13, 2026 - 10:10 AM',
    dueAt: 'Aug 15, 2026 - 8:59 AM',
    status: 'active',
  },
]

export const reservations = [
  {
    id: 'RS-3004',
    user: 'John Bazty Cantay',
    book: 'Introduction to Algorithms',
    queue: 2,
    requestedAt: 'Aug 13, 2026',
    status: 'queued',
  },
  {
    id: 'RS-3003',
    user: 'Mika Santos',
    book: 'Database System Concepts',
    queue: 1,
    requestedAt: 'Aug 12, 2026',
    status: 'available',
  },
]

export const fines = [
  {
    id: 'FN-0912',
    user: 'Mika Santos',
    studentId: '02000241918',
    book: 'Computer Networks',
    amount: 24,
    reason: '12 hours overdue',
    status: 'unpaid',
  },
  {
    id: 'FN-0911',
    user: 'Paolo Rivera',
    studentId: '02000241762',
    book: 'Web Development with Node and Express',
    amount: 10,
    reason: '1 day overdue',
    status: 'paid',
  },
]

export const attendance = [
  { id: 1, user: 'John Bazty Cantay', userId: '02000241372', date: 'Aug 15, 2026', checkIn: '8:12 AM', checkOut: '-', purpose: 'Library visit' },
  { id: 2, user: 'Mika Santos', userId: '02000241918', date: 'Aug 15, 2026', checkIn: '8:31 AM', checkOut: '9:45 AM', purpose: 'Research' },
  { id: 3, user: 'Elizabeth Dumaran', userId: 'FAC-014', date: 'Aug 15, 2026', checkIn: '9:04 AM', checkOut: '-', purpose: 'Faculty research' },
  { id: 4, user: 'John Bazty Cantay', userId: '02000241372', date: 'Aug 12, 2026', checkIn: '1:18 PM', checkOut: '3:02 PM', purpose: 'Printing' },
]

export const printRequests = [
  { id: 'PR-2041', user: 'John Bazty Cantay', file: 'Capstone-Chapter-1.pdf', pages: 18, copies: 1, type: 'Black & white', amount: 36, status: 'ready_for_pickup', createdAt: 'Aug 15, 2026 - 8:40 AM' },
  { id: 'PR-2040', user: 'Mika Santos', file: 'Network-Lab-Activity.docx', pages: 6, copies: 2, type: 'Color', amount: 72, status: 'printing', createdAt: 'Aug 15, 2026 - 8:22 AM' },
  { id: 'PR-2039', user: 'Paolo Rivera', file: 'Enrollment-Form.pdf', pages: 2, copies: 1, type: 'Black & white', amount: 4, status: 'pending', createdAt: 'Aug 15, 2026 - 8:11 AM' },
]

export const inventory = [
  { id: 'BC-00128', book: 'Clean Code', category: 'Software Engineering', condition: 'Good', status: 'borrowed', lastAudit: 'Aug 10, 2026' },
  { id: 'BC-00087', book: 'Computer Networks', category: 'Networking', condition: 'Good', status: 'borrowed', lastAudit: 'Aug 08, 2026' },
  { id: 'BC-00167', book: 'The Design of Everyday Things', category: 'UI/UX Design', condition: 'Good', status: 'available', lastAudit: 'Aug 14, 2026' },
  { id: 'BC-00042', book: 'Database System Concepts', category: 'Database', condition: 'For repair', status: 'unavailable', lastAudit: 'Aug 14, 2026' },
]

export const supplies = [
  { id: 'INK-001', item: 'Epson 003 Black Ink', type: 'Ink', printer: 'Front Desk Epson L3210', level: 72, unit: '%' },
  { id: 'INK-002', item: 'Epson 003 Cyan Ink', type: 'Ink', printer: 'Front Desk Epson L3210', level: 18, unit: '%' },
  { id: 'PAP-001', item: 'A4 Bond Paper', type: 'Paper', printer: 'Shared stock', level: 8, unit: 'reams' },
  { id: 'PAP-002', item: 'Short Bond Paper', type: 'Paper', printer: 'Shared stock', level: 3, unit: 'reams' },
]

export const notifications = [
  { id: 1, type: 'due', title: 'Book due tomorrow', message: 'Clean Code is due tomorrow at 8:59 AM.', time: '12 minutes ago', read: false },
  { id: 2, type: 'print', title: 'Print request is ready', message: 'PR-2041 is ready for pickup at the library counter.', time: '34 minutes ago', read: false },
  { id: 3, type: 'reservation', title: 'Reservation queue update', message: 'You are now number 2 for Introduction to Algorithms.', time: 'Yesterday', read: true },
]

export const reports = [
  { id: 'REP-01', name: 'Daily Attendance Summary', category: 'Attendance', updated: 'Today, 9:30 AM', format: 'CSV / PDF' },
  { id: 'REP-02', name: 'Borrowed and Overdue Books', category: 'Circulation', updated: 'Today, 9:18 AM', format: 'CSV / PDF' },
  { id: 'REP-03', name: 'Inventory Condition Audit', category: 'Inventory', updated: 'Aug 14, 2026', format: 'CSV / PDF' },
  { id: 'REP-04', name: 'Printing Revenue Summary', category: 'Printing', updated: 'Aug 14, 2026', format: 'CSV / PDF' },
  { id: 'REP-05', name: 'Outstanding Library Fines', category: 'Finance', updated: 'Today, 8:59 AM', format: 'CSV / PDF' },
]

export const studentDashboard = {
  greeting: 'Good morning, John!',
  activeLoans: 1,
  reservations: 1,
  unreadNotifications: 2,
  outstandingBalance: 0,
  clearance: 'cleared',
  occupancy: 42,
  capacity: 80,
  currentLoan: borrowTransactions[0],
  printRequest: printRequests[0],
  recommendations: books.slice(1, 4),
}

export const adminDashboard = {
  kpis: [
    { label: 'Total books', value: '2,486', change: '+18 this month', tone: 'green' },
    { label: 'Active borrowed', value: '184', change: '7.4% of collection', tone: 'blue' },
    { label: 'Available books', value: '2,241', change: '90.1% available', tone: 'teal' },
    { label: 'Overdue books', value: '24', change: '6 need follow-up', tone: 'orange' },
    { label: 'Active users', value: '1,348', change: '+42 this semester', tone: 'violet' },
    { label: 'Daily attendance', value: '216', change: 'Peak at 10:00 AM', tone: 'cyan' },
    { label: 'Reservations', value: '31', change: '9 ready for pickup', tone: 'pink' },
    { label: 'Total penalties', value: '₱2,840', change: '₱1,920 unpaid', tone: 'red' },
  ],
  weeklyAttendance: [92, 138, 154, 141, 186, 216],
  popularCategories: [
    { label: 'Programming', value: 84 },
    { label: 'Database', value: 68 },
    { label: 'Networking', value: 56 },
    { label: 'UI/UX Design', value: 44 },
  ],
  recentActivity: [
    { label: 'Clean Code borrowed by John Cantay', time: '4 minutes ago', type: 'borrow' },
    { label: 'Print request PR-2041 marked ready', time: '12 minutes ago', type: 'print' },
    { label: 'New student account activated', time: '26 minutes ago', type: 'user' },
    { label: 'BC-00042 marked for repair', time: '41 minutes ago', type: 'inventory' },
  ],
}

export const clearance = {
  status: 'cleared',
  activeLoans: 0,
  unpaidFines: 0,
  lastChecked: 'Aug 15, 2026 - 9:32 AM',
  message: 'You have no outstanding library obligations.',
}
