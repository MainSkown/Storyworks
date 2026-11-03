/** Story text for the sample books; structure and ids live in build.ts. */
export type SampleLang = 'en' | 'pl'

export interface SceneText {
  title: string
  synopsis: string
  paras: string[]
}

export interface EntryText {
  name: string
  aliases: string[]
  notes: string
  appendix: string
}

export interface NodeText {
  title: string
  note: string
}

export interface RuleText {
  title: string
  description: string
  exceptions: string
  tags: string[]
}

export interface SampleText {
  title: string
  author: string
  chapters: string[]
  scenes: Record<string, SceneText>
  entries: Record<string, EntryText>
  nodes: Record<string, NodeText>
  rules: Record<string, RuleText>
  branches: { tobias: string; mara: string }
  knowledge: { title: string; description: string; note: string }
  tobiasStatus: string
}

const en: SampleText = {
  title: 'The Last Light at Gull Point',
  author: 'Storyworks sample',
  chapters: ['The Keeper', 'The Fog', 'Two Roads', 'Morning'],
  scenes: {
    s1: {
      title: 'The Ferry Leaves',
      synopsis: 'Mara arrives at the lighthouse to take over from the old keeper.',
      paras: [
        'The ferry did not wait. Mara climbed the wet steps of Gull Point with one bag on her shoulder, and by the time she reached the door the boat was only a grey smudge on the water.',
        'The lighthouse stood above her, white once and streaked with salt now. Old Pettigrew had kept it for forty years, and the letter in her pocket said he had gone to the mainland to rest.',
        'She pushed the door open with her shoulder. Inside it smelled of lamp oil, damp rope and tea gone cold.',
      ],
    },
    s2: {
      title: 'Salt Oil',
      synopsis: 'Pettigrew left a note about the lantern. Mara learns what it burns.',
      paras: [
        'Pettigrew had left a note on the lamp-room table, written in a shaky hand and weighed down with a brass key.',
        'The Brass Lantern burns no kerosene and no whale oil. Feed it salt oil, and only salt oil, or it will go dark.',
        'Mara read the last line twice. Whoever built the lantern had wanted its keeper to understand one thing: the light was not hers to improvise with.',
      ],
    },
    s3: {
      title: 'The Horn',
      synopsis: 'On the third of November the fog comes in and Mara keeps her oath.',
      paras: [
        'On the third of November the fog came in before supper. It rolled over the water like spilled milk, and within minutes Mara could not see the rocks below the tower.',
        'The oath she had sworn at the mainland office was short: never leave the light unattended while fog lies on the water. She repeated it under her breath as she climbed.',
        'The beam reached out a mile and no further. Beyond that the fog swallowed it whole, and any ship out there would have to trust the horn.',
      ],
    },
    s4: {
      title: 'A Knock at the Door',
      synopsis: 'Her brother Tobias turns up out of the fog.',
      paras: [
        'Someone was knocking, though no boat had been heard. Mara opened the door with the lamp raised.',
        'It was Tobias, her brother, soaked to the knees and grinning. "You look like the ghost of a keeper," he said. "Is there tea?"',
        'She had not seen him in six years. She let him in and did not ask how he had found the island in the fog.',
      ],
    },
    s5: {
      title: 'Tobias Rows Out',
      synopsis: 'A ship sounds its horn too close. Tobias takes the dinghy; Mara stays.',
      paras: [
        'Near midnight a ship sounded its horn, close and wrong. Tobias took the dinghy and rowed out toward it, shouting that he knew the shoals.',
        'Mara watched his small lantern shrink to a spark and vanish. The oath held her to the tower, so she stayed.',
        'She had never hated a promise so much.',
      ],
    },
    s6: {
      title: 'Alone at the Lantern',
      synopsis: 'The flame sputters. Mara remembers the note and feeds it salt oil.',
      paras: [
        'While Tobias was out, the flame began to sputter and lean.',
        'Mara remembered the note. She fetched the salt oil from the cellar and fed the Brass Lantern slowly, the way one feeds a nervous animal.',
        'The flame steadied and turned from yellow to white. For the first time the beam went through the fog like a spear.',
      ],
    },
    s7: {
      title: 'The Ship',
      synopsis: 'At dawn the fog lifts. The ship is safe and Tobias is laughing in the dinghy.',
      paras: [
        'At dawn the fog broke. A steamer lay on the water a cable from the rocks, safe, its crew waving.',
        'Tobias sat in the dinghy beside it, laughing, one oar lost and both hands bleeding.',
        'Mara sat down on the lamp-room step, because her legs had stopped working.',
      ],
    },
    s8: {
      title: 'The Log Book',
      synopsis: 'Mara writes the first entry of her own.',
      paras: [
        'Mara opened the log book and wrote the date. Under it she wrote: "Fog. Light kept. Ship saved."',
        'She looked at the line for a long time. Then, because it was true, she added her brother\'s name.',
      ],
    },
  },
  entries: {
    mara: {
      name: 'Mara',
      aliases: ['the keeper'],
      notes: 'The new keeper of Gull Point. Careful, stubborn, bad at asking for help.',
      appendix: 'Keeper of the Gull Point light.',
    },
    tobias: {
      name: 'Tobias',
      aliases: ['Toby'],
      notes: 'Mara\'s younger brother. A sailor who turns up when least expected.',
      appendix: 'Mara\'s brother, a sailor.',
    },
    lighthouse: {
      name: 'Gull Point Lighthouse',
      aliases: ['the light', 'Gull Point'],
      notes: 'A white tower on a rock, half an hour from the mainland by ferry.',
      appendix: 'The lighthouse on Gull Point.',
    },
    lantern: {
      name: 'Brass Lantern',
      aliases: ['the lamp'],
      notes: 'The lamp at the top of the tower. Older than the tower itself.',
      appendix: 'The old lamp at the top of the tower. It burns salt oil only.',
    },
  },
  nodes: {
    n1: { title: 'Mara arrives at Gull Point', note: 'The ferry drops her off and leaves.' },
    n2: { title: 'The fog rolls in', note: 'Third of November. The oath begins to matter.' },
    n3a: {
      title: 'Tobias rows out',
      note: 'Deliberate mistake: this event is dated before the fog it follows, so the Checks page shows one warning. Change the date to clear it.',
    },
    n3b: { title: 'Mara feeds the lantern', note: 'Undated on purpose: not every event needs a date.' },
    n4: { title: 'The ship is saved', note: 'Both branches meet at dawn.' },
  },
  rules: {
    r1: {
      title: 'The lamp drinks only salt oil',
      description: 'The Brass Lantern burns salt oil and nothing else. Any other fuel makes the flame sputter and die.',
      exceptions: 'None known.',
      tags: ['lamp'],
    },
    r2: {
      title: 'A keeper never leaves the light',
      description: 'A sworn keeper does not leave the tower while fog lies on the water.',
      exceptions: 'Only the head keeper can release a keeper from the oath.',
      tags: ['oath'],
    },
    r3: {
      title: 'Fog stops the beam at a mile',
      description: 'In thick fog the beam carries a mile at most. Beyond that, ships rely on the horn.',
      exceptions: 'The Brass Lantern burning white cuts further.',
      tags: ['fog'],
    },
  },
  branches: { tobias: 'Tobias at sea', mara: 'Mara at the tower' },
  knowledge: {
    title: 'The lantern needs salt oil',
    description: 'Pettigrew\'s note explains what the lantern burns.',
    note: 'From Pettigrew\'s note.',
  },
  tobiasStatus: 'At sea in the dinghy',
}

const pl: SampleText = {
  title: 'Ostatnie światło na Mewiej Skale',
  author: 'Przykład Storyworks',
  chapters: ['Latarniczka', 'Mgła', 'Dwie drogi', 'Poranek'],
  scenes: {
    s1: {
      title: 'Prom odpływa',
      synopsis: 'Mara przybywa do latarni, żeby zastąpić starego latarnika.',
      paras: [
        'Prom nie czekał. Mara wspięła się po mokrych schodach Mewiej Skały z jedną torbą na ramieniu, a gdy dotarła do drzwi, łódź była już tylko szarą plamą na wodzie.',
        'Latarnia wznosiła się nad nią, kiedyś biała, teraz poznaczona solą. Stary Wiktor pilnował jej od czterdziestu lat, a list w kieszeni Mary mówił, że wyjechał na kontynent odpocząć.',
        'Pchnęła drzwi ramieniem. W środku pachniało olejem, wilgotną liną i zimną herbatą.',
      ],
    },
    s2: {
      title: 'Sól i olej',
      synopsis: 'Wiktor zostawił list o lampie. Mara dowiaduje się, czym ona płonie.',
      paras: [
        'Wiktor zostawił list na stole w lampowni, napisany drżącą ręką i przyciśnięty mosiężnym kluczem.',
        'Mosiężna Lampa nie pali ani nafty, ani tranu. Karm ją solnym olejem i tylko solnym olejem, bo inaczej zgaśnie.',
        'Mara przeczytała ostatnie zdanie dwa razy. Ktokolwiek zbudował tę lampę, chciał, żeby latarnik zrozumiał jedno: to światło nie należy do niego, żeby je zmieniać po swojemu.',
      ],
    },
    s3: {
      title: 'Róg mgłowy',
      synopsis: 'Trzeciego listopada nadciąga mgła, a Mara dotrzymuje przysięgi.',
      paras: [
        'Trzeciego listopada mgła przyszła jeszcze przed kolacją. Przelewała się nad wodą jak rozlane mleko i po kilku minutach Mara nie widziała już skał pod wieżą.',
        'Przysięga, którą złożyła w urzędzie na lądzie, była krótka: nigdy nie opuszczać światła, gdy mgła leży na wodzie. Powtarzała ją pod nosem, wchodząc po schodach.',
        'Snop światła sięgał na milę i ani kroku dalej. Dalej mgła połykała go w całości, a każdy statek na morzu musiał zaufać rogowi.',
      ],
    },
    s4: {
      title: 'Pukanie do drzwi',
      synopsis: 'Brat Mary, Tobiasz, wyłania się z mgły.',
      paras: [
        'Ktoś pukał, choć nie słychać było żadnej łodzi. Mara otworzyła drzwi z podniesioną lampą.',
        'To był Tobiasz, jej brat, przemoczony do kolan i uśmiechnięty od ucha do ucha. – Wyglądasz jak duch latarnika – powiedział. – Jest herbata?',
        'Nie widziała go od sześciu lat. Wpuściła go do środka i nie pytała, jak znalazł wyspę we mgle.',
      ],
    },
    s5: {
      title: 'Tobiasz wypływa',
      synopsis: 'Statek trąbi zbyt blisko. Tobiasz bierze łódkę, Mara zostaje.',
      paras: [
        'Około północy rozległ się róg statku, za blisko i w złym miejscu. Tobiasz zabrał łódkę i ruszył w jego stronę, krzycząc, że zna te mielizny.',
        'Mara patrzyła, jak jego mała latarka kurczy się do iskry i znika. Przysięga trzymała ją przy wieży, więc została.',
        'Nigdy tak nie nienawidziła żadnej obietnicy.',
      ],
    },
    s6: {
      title: 'Sama przy lampie',
      synopsis: 'Płomień się dławi. Mara przypomina sobie list i dolewa solnego oleju.',
      paras: [
        'Gdy Tobiasza nie było, płomień zaczął się dławić i chylić na bok.',
        'Mara przypomniała sobie list. Przyniosła z piwnicy solny olej i dolewała go do Mosiężnej Lampy powoli, tak jak karmi się płochliwe zwierzę.',
        'Płomień się uspokoił i z żółtego zrobił się biały. Po raz pierwszy snop światła przeszył mgłę jak włócznia.',
      ],
    },
    s7: {
      title: 'Statek',
      synopsis: 'O świcie mgła opada. Statek jest cały, a Tobiasz śmieje się w łódce.',
      paras: [
        'O świcie mgła się rozstąpiła. Parowiec stał na wodzie o kabel od skał, cały i zdrowy, a załoga machała rękami.',
        'Tobiasz siedział obok w łódce i śmiał się, z jednym wiosłem mniej i obiema rękami poobcieranymi do krwi.',
        'Mara usiadła na stopniu lampowni, bo nogi odmówiły jej posłuszeństwa.',
      ],
    },
    s8: {
      title: 'Dziennik pokładowy',
      synopsis: 'Mara robi swój pierwszy wpis.',
      paras: [
        'Mara otworzyła dziennik i wpisała datę. Pod nią napisała: „Mgła. Światło dotrzymane. Statek uratowany”.',
        'Patrzyła na ten wiersz długo. Potem, bo to była prawda, dopisała imię brata.',
      ],
    },
  },
  entries: {
    mara: {
      name: 'Mara',
      aliases: ['latarniczka', 'Mary', 'Marze'],
      notes: 'Nowa latarniczka z Mewiej Skały. Ostrożna, uparta, nie umie prosić o pomoc.',
      appendix: 'Latarniczka z Mewiej Skały.',
    },
    tobias: {
      name: 'Tobiasz',
      aliases: ['Tobiasza', 'Tobiaszu'],
      notes: 'Młodszy brat Mary. Żeglarz, który pojawia się wtedy, gdy nikt się go nie spodziewa.',
      appendix: 'Brat Mary, żeglarz.',
    },
    lighthouse: {
      name: 'Latarnia na Mewiej Skale',
      aliases: ['Mewia Skała', 'latarnia'],
      notes: 'Biała wieża na skale, pół godziny promem od lądu.',
      appendix: 'Latarnia na Mewiej Skale.',
    },
    lantern: {
      name: 'Mosiężna Lampa',
      aliases: ['lampa', 'Mosiężnej Lampy'],
      notes: 'Lampa na szczycie wieży. Starsza niż sama wieża.',
      appendix: 'Stara lampa na szczycie wieży. Pali wyłącznie solny olej.',
    },
  },
  nodes: {
    n1: { title: 'Mara przybywa na Mewią Skałę', note: 'Prom zostawia ją na brzegu i odpływa.' },
    n2: { title: 'Nadciąga mgła', note: 'Trzeci listopada. Przysięga zaczyna mieć znaczenie.' },
    n3a: {
      title: 'Tobiasz wypływa',
      note: 'Celowy błąd: to wydarzenie ma datę wcześniejszą niż mgła, po której następuje, więc strona Kontroli pokazuje jedno ostrzeżenie. Zmień datę, żeby je usunąć.',
    },
    n3b: { title: 'Mara dolewa oleju do lampy', note: 'Celowo bez daty: nie każde wydarzenie jej potrzebuje.' },
    n4: { title: 'Statek jest uratowany', note: 'Obie gałęzie spotykają się o świcie.' },
  },
  rules: {
    r1: {
      title: 'Lampa pije tylko solny olej',
      description: 'Mosiężna Lampa pali solny olej i nic poza nim. Każde inne paliwo sprawia, że płomień się dławi i gaśnie.',
      exceptions: 'Brak znanych wyjątków.',
      tags: ['lampa'],
    },
    r2: {
      title: 'Latarnik nie opuszcza światła',
      description: 'Zaprzysiężony latarnik nie schodzi z wieży, dopóki mgła leży na wodzie.',
      exceptions: 'Tylko naczelny latarnik może zwolnić latarnika z przysięgi.',
      tags: ['przysięga'],
    },
    r3: {
      title: 'Mgła zatrzymuje snop na mili',
      description: 'W gęstej mgle snop światła sięga najwyżej na milę. Dalej statki polegają na rogu mgłowym.',
      exceptions: 'Mosiężna Lampa, gdy płonie na biało, sięga dalej.',
      tags: ['mgła'],
    },
  },
  branches: { tobias: 'Tobiasz na morzu', mara: 'Mara w wieży' },
  knowledge: {
    title: 'Lampa potrzebuje solnego oleju',
    description: 'List Wiktora wyjaśnia, czym pali lampa.',
    note: 'Z listu Wiktora.',
  },
  tobiasStatus: 'Na morzu w łódce',
}

export const SAMPLE_TEXT: Record<SampleLang, SampleText> = { en, pl }
