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
  },
}
