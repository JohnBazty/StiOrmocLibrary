export type Lang = 'en' | 'fil' | 'ceb'

export const LANGUAGES: { code: Lang; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'fil', label: 'Filipino' },
  { code: 'ceb', label: 'Cebuano' },
]

type Strings = {
  welcome: string
  tapToBegin: string
  attendance: string
  borrow: string
  search: string
  back: string
  signInTitle: string
  signInHint: string
  schoolId: string
  password: string
  signIn: string
  serviceUnavailable: string
  endSession: string
  scanQr: string
  confirmEntry: string
  confirmExit: string
  processing: string
  done: string
  tryAgain: string
  scanBook: string
  confirmBorrow: string
  borrowed: string
  due: string
  cannotBorrow: string
  manualEntry: string
  enter: string
  cameraUnavailable: string
}

export const STRINGS: Record<Lang, Strings> = {
  en: {
    welcome: 'Welcome to the library',
    tapToBegin: 'Choose what you want to do',
    attendance: 'Attendance',
    borrow: 'Borrow a book',
    search: 'Search the catalog',
    back: 'Back',
    signInTitle: 'Kiosk sign-in',
    signInHint: 'A librarian signs this kiosk in once.',
    schoolId: 'Staff ID',
    password: 'Password',
    signIn: 'Sign in',
    serviceUnavailable: 'The library service is unavailable. Please see a librarian.',
    endSession: 'End kiosk session',
    scanQr: 'Scan your library QR',
    confirmEntry: 'Confirm check-in',
    confirmExit: 'Confirm check-out',
    processing: 'Please wait…',
    done: 'Done',
    tryAgain: 'Try again',
    scanBook: 'Scan the book barcode',
    confirmBorrow: 'Confirm borrow',
    borrowed: 'Borrowed',
    due: 'Due',
    cannotBorrow: 'Cannot borrow this book',
    manualEntry: 'Enter code manually',
    enter: 'Enter',
    cameraUnavailable: 'Camera unavailable. Type the code or see a librarian.',
  },
  fil: {
    welcome: 'Maligayang pagdating sa aklatan',
    tapToBegin: 'Piliin ang nais mong gawin',
    attendance: 'Attendance',
    borrow: 'Humiram ng aklat',
    search: 'Maghanap sa katalogo',
    back: 'Bumalik',
    signInTitle: 'Kiosk sign-in',
    signInHint: 'Isang beses na pinapasok ng librarian ang kiosk na ito.',
    schoolId: 'Staff ID',
    password: 'Password',
    signIn: 'Mag-sign in',
    serviceUnavailable: 'Hindi magamit ang serbisyo ng aklatan. Lumapit sa librarian.',
    endSession: 'Tapusin ang kiosk session',
    scanQr: 'I-scan ang iyong library QR',
    confirmEntry: 'Kumpirmahin ang check-in',
    confirmExit: 'Kumpirmahin ang check-out',
    processing: 'Mangyaring maghintay…',
    done: 'Tapos',
    tryAgain: 'Subukan muli',
    scanBook: 'I-scan ang barcode ng aklat',
    confirmBorrow: 'Kumpirmahin ang paghiram',
    borrowed: 'Nahiram',
    due: 'Dapat ibalik',
    cannotBorrow: 'Hindi mahiram ang aklat na ito',
    manualEntry: 'I-type ang code',
    enter: 'Ipasok',
    cameraUnavailable: 'Hindi magamit ang camera. I-type ang code o lumapit sa librarian.',
  },
  ceb: {
    welcome: 'Maayong pag-abot sa library',
    tapToBegin: 'Pilia ang imong buhaton',
    attendance: 'Attendance',
    borrow: 'Paghulam og libro',
    search: 'Pangitaa sa katalogo',
    back: 'Balik',
    signInTitle: 'Kiosk sign-in',
    signInHint: 'Kas-a ra i-sign in sa librarian kini nga kiosk.',
    schoolId: 'Staff ID',
    password: 'Password',
    signIn: 'Mo-sign in',
    serviceUnavailable: 'Dili magamit ang serbisyo sa library. Palihog adto sa librarian.',
    endSession: 'Tapuson ang kiosk session',
    scanQr: 'I-scan ang imong library QR',
    confirmEntry: 'Kumpirmaha ang check-in',
    confirmExit: 'Kumpirmaha ang check-out',
    processing: 'Palihog paghulat…',
    done: 'Human',
    tryAgain: 'Sulayi pag-usab',
    scanBook: 'I-scan ang barcode sa libro',
    confirmBorrow: 'Kumpirmaha ang paghulam',
    borrowed: 'Nahulaman',
    due: 'Ibalik sa',
    cannotBorrow: 'Dili mahulaman kini nga libro',
    manualEntry: 'I-type ang code',
    enter: 'Isulod',
    cameraUnavailable: 'Dili magamit ang camera. I-type ang code o adto sa librarian.',
  },
}
