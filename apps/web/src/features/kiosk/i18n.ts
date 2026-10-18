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
}

export const STRINGS: Record<Lang, Strings> = {
  en: {
    welcome: 'Welcome to the library',
    tapToBegin: 'Choose what you want to do',
    attendance: 'Attendance',
    borrow: 'Borrow a book',
    search: 'Search the catalog',
    back: 'Back',
  },
  fil: {
    welcome: 'Maligayang pagdating sa aklatan',
    tapToBegin: 'Piliin ang nais mong gawin',
    attendance: 'Attendance',
    borrow: 'Humiram ng aklat',
    search: 'Maghanap sa katalogo',
    back: 'Bumalik',
  },
  ceb: {
    welcome: 'Maayong pag-abot sa library',
    tapToBegin: 'Pilia ang imong buhaton',
    attendance: 'Attendance',
    borrow: 'Paghulam og libro',
    search: 'Pangitaa sa katalogo',
    back: 'Balik',
  },
}
