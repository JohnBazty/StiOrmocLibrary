import { ddcReference, isDdcWithin, isAutomaticDdcSection } from './ddc-sections.ts'

export const LOCAL_DDC_VERSION = ddcReference.version + ':subjects-v2'
export const DDC_REFERENCE = ddcReference.source
export type SubjectRule = {code:string;subject:string;phrases:readonly string[];excludePhrases?:readonly string[]}
// Subject vocabulary is deliberate: reference headings alone cannot identify a book's subject.
export const subjectRules:readonly SubjectRule[] = [
 {code:'004',subject:'Computing',phrases:['computer science','computer networks','agham pangkompyuter']},
 {code:'005',subject:'Programming',phrases:['programming','computer programs','pagpoprograma']},
 {code:'020',subject:'Library science',phrases:['library science','librarianship','agham aklatan']},
 {code:'070',subject:'Journalism',phrases:['journalism','pamamahayag']},
 {code:'100',subject:'Philosophy',phrases:['philosophy','pilosopiya']},
 {code:'150',subject:'Psychology',phrases:['psychology','sikolohiya']},
 {code:'160',subject:'Logic',phrases:['logic','lohika']},
 {code:'170',subject:'Ethics',phrases:['ethics','etika']},
 {code:'200',subject:'Religion',phrases:['religion','relihiyon']},
 {code:'220',subject:'Bible',phrases:['bible','bibliya']},
 {code:'230',subject:'Christianity',phrases:['christianity','kristiyanismo']},
 {code:'297',subject:'Islam',phrases:['islam']},
 {code:'301',subject:'Sociology',phrases:['sociology','sosyolohiya','anthropology','antropolohiya']},
 {code:'320',subject:'Political science',phrases:['political science','agham pampolitika']},
 {code:'330',subject:'Economics',phrases:['economics','ekonomiks','ekonomiya']},
 {code:'340',subject:'Law',phrases:['law','batas']},
 {code:'370',subject:'Education',phrases:['education','edukasyon','pagtuturo']},
 {code:'380',subject:'Commerce and transportation',phrases:['commerce','komersiyo','transportation','transportasyon']},
 {code:'390',subject:'Customs and folklore',phrases:['folklore','alamat','kaugalian']},
 {code:'410',subject:'Linguistics',phrases:['linguistics','lingguwistika']},
 {code:'420',subject:'English language',phrases:['english grammar','balarilang ingles']},
 {code:'499',subject:'Tagalog language',phrases:['tagalog grammar','filipino grammar','balarilang filipino','balarilang tagalog','balarila ng wikang tagalog']},
 {code:'500',subject:'Science',phrases:['general science','pangkalahatang agham']},
 {code:'510',subject:'Mathematics',phrases:['mathematics','matematika']},
 {code:'512',subject:'Algebra',phrases:['algebra','alhebra']},
 {code:'513',subject:'Arithmetic',phrases:['arithmetic','aritmetika']},
 {code:'515',subject:'Mathematical analysis',phrases:['calculus','kalkulo','mathematical analysis']},
 {code:'516',subject:'Geometry',phrases:['geometry','heometriya']},
 {code:'520',subject:'Astronomy',phrases:['astronomy','astronomiya']},
 {code:'530',subject:'Physics',phrases:['physics','pisika']},
 {code:'540',subject:'Chemistry',phrases:['chemistry','kimika']},
 {code:'550',subject:'Earth sciences',phrases:['earth science','earth sciences','geology','heolohiya']},
 {code:'560',subject:'Paleontology',phrases:['paleontology','paleontolohiya']},
 {code:'570',subject:'Biology',phrases:['biology','biyolohiya']},
 {code:'580',subject:'Botany',phrases:['botany','botanika']},
 {code:'590',subject:'Zoology',phrases:['zoology','soolohiya']},
 {code:'610',subject:'Medicine',phrases:['medicine','medisina']},
 {code:'611',subject:'Human anatomy',phrases:['human anatomy','anatomiya ng tao']},
 {code:'612',subject:'Human physiology',phrases:['human physiology','pisyolohiya ng tao']},
 {code:'620',subject:'Engineering',phrases:['engineering','inhinyeriya']},
 {code:'630',subject:'Agriculture',phrases:['agriculture','agrikultura','pagsasaka']},
 {code:'650',subject:'Management',phrases:['business management','pamamahala ng negosyo']},
 {code:'657',subject:'Accounting',phrases:['accounting','accountancy','akawnting']},
 {code:'658',subject:'Business administration',phrases:['business administration']},
 {code:'690',subject:'Building construction',phrases:['building construction','konstruksiyon ng gusali']},
 {code:'720',subject:'Architecture',phrases:['architecture','arkitektura']},
 {code:'750',subject:'Painting',phrases:['painting','pagpipinta']},
 {code:'770',subject:'Photography',phrases:['photography','potograpiya']},
 {code:'780',subject:'Music',phrases:['music','musika']},
 {code:'800',subject:'Literature',phrases:['literature','panitikan'],excludePhrases:['literature review','review of related literature']},
 {code:'910',subject:'Geography',phrases:['geography','heograpiya']},
 {code:'920',subject:'Biography',phrases:['biography','talambuhay']},
 {code:'959',subject:'History of Southeast Asia',phrases:['history of the philippines','philippine history','kasaysayan ng pilipinas']},
]
export function normalizeSubject(value:string) {
 return value.normalize('NFKC').toLocaleLowerCase('en').replace(/[^\p{L}\p{N}]+/gu,' ').trim()
}
const fictionPhrases = ['novel','nobela','poems','poetry','tula','story','stories','kuwento','kwento']
function containsPhrase(fields: readonly string[], phrase: string) {
 const normalized = normalizeSubject(phrase)
 return normalized.length > 0 && fields.some(field => field.includes(' ' + normalized + ' '))
}

function isBroaderDivision(broad: SubjectRule, narrow: SubjectRule) {
 return broad.code !== narrow.code && isDdcWithin(narrow.code,broad.code)
}

export function classifySubject(title:string,description='') {
 const fields = [title,description].map(value => ' ' + normalizeSubject(value) + ' ')
 const matches = subjectRules.filter(rule => isAutomaticDdcSection(rule.code) && rule.phrases.some(phrase => containsPhrase(fields,phrase)))
 const candidates = matches.filter(rule => !matches.some(other => isBroaderDivision(rule,other)))
 const excluded = fictionPhrases.some(phrase => containsPhrase(fields,phrase)) || matches.some(rule => rule.excludePhrases?.some(phrase => containsPhrase(fields,phrase)))
 const evidence = {matches,version:LOCAL_DDC_VERSION,referenceVersion:ddcReference.version,source:DDC_REFERENCE}
 if(excluded || candidates.length !== 1) {
  return {status:'needs_review' as const,code:null,reason:excluded ? 'Review the subject and literary form before assigning a classification.' : candidates.length ? 'Several subjects match. Review the classification.' : 'Add a clear subject or description.',...evidence}
 }
 return {status:'matched' as const,code:candidates[0].code,reason:candidates[0].subject,...evidence}
}
