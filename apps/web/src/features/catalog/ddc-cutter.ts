export type CutterHeadingType = 'author' | 'title' | 'organization'

export type GeneratedDdcCutter = {
  ddcCode: string
  subject: string
  cutter: string
  callNumber: string
  heading: string
  headingType: CutterHeadingType
  source: 'entered' | 'subject_rule' | 'category_rule'
}

const SPECIFIC_DDC_LABELS: Record<string, string> = {
  '001': 'Knowledge',
  '001.4': 'Research & research methods',
  '003': 'Systems analysis & design',
  '004': 'Computer science & data processing',
  '004.03': 'Computer science dictionaries & encyclopedias',
  '004.16': 'Personal computers & laptops',
  '004.2': 'Computer architecture & organization',
  '004.56': 'External storage & hard disks',
  '004.6': 'Computer networks & data communications',
  '004.62': 'Interfacing & communications protocols',
  '004.678': 'Internet & World Wide Web',
  '004.68': 'Local area networks (LAN)',
  '005': 'Computer programming, programs & data',
  '005.1': 'Software engineering & programming principles',
  '005.133': 'Specific programming languages',
  '005.136': 'Assembly languages',
  '005.3': 'Computer programs & software packages',
  '005.43': 'Operating systems',
  '005.437': 'User interface design',
  '005.446': 'Personal computer operating systems',
  '005.453': 'Compilers',
  '005.52': 'Word processing',
  '005.54': 'Electronic spreadsheets',
  '005.58': 'Presentation software',
  '005.73': 'Data structures & algorithms',
  '005.74': 'Database management & SQL',
  '005.8': 'Computer & information security',
  '006.3': 'Artificial intelligence',
  '006.6': 'Computer graphics',
  '006.68': 'Computer-aided design (CAD)',
  '006.7': 'Multimedia systems',
  '006.76': 'Web programming & development',
  '020': 'Library & information sciences',
  '025.431': 'Dewey Decimal Classification',
  '025.5': 'Library reference & information services',
  '028.7': 'Use of books & media literacy',
  '031': 'General encyclopedias & almanacs',
  '050': 'General serial publications',
  '070.4': 'Journalism',
  '100': 'Philosophy & psychology',
  '128': 'Philosophy of humankind',
  '150': 'Psychology',
  '150.287': 'Psychological testing & assessment',
  '152.4': 'Emotions & feelings',
  '153.6': 'Interpersonal communication',
  '153.93': 'Intelligence tests',
  '155': 'Differential & developmental psychology',
  '155.2': 'Individual psychology & personality development',
  '155.4': 'Child psychology',
  '155.6': 'Psychology of adults & aging',
  '155.8': 'Ethnopsychology & cultural psychology',
  '160': 'Philosophical logic & critical thinking',
  '170': 'Ethics (Moral philosophy)',
  '190': 'Modern Western philosophy',
  '200': 'Religion',
  '300': 'Social sciences',
  '300.1': 'Social philosophy & theory',
  '301': 'Sociology & anthropology',
  '301.09599': 'Sociology in the Philippines',
  '302': 'Social interaction & social psychology',
  '302.2': 'Human communication',
  '302.23': 'Mass media & communication',
  '303.372': 'Social values & customs',
  '305': 'Groups of people & social inequality',
  '306': 'Culture & institutions',
  '306.43': 'Sociology of education',
  '307': 'Communities',
  '320': 'Political science',
  '320.3': 'Comparative government & politics',
  '327': 'International relations & world politics',
  '330': 'Economics',
  '331': 'Labor economics',
  '331.2592': 'Apprenticeship & practicum training',
  '332.1': 'Banks & banking risk',
  '332.6': 'Investment & financial markets',
  '333.31': 'Agrarian reform & land economics',
  '336.2': 'Taxes & taxation',
  '338.4791': 'Tourism & hospitality economics',
  '338.5': 'Microeconomics & managerial economics',
  '338.9': 'Economic development & growth',
  '339': 'Macroeconomics',
  '342.599': 'Constitutional law of the Philippines',
  '343.078': 'Hospitality, restaurant & travel law',
  '343.099': 'Mass media law',
  '343.599078': 'Philippine tourism laws',
  '346.599': 'Civil law of the Philippines',
  '351.076': 'Civil service examinations & review',
  '355.009': 'Military history',
  '361.3': 'Social work & civic welfare service (NSTP)',
  '362.29': 'Substance abuse & dangerous drugs',
  '363.192': 'Food safety & sanitation',
  '363.7': 'Environmental problems & issues',
  '363.96': 'Family planning',
  '370': 'Education',
  '370.1': 'Philosophy & theory of education',
  '370.114': 'Moral & values education',
  '370.117': 'Multicultural & bilingual education',
  '370.15': 'Educational psychology',
  '371.26': 'Educational tests & classroom assessment',
  '371.3': 'Methods of instruction & teaching strategies',
  '371.30281': 'Reading & study skills',
  '371.33': 'Educational technology',
  '371.4': 'Student guidance & counseling',
  '372': 'Primary & elementary education',
  '375': 'Curricula & curriculum development',
  '378': 'Higher education',
  '382.6': 'Export trade',
  '391': 'Costume, fashion & personal appearance',
  '394.2068': 'Event management',
  '394.26': 'Holidays & celebrations',
  '395.09599': 'Philippine customs & etiquette',
  '398.6': 'Riddles (Mga bugtong)',
  '398.9': 'Proverbs (Mga salawikain at kasabihan)',
  '410': 'Linguistics',
  '421.52': 'English pronunciation & spelling',
  '423': 'English dictionaries',
  '425': 'English grammar',
  '428': 'Standard English usage (Applied linguistics)',
  '428.24': 'English for business & non-native speakers',
  '428.4': 'English reading & literacy',
  '495.1': 'Mandarin Chinese language',
  '499.211': 'Filipino / Tagalog language & communication',
  '499.2113': 'Filipino-English dictionaries',
  '500': 'Natural sciences & physical science',
  '507.1': 'Science education & teaching',
  '510': 'Mathematics',
  '511': 'Discrete mathematics & general principles',
  '511.3': 'Symbolic & mathematical logic',
  '512': 'Algebra',
  '515': 'Analysis (Calculus)',
  '516': 'Geometry & solid mensuration',
  '516.24': 'Trigonometry',
  '516.3': 'Analytic geometry',
  '519.2': 'Probabilities',
  '519.5': 'Statistical mathematics (Statistics)',
  '530': 'Physics',
  '532': 'Fluid mechanics & dynamics',
  '536.2': 'Heat transfer',
  '540': 'Chemistry',
  '547': 'Organic chemistry',
  '550': 'Earth sciences & geology',
  '570': 'Biology & life sciences',
  '576.8': 'Evolution',
  '577': 'Ecology & environmental science',
  '578.77': 'Marine biology',
  '599.9': 'Physical anthropology',
  '604.2': 'Technical drawing & drafting',
  '611': 'Human anatomy',
  '612': 'Human physiology',
  '613': 'Personal health & safety',
  '613.2': 'Dietetics, food & nutrition',
  '613.25': 'Weight loss & diet programs',
  '616.89': 'Abnormal psychology & mental disorders',
  '620.1': 'Engineering mechanics',
  '620.112': 'Mechanics & strength of materials',
  '621.3': 'Electrical & electromagnetic engineering',
  '621.381': 'Electronics',
  '621.3815': 'Electronic circuits & devices',
  '621.382': 'Communications engineering & telecommunications',
  '621.38456': 'Smartphones & mobile devices',
  '621.3916': 'Microcomputers troubleshooting & repair',
  '621.395': 'Digital logic & computer circuit design',
  '621.4021': 'Thermodynamics',
  '629.8': 'Automatic control engineering',
  '629.892': 'Robotics',
  '635': 'Garden crops (Horticulture)',
  '641.03': 'Culinary arts dictionaries & encyclopedias',
  '641.22': 'Wine & oenology',
  '641.252': 'Whisky & distilled spirits',
  '641.3': 'Food & foodstuffs',
  '641.4': 'Food preservation & storage',
  '641.5': 'Cooking & culinary arts',
  '641.555': 'Quick & time-saving cooking',
  '641.563': 'Cooking for health & special diets',
  '641.5636': 'Vegetarian cooking',
  '641.56383': 'Low-carbohydrate cooking',
  '641.56384': 'Low-fat cooking',
  '641.5784': 'Outdoor grilling & barbecue',
  '641.58': 'Cooking with specific appliances',
  '641.5882': 'Microwave cooking',
  '641.59': 'International & regional cooking',
  '641.59599': 'Philippine cooking & cuisine',
  '641.6': 'Cooking specific materials (meats, vegetables, herbs)',
  '641.813': 'Soups',
  '641.814': 'Appetizers, finger foods & sauces',
  '641.815': 'Breads & professional baking',
  '641.822': 'Pasta dishes',
  '641.83': 'Salads',
  '641.86': 'Desserts & sweet confections',
  '641.874': 'Cocktails & alcoholic beverages',
  '641.875': 'Juices, smoothies & non-alcoholic beverages',
  '642': 'Meals & table service management',
  '647.94': 'Hotels, resorts & lodging management',
  '647.94068': 'Hospitality human resource management',
  '647.940688': 'Hospitality & tourism marketing',
  '647.95': 'Food, beverage & restaurant operations',
  '648': 'Housekeeping operations',
  '649.1': 'Child rearing & parenting',
  '650.01513': 'Business mathematics',
  '650.072': 'Business research methods',
  '650.1': 'Personal success in business',
  '650.14': 'Job hunting, interviews & resumes',
  '651': 'Office services & management',
  '651.75': 'Business correspondence & letters',
  '652.3': 'Typewriting & keyboarding',
  '653.4': 'Shorthand',
  '657': 'Accounting',
  '657.42': 'Cost accounting',
  '657.45': 'Auditing',
  '657.8': 'Accounting for specific enterprises',
  '658': 'General management & business organization',
  '658.11': 'Entrepreneurship & starting a business',
  '658.15': 'Financial management & business finance',
  '658.3': 'Human resource management & organizational behavior',
  '658.4012': 'Strategic management & planning',
  '658.4013': 'Total quality management (TQM)',
  '658.4034': 'Operations research & quantitative techniques',
  '658.4038': 'Information management & ERP systems',
  '658.4092': 'Executive leadership',
  '658.45': 'Business communication & presentations',
  '658.5': 'Production & operations management',
  '658.7': 'Materials & supply chain management',
  '658.8': 'Marketing management',
  '658.83': 'Marketing research',
  '658.84': 'International marketing',
  '658.85': 'Personal selling & salesmanship',
  '658.872': 'E-commerce, online & social marketing',
  '659.1': 'Advertising',
  '659.2': 'Public relations & corporate image',
  '660.284': 'Chemical engineering unit operations',
  '686.225': 'Desktop publishing',
  '700': 'The Arts & humanities',
  '701': 'Philosophy & theory of fine arts (Art appreciation)',
  '709': 'History of art',
  '793.2': 'Parties & entertainment',
  '796.07': 'Physical education & sports coaching',
  '796.334': 'Soccer (Football)',
  '796.44': 'Gymnastics',
  '797.21': 'Swimming & water safety',
  '800': 'Literature & rhetoric',
  '808.02': 'Authorship & creative nonfiction',
  '808.042': 'Rhetoric & composition in English',
  '808.0666': 'Technical writing',
  '808.06665': 'Business writing',
  '808.51': 'Public speaking & speech communication',
  '808.8': 'Collections of literature',
  '820.99599': 'Philippine literature in English',
  '822.33': 'William Shakespeare',
  '863': 'Philippine Hispanic fiction (Rizal novels)',
  '899.211': 'Philippine literature (Panitikang Pilipino)',
  '900': 'History & geography',
  '909': 'World history',
  '910': 'Geography & travel',
  '910.2': 'Tour guiding & travel operations',
  '914': 'Geography & travel in Europe',
  '915': 'Geography & travel in Asia',
  '915.99': 'Geography & travel in the Philippines',
  '916': 'Geography & travel in Africa',
  '917': 'Geography & travel in North America',
  '919': 'Geography & travel in Oceania & Pacific',
  '959.9': 'Philippine history',
  '959.9092': 'Philippine biography & Jose Rizal studies',
}

const DIVISION_FALLBACKS: Record<string, string> = {
  '00': 'Computer science, information & general works',
  '01': 'Bibliographies',
  '02': 'Library & information sciences',
  '03': 'Encyclopedias & books of facts',
  '05': 'Magazines, journals & serials',
  '06': 'Associations, organizations & museums',
  '07': 'News media, journalism & publishing',
  '08': 'Quotations',
  '09': 'Manuscripts & rare books',
  '10': 'Philosophy',
  '11': 'Metaphysics',
  '12': 'Epistemology',
  '13': 'Parapsychology & occultism',
  '14': 'Philosophical schools of thought',
  '15': 'Psychology',
  '16': 'Logic',
  '17': 'Ethics',
  '18': 'Ancient, medieval & eastern philosophy',
  '19': 'Modern western philosophy',
  '20': 'Religion',
  '21': 'Philosophy & theory of religion',
  '22': 'The Bible',
  '23': 'Christianity',
  '24': 'Christian practice & observance',
  '25': 'Christian pastoral practice',
  '26': 'Christian organization & social work',
  '27': 'History of Christianity',
  '28': 'Christian denominations',
  '29': 'Other religions',
  '30': 'Social sciences, sociology & anthropology',
  '31': 'Statistics',
  '32': 'Political science',
  '33': 'Economics',
  '34': 'Law',
  '35': 'Public administration & military science',
  '36': 'Social problems & social services',
  '37': 'Education',
  '38': 'Commerce, communications & transportation',
  '39': 'Customs, etiquette & folklore',
  '40': 'Language',
  '41': 'Linguistics',
  '42': 'English & Old English languages',
  '43': 'German & related languages',
  '44': 'French & related languages',
  '45': 'Italian, Romanian & related languages',
  '46': 'Spanish & Portuguese languages',
  '47': 'Latin & Italic languages',
  '48': 'Classical & modern Greek',
  '49': 'Other languages (Filipino / Asian languages)',
  '50': 'Science',
  '51': 'Mathematics',
  '52': 'Astronomy',
  '53': 'Physics',
  '54': 'Chemistry',
  '55': 'Earth sciences & geology',
  '56': 'Fossils & prehistoric life',
  '57': 'Life sciences & biology',
  '58': 'Plants (Botany)',
  '59': 'Animals (Zoology)',
  '60': 'Technology',
  '61': 'Medicine & health',
  '62': 'Engineering',
  '63': 'Agriculture',
  '64': 'Home, hospitality & culinary arts',
  '65': 'Management & public relations',
  '66': 'Chemical engineering',
  '67': 'Manufacturing',
  '68': 'Manufacture for specific uses',
  '69': 'Construction of buildings',
  '70': 'Arts',
  '71': 'Area planning & landscape architecture',
  '72': 'Architecture',
  '73': 'Sculpture, ceramics & metalwork',
  '74': 'Graphic arts & decorative arts',
  '75': 'Painting',
  '76': 'Printmaking & prints',
  '77': 'Photography & computer art',
  '78': 'Music',
  '79': 'Sports, games & entertainment',
  '80': 'Literature, rhetoric & criticism',
  '81': 'American literature in English',
  '82': 'English & Old English literatures',
  '83': 'German & related literatures',
  '84': 'French & related literatures',
  '85': 'Italian, Romanian & related literatures',
  '86': 'Spanish & Portuguese literatures',
  '87': 'Latin & Italic literatures',
  '88': 'Classical & modern Greek literatures',
  '89': 'Other literatures (Philippine literature)',
  '90': 'History',
  '91': 'Geography & travel',
  '92': 'Biography & genealogy',
  '93': 'History of ancient world',
  '94': 'History of Europe',
  '95': 'History of Asia (Philippines)',
  '96': 'History of Africa',
  '97': 'History of North America',
  '98': 'History of South America',
  '99': 'History of other areas',
}

export function describeDdcCode(rawCode: string): string {
  const code = String(rawCode ?? '').trim()
  if (!code) return 'Unassigned'
  if (SPECIFIC_DDC_LABELS[code]) return SPECIFIC_DDC_LABELS[code]
  const base3 = code.slice(0, 3)
  if (SPECIFIC_DDC_LABELS[base3]) return SPECIFIC_DDC_LABELS[base3]
  const div2 = code.slice(0, 2)
  if (DIVISION_FALLBACKS[div2]) return DIVISION_FALLBACKS[div2]
  return 'General classification'
}

const TITLE_SUBJECT_RULES: Array<[RegExp, string]> = [
  // IT & Computer Science
  [/\b(lotus 1[- ]2[- ]3|quattro pro|excel|spreadsheet)\b/i, '005.54'],
  [/\b(word for windows|wordperfect|wordstar|word processing|word 2000|\bword\b)\b/i, '005.52'],
  [/\b(powerpoint)\b/i, '005.58'],
  [/\b(pagemaker|first publisher|desktop publishing)\b/i, '686.225'],
  [/\b(autocad)\b/i, '006.68'],
  [/\b(photoshop|illustrator|imagestyler|livemotion|harvard graphics|windows draw|computer graphics|freelance graphics|data visualization|paintbrush)\b/i, '006.6'],
  [/\b(dreamweaver|golive|flash actionscript|jsp|asp\b|web development|web design|web publishing|web communication|web architecture|html5|netobjects)\b/i, '006.76'],
  [/\b(assembly language|assembler)\b/i, '005.136'],
  [/\b(data structures|algorithm)\b/i, '005.73'],
  [/\b(database|dbase|clipper|foxpro|sql|oracle|mdx queries|information management)\b/i, '005.74'],
  [/\b(virus|antivirus|security information|information assurance|computers under attack|iam framework)\b/i, '005.8'],
  [/\b(ms[- ]?dos|\bdos\b|windows 3\.1|windows 95|windows 98|mac os)\b/i, '005.446'],
  [/\b(operating system|windows nt|nt server|unix|linux|ubuntu|windows xp|memory management)\b/i, '005.43'],
  [/\b(interface design)\b/i, '005.437'],
  [/\b(compiler)\b/i, '005.453'],
  [/\b(artificial intelligence|expert system)\b/i, '006.3'],
  [/\b(novell netware|lantastic|local area network)\b/i, '004.68'],
  [/\b(internet)\b/i, '004.678'],
  [/\b(computer network|data communication|ccna|lan tutorial)\b/i, '004.6'],
  [/\b(computer organization|computer architecture)\b/i, '004.2'],
  [/\b(hard disk)\b/i, '004.56'],
  [/\b(laptop|notebook|pc answer book)\b/i, '004.16'],
  [/\b(computer dictionary|dictionary of computing)\b/i, '004.03'],
  [/\b(troubleshooting and repair|upgrading and repairing pcs)\b/i, '621.3916'],
  [/\b(iphone|android phones|htc one)\b/i, '621.38456'],
  [/\b(c\+\+|c#|java|javascript|cobol|turbo pascal|turbo c|visual basic|ruby|programming language|basic computer programming|c programming|teach yourself c|standard c|pc programmer)\b/i, '005.133'],
  [/\b(software engineering|software development|theory of computation|computer theory|logic formulation|component-based development)\b/i, '005.1'],
  [/\b(systems analysis and design)\b/i, '003'],
  [/\b(pc tools|microsoft office|evernote|stacker|app empire)\b/i, '005.3'],
  [/\b(computer concepts|computer essentials|computing|information technology|computer science|information processing|computer operations)\b/i, '004'],

  // Electronics & Engineering
  [/\b(digital design)\b/i, '621.395'],
  [/\b(electronic devices|integrated electronic circuits|ic users)\b/i, '621.3815'],
  [/\b(electronic comm|telephone electronics|antenna)\b/i, '621.382'],
  [/\b(electronics)\b/i, '621.381'],
  [/\b(electromagnetics)\b/i, '621.3'],
  [/\b(thermodynamics)\b/i, '621.4021'],
  [/\b(strength of materials|mechanics of materials)\b/i, '620.112'],
  [/\b(engineering mechanics)\b/i, '620.1'],
  [/\b(robotics)\b/i, '629.892'],
  [/\b(control systems)\b/i, '629.8'],
  [/\b(unit operations of chemical engineering)\b/i, '660.284'],
  [/\b(technical drafting)\b/i, '604.2'],

  // Mathematics, Calculus & Statistics
  [/\b(calculus)\b/i, '515'],
  [/\b(trigonometry|trigonometric)\b/i, '516.24'],
  [/\b(analytic geometry)\b/i, '516.3'],
  [/\b(solid mensuration|geometry)\b/i, '516'],
  [/\b(discrete math)\b/i, '511'],
  [/\b(symbolic logic)\b/i, '511.3'],
  [/\b(algebra|precalculus)\b/i, '512'],
  [/\b(probability and statistics)\b/i, '519.2'],
  [/\b(statistics|statustics)\b/i, '519.5'],
  [/\b(business mathematics)\b/i, '650.01513'],
  [/\b(mathematics of investment)\b/i, '332.6'],
  [/\b(everyday math|mathematics)\b/i, '510'],

  // Natural Sciences
  [/\b(fluid dynamics)\b/i, '532'],
  [/\b(heat transfer)\b/i, '536.2'],
  [/\b(physics)\b/i, '530'],
  [/\b(organic chemistry)\b/i, '547'],
  [/\b(chemistry)\b/i, '540'],
  [/\b(earth science|environmental geology|earth & life|earth life|earth portrait)\b/i, '550'],
  [/\b(marine biology)\b/i, '578.77'],
  [/\b(environmental science)\b/i, '577'],
  [/\b(understanding evolution)\b/i, '576.8'],
  [/\b(biology)\b/i, '570'],
  [/\b(human anatomy)\b/i, '611'],
  [/\b(human physiology)\b/i, '612'],
  [/\b(physical anthropology)\b/i, '599.9'],
  [/\b(physical universe|physical science)\b/i, '500'],

  // Accounting, Finance, Management & Marketing
  [/\b(auditing)\b/i, '657.45'],
  [/\b(cost accounting)\b/i, '657.42'],
  [/\b(accounting|quickbooks|abm)\b/i, '657'],
  [/\b(tax and taxation|taxation)\b/i, '336.2'],
  [/\b(business finance|financial management|finance applications)\b/i, '658.15'],
  [/\b(entrepreneurship)\b/i, '658.11'],
  [/\b(human behavior in|organizational behavior|staffing organization|managing talent)\b/i, '658.3'],
  [/\b(strategic management|management strategy)\b/i, '658.4012'],
  [/\b(total quality management)\b/i, '658.4013'],
  [/\b(operations research|quantitative techniques)\b/i, '658.4034'],
  [/\b(erp applications|business driven technology|information systems|sap erp|it performance)\b/i, '658.4038'],
  [/\b(leadership)\b/i, '658.4092'],
  [/\b(operations management|production\/operations|supply chain)\b/i, '658.5'],
  [/\b(purchasing and supply chain)\b/i, '658.7'],
  [/\b(marketing research)\b/i, '658.83'],
  [/\b(international marketing)\b/i, '658.84'],
  [/\b(selling|small talk into big deals)\b/i, '658.85'],
  [/\b(e-commerce|electronic commerce|facebook marketing|built in social|online shopping|online community)\b/i, '658.872'],
  [/\b(marketing)\b/i, '658.8'],
  [/\b(advertising|which ad pulled best)\b/i, '659.1'],
  [/\b(corporate image)\b/i, '659.2'],
  [/\b(office management)\b/i, '651'],
  [/\b(business letters)\b/i, '651.75'],
  [/\b(typewriting|typing|keyboarding)\b/i, '652.3'],
  [/\b(shorthand)\b/i, '653.4'],
  [/\b(resume|interviews|hiring|perfect job)\b/i, '650.14'],
  [/\b(business research methods)\b/i, '650.072'],
  [/\b(business management|organization and management|management)\b/i, '658'],

  // HRM, Culinary & Tourism
  [/\b(hotel|motel|lodging|front office|bed & breakfast|resort)\b/i, '647.94'],
  [/\b(housekeeping)\b/i, '648'],
  [/\b(food service|bartending|catering|food and beverage|restaurant|dining room)\b/i, '647.95'],
  [/\b(meal management|meal planning|table service|table tops|garnishing|buffets)\b/i, '642'],
  [/\b(wine|champagne|chardonnay)\b/i, '641.22'],
  [/\b(whisky|malt)\b/i, '641.252'],
  [/\b(cocktail|margarita|martini|after-dinner drinks)\b/i, '641.874'],
  [/\b(smoothie|juice)\b/i, '641.875'],
  [/\b(baking|bread|dough)\b/i, '641.815'],
  [/\b(cake|cookie|dessert|sweet|pastry|pudding|pie|ice cream|sorbet|granita|brownie|jell-o)\b/i, '641.86'],
  [/\b(soup)\b/i, '641.813'],
  [/\b(pasta)\b/i, '641.822'],
  [/\b(salad)\b/i, '641.83'],
  [/\b(barbecue|grilling|grill|cook out)\b/i, '641.5784'],
  [/\b(microwave)\b/i, '641.5882'],
  [/\b(low[- ]?carb)\b/i, '641.56383'],
  [/\b(low[- ]?fat|fat[- ]?free|butter busters)\b/i, '641.56384'],
  [/\b(vegetarian|vegan)\b/i, '641.5636'],
  [/\b(diet|diabetic|gluten[- ]?free|weight watchers|calorie|nutrition|healthy heart)\b/i, '641.563'],
  [/\b(philippine cuisine|filipino cookbook|lutong|lutuing|merienda|ulam|lumpia)\b/i, '641.59599'],
  [/\b(recipe|cookbook|cooking|cookery|cook|kitchen|culinary|food|meals|dishes)\b/i, '641.5'],
  [/\b(event management|events management|event tourism)\b/i, '394.2068'],
  [/\b(tour guiding|travel and tour)\b/i, '910.2'],
  [/\b(tourism|ecotourism|eco-tourism)\b/i, '338.4791'],
  [/\b(global geography|travel book)\b/i, '910'],

  // Language, Filipino, Literature, Rizal & Communication
  [/\b(noli me tangere|filibusterismo)\b/i, '863'],
  [/\b(jose rizal|first filipino|\brizal\b)\b/i, '959.9092'],
  [/\b(history of the filipino|filipino history)\b/i, '959.9'],
  [/\b(panitikan|panitikang|philippine literature)\b/i, '899.211'],
  [/\b(pakikipagtalastasan|komunikasyon sa|pagbasa at pagsulat|retorika|retorikang|wika at)\b/i, '499.211'],
  [/\b(diksyonaryo|diksiyunaryo|tagalog-english)\b/i, '499.2113'],
  [/\b(mandarin)\b/i, '495.1'],
  [/\b(bugtong)\b/i, '398.6'],
  [/\b(salawikain|kasabihan|sawikain)\b/i, '398.9'],
  [/\b(linggwistika|linguistics)\b/i, '410'],
  [/\b(public speaking|speech|oral communication|power speak|speak and listen)\b/i, '808.51'],
  [/\b(technical writing)\b/i, '808.0666'],
  [/\b(business writing)\b/i, '808.06665'],
  [/\b(business communication)\b/i, '658.45'],
  [/\b(creative nonfiction)\b/i, '808.02'],
  [/\b(expository writing|writing skills|elements of writing|read, reason, write|they say i say|student writer|reasoning & writing|writer's workshop)\b/i, '808.042'],
  [/\b(english grammar|basic grammar)\b/i, '425'],
  [/\b(english pronunciation|pronounciation)\b/i, '421.52'],
  [/\b(english for business)\b/i, '428.24'],
  [/\b(english|communication arts|communication skills)\b/i, '428'],
  [/\b(journalism)\b/i, '070.4'],
  [/\b(literature)\b/i, '800'],
  [/\b(art appreciation|aesthetics)\b/i, '701'],
  [/\b(humanities|living with art)\b/i, '700'],

  // Philosophy, Psychology, Social Sciences & Education
  [/\b(abnormal psychology)\b/i, '616.89'],
  [/\b(child psychology|child growth|early childhood development)\b/i, '155.4'],
  [/\b(theories of personality|personality|personal development)\b/i, '155.2'],
  [/\b(human development)\b/i, '155'],
  [/\b(educational psychology|education pyschology)\b/i, '370.15'],
  [/\b(psychological testing)\b/i, '150.287'],
  [/\b(psychology)\b/i, '150'],
  [/\b(philosophy of man)\b/i, '128'],
  [/\b(logic|critical thinking)\b/i, '160'],
  [/\b(ethics|morality|moral of the story)\b/i, '170'],
  [/\b(social philosophy)\b/i, '300.1'],
  [/\b(philosophy|philosopy|philosophisizing)\b/i, '100'],
  [/\b(Philippine constitution|new constitution)\b/i, '342.599'],
  [/\b(civil code of the philippines)\b/i, '346.599'],
  [/\b(nstp|national service training|civic welfare)\b/i, '361.3'],
  [/\b(microeconomics|managerial economics)\b/i, '338.5'],
  [/\b(macroeconomics)\b/i, '339'],
  [/\b(labor economics)\b/i, '331'],
  [/\b(economic development)\b/i, '338.9'],
  [/\b(economics)\b/i, '330'],
  [/\b(mass communication|mass media)\b/i, '302.23'],
  [/\b(human communication|purposive communication)\b/i, '302.2'],
  [/\b(sociology|social theory)\b/i, '301'],
  [/\b(cultural anthropology|social problems|understanding culture)\b/i, '306'],
  [/\b(comparative politics)\b/i, '320.3'],
  [/\b(world politics|international politics)\b/i, '327'],
  [/\b(politics)\b/i, '320'],
  [/\b(reading and study skills)\b/i, '371.30281'],
  [/\b(classroom assessment|evaluating educational)\b/i, '371.26'],
  [/\b(guidance and counseling)\b/i, '371.4'],
  [/\b(teaching|reflective practice)\b/i, '371.3'],
  [/\b(curriculum)\b/i, '375'],
  [/\b(values education)\b/i, '370.114'],
  [/\b(education)\b/i, '370'],
  [/\b(practical research|research in daily life)\b/i, '001.4'],
  [/\b(physical education)\b/i, '796.07'],
]

const CATEGORY_DDC_MAP: Array<[RegExp, string]> = [
  [/\b(it|information technology|computer|programming|software)\b/i, '004'],
  [/\b(accounting|abm|finance)\b/i, '657'],
  [/\b(management|business|marketing)\b/i, '658'],
  [/\b(hrm|hospitality|culinary|food|cooking)\b/i, '641.5'],
  [/\b(tourism|travel)\b/i, '338.4791'],
  [/\b(calculus)\b/i, '515'],
  [/\b(algebra|trigonometry)\b/i, '512'],
  [/\b(statistics)\b/i, '519.5'],
  [/\b(math)\b/i, '510'],
  [/\b(electronics|engineering)\b/i, '621.381'],
  [/\b(natural science|physics|chemistry|biology|science)\b/i, '500'],
  [/\b(filipino)\b/i, '499.211'],
  [/\b(rizal)\b/i, '959.9092'],
  [/\b(communication|speech)\b/i, '808.51'],
  [/\b(technical writing)\b/i, '808.0666'],
  [/\b(language|english)\b/i, '428'],
  [/\b(philosophy|psychology)\b/i, '150'],
  [/\b(humanities|literature|arts)\b/i, '800'],
  [/\b(social science|education|history)\b/i, '300'],
  [/\b(reference|general)\b/i, '031'],
]

const SUFFIX_RE = /^(jr\.?|sr\.?|ii|iii|iv|ph\.?d\.?|m\.?d\.?|ed\.?d\.?|d\.?t\.?r\.?|r\.?d\.?|m\.?s\.?|et\.?\s*al\.?)$/i
const COMPOUND_PREFIXES = new Set(['de', 'del', 'dela', 'de la', 'van', 'von', 'st', 'st.', 'sta', 'sta.'])
const ORG_RE = /^(sti|ched|dap|mdi|cmp media llc|microsoft|american\b|university\b|committee\b|editors?\s+of\b|grolier\b|world\s+book|encyclop|lonely\s+planet|time-life|w\.?h\.?smith|salton|rebus)/i

function normalizeText(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

export function extractHeading(input: { author?: string | null; title?: string | null }): {
  heading: string
  headingType: CutterHeadingType
} {
  const rawAuthor = String(input.author ?? '').trim()
  const firstAuthor = rawAuthor
    .split(/\s*;\s*|\s+\band\b\s+|\s*&\s*/i)[0]
    ?.replace(/\bet\.?\s*al\.?$/i, '')
    .replace(/[\[\]]/g, '')
    .trim()

  if (firstAuthor && !/^(unknown|not verified|n\/a|-)$/i.test(firstAuthor)) {
    const cleanAuthor = normalizeText(firstAuthor).replace(/\s+/g, ' ').trim()
    if (ORG_RE.test(cleanAuthor) || /^[A-Z0-9]{2,6}$/.test(cleanAuthor)) {
      const strippedOrg = cleanAuthor.replace(/^editors?\s+of\s+(the\s+)?/i, '').trim()
      return { heading: strippedOrg || cleanAuthor, headingType: 'organization' }
    }

    const commaParts = cleanAuthor
      .split(',')
      .map(p => p.trim())
      .filter(Boolean)
      .filter(p => !SUFFIX_RE.test(p))

    const baseName = commaParts[0] ?? cleanAuthor
    const tokens = baseName
      .split(/\s+/)
      .filter(t => !SUFFIX_RE.test(t.replace(/[,.;]/g, '')))

    if (tokens.length <= 1) {
      return { heading: tokens[0] || cleanAuthor, headingType: 'author' }
    }

    const last = tokens[tokens.length - 1]
    const prev = tokens[tokens.length - 2]?.toLowerCase().replace(/\./g, '')
    if (prev && COMPOUND_PREFIXES.has(prev)) {
      return { heading: `${tokens[tokens.length - 2]} ${last}`, headingType: 'author' }
    }
    return { heading: last, headingType: 'author' }
  }

  const rawTitle = normalizeText(String(input.title ?? '').trim())
    .replace(/^(the|a|an|ang|mga)\s+/i, '')
    .trim()
  return { heading: rawTitle || 'Untitled', headingType: 'title' }
}

function expansionDigit(ch: string | undefined): string {
  if (!ch) return '3'
  if (ch <= 'd') return '3'
  if (ch <= 'h') return '4'
  if (ch <= 'l') return '5'
  if (ch <= 'o') return '6'
  if (ch <= 's') return '7'
  if (ch <= 'v') return '8'
  return '9'
}

function vowelSecondDigit(ch: string | undefined): string {
  if (!ch) return '2'
  if (ch <= 'b') return '2'
  if (ch <= 'k') return '3'
  if (ch <= 'm') return '4'
  if (ch === 'n') return '5'
  if (ch <= 'q') return '6'
  if (ch === 'r') return '7'
  if (ch <= 't') return '8'
  return '9'
}

function sSecondDigit(rest: string): { digit: string; consumed: number } {
  if (!rest) return { digit: '2', consumed: 0 }
  if (rest.startsWith('ch')) return { digit: '3', consumed: 2 }
  const ch = rest[0]
  if (ch <= 'b') return { digit: '2', consumed: 1 }
  if (ch <= 'd') return { digit: '3', consumed: 1 }
  if (ch <= 'g') return { digit: '4', consumed: 1 }
  if (ch <= 'l') return { digit: '5', consumed: 1 }
  if (ch <= 'p') return { digit: '6', consumed: 1 }
  if (ch <= 't') return { digit: '7', consumed: 1 }
  if (ch === 'u') return { digit: '8', consumed: 1 }
  return { digit: '9', consumed: 1 }
}

function quThirdDigit(ch: string | undefined): string {
  if (!ch) return '3'
  if (ch <= 'd') return '3'
  if (ch <= 'h') return '4'
  if (ch <= 'l') return '5'
  if (ch <= 'q') return '6'
  if (ch <= 's') return '7'
  if (ch <= 'v') return '8'
  return '9'
}

function consonantSecondDigit(ch: string | undefined): string {
  if (!ch) return '3'
  if (ch <= 'd') return '3'
  if (ch <= 'h') return '4'
  if (ch <= 'l') return '5'
  if (ch <= 'q') return '6'
  if (ch <= 't') return '7'
  if (ch <= 'x') return '8'
  return '9'
}

export function buildCutterCode(heading: string, digits = 3): string {
  const cleaned = normalizeText(String(heading ?? '').trim())
  const digitMatch = cleaned.match(/^\d+/)
  if (digitMatch) {
    const num = Number(digitMatch[0])
    const bucket = num <= 9 ? 2 : num <= 99 ? 3 : num <= 999 ? 4 : num <= 1999 ? 6 : 7
    return `A1${bucket}`
  }

  const letters = cleaned.toLowerCase().replace(/[^a-z]/g, '')
  if (!letters) return 'A33'

  const first = letters[0].toUpperCase()
  const rest = letters.slice(1)
  let base = first
  let consumed = 0

  if ('AEIOU'.includes(first)) {
    base += vowelSecondDigit(rest[0])
    consumed = 1
  } else if (first === 'S') {
    const s = sSecondDigit(rest)
    base += s.digit
    consumed = s.consumed
  } else if (first === 'Q' && rest.startsWith('u')) {
    base += quThirdDigit(rest[1])
    consumed = 2
  } else if (first === 'Q') {
    base += '2' + expansionDigit(rest[1] ?? rest[0])
    consumed = 2
  } else {
    base += consonantSecondDigit(rest[0])
    consumed = 1
  }

  let tailIndex = consumed
  while (base.length - 1 < digits && tailIndex < rest.length) {
    base += expansionDigit(rest[tailIndex])
    tailIndex++
  }

  return base
}

export function generateDdcAndCutter(input: {
  title?: string | null
  author?: string | null
  categoryName?: string | null
  deweyCode?: string | null
}): GeneratedDdcCutter {
  const enteredCode = String(input.deweyCode ?? '').trim()
  let ddcCode = ''
  let source: GeneratedDdcCutter['source'] = 'subject_rule'

  if (/^\d{3}(\.\d+)?$/.test(enteredCode)) {
    ddcCode = enteredCode
    source = 'entered'
  } else {
    const searchPool = `${input.title ?? ''} ${input.categoryName ?? ''}`.trim()
    for (const [pattern, code] of TITLE_SUBJECT_RULES) {
      if (pattern.test(searchPool)) {
        ddcCode = code
        source = 'subject_rule'
        break
      }
    }
    if (!ddcCode && input.categoryName) {
      for (const [pattern, code] of CATEGORY_DDC_MAP) {
        if (pattern.test(input.categoryName)) {
          ddcCode = code
          source = 'category_rule'
          break
        }
      }
    }
    if (!ddcCode) {
      ddcCode = '000'
      source = 'category_rule'
    }
  }

  const { heading, headingType } = extractHeading({ author: input.author, title: input.title })
  const cutter = buildCutterCode(heading, 3)
  const subject = describeDdcCode(ddcCode)
  const callNumber = `${ddcCode} ${cutter}`

  return {
    ddcCode,
    subject,
    cutter,
    callNumber,
    heading,
    headingType,
    source,
  }
}
