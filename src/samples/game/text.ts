import type { SampleLang } from '../text'

/** Story and design text for the sample game; structure and ids live in build.ts. */
export type Who = 'wren' | 'ida' | 'bram'
/** One script line: a speaker (codex id) or null for narration. */
export type L = readonly [Who | null, string]

export interface EntryText {
  name: string
  aliases: string[]
  notes: string
}

export interface MechanicText {
  title: string
  summary: string
  tags: string[]
  description: string
  params: [name: string, value: string][]
}

export interface GameSampleText {
  title: string
  author: string
  folders: { act1: string; act2: string }
  items: Record<'arrival' | 'gate' | 'alley' | 'tower', { title: string; synopsis: string }>
  scripts: Record<'arrival' | 'alley' | 'tower', L[]>
  conv: {
    greet: L[]
    pay: L[]
    plead: L[]
    leave: L[]
    old: L[]
    askPay: string
    askPlead: string
    askLeave: string
  }
  variables: { key: string; coins: string; trust: string }
  entries: Record<'wren' | 'ida' | 'bram' | 'tower' | 'key', EntryText>
  nodes: Record<'n1' | 'n2' | 'n3', { title: string; note: string }>
  branch: string
  beat: string
  overview: { pitch: string; pillars: string[]; audience: string; loop: string }
  mechanics: Record<'m1' | 'm2' | 'm3' | 'm4' | 'm5', MechanicText>
  glossary: [term: string, definition: string][]
}

const en: GameSampleText = {
  title: 'The Clocktower Key',
  author: 'Storyworks sample',
  folders: { act1: 'Act 1: The gate', act2: 'Act 2: The tower' },
  items: {
    arrival: { title: 'Arrival', synopsis: 'Wren reaches Brindle and hears the bell.' },
    gate: { title: 'Talk at the gate', synopsis: 'Bram guards the key. Wren has to talk, pay or walk away.' },
    alley: { title: 'Back alley', synopsis: 'Without the key, Wren finds another way in.' },
    tower: { title: 'The clocktower', synopsis: 'Wren and Ida stop the bell.' },
  },
  scripts: {
    arrival: [
      [null, 'Evening in Brindle. The bell in the clocktower has been ringing for three hours, and nobody knows how to stop it.'],
      ['wren', 'Of all the nights to deliver a letter.'],
      [null, 'A voice calls down from the top of the tower.'],
      ['ida', 'Courier! Is that a letter for me? Then get the key from Bram and come up!'],
      ['wren', 'Bram. Of course it is Bram.'],
    ],
    alley: [
      [null, 'A narrow alley runs along the wall of the tower. A rusty grate hangs loose near the ground.'],
      ['wren', 'Not a door, but it will do.'],
      [null, 'Wren squeezes through and comes out at the foot of the stairs, without the key.'],
    ],
    tower: [
      [null, 'At the top of the tower a woman in an oil-stained apron is wrestling with a great brass wheel.'],
      ['ida', 'Wren! At last. Did Bram let you through?'],
      ['wren', 'One way or another. What do I do?'],
      ['ida', 'Hold this lever. When I say now, pull. Now!'],
      [null, 'Wren pulls. The gears groan, the hammer lifts away from the bell, and all of Brindle falls silent.'],
      ['ida', 'Hear that? That is the sound of a quiet evening. Thank you.'],
    ],
  },
  conv: {
    greet: [
      ['bram', 'Halt. The tower is shut once the bell starts.'],
      ['wren', 'I have a letter for Ida. She asked me to fetch the key.'],
    ],
    pay: [['bram', 'Hm. A fair price. Here is the brass key. Mind the stairs.']],
    plead: [['bram', 'Pleading is free, and worth about what it costs.']],
    leave: [['bram', 'Suit yourself. The bell will ring all night.']],
    old: [['bram', 'Key? There is no key. Lost it years ago.']],
    askPay: 'Slip him a coin.',
    askPlead: 'Plead with him.',
    askLeave: 'Walk away.',
  },
  variables: { key: 'has_key', coins: 'coins', trust: 'bram_trust' },
  entries: {
    wren: { name: 'Wren', aliases: [], notes: 'A young courier with a bag too heavy for her. The player character.' },
    ida: { name: 'Ida', aliases: [], notes: 'The clockkeeper. Stubborn, practical, usually covered in oil.' },
    bram: {
      name: 'Bram',
      aliases: ['The gatekeeper'],
      notes: 'Guards the tower gate and its only key. Can be bribed, but pretends he cannot.',
    },
    tower: { name: 'Clocktower', aliases: ['The tower'], notes: 'The tallest building in Brindle. Its bell has jammed.' },
    key: { name: 'Brass key', aliases: [], notes: 'Opens the tower door. Bram wears it on a cord around his neck.' },
  },
  nodes: {
    n1: { title: 'Arrival in Brindle', note: 'Wren reaches the village.' },
    n2: { title: 'The bell falls silent', note: 'The tower is reached and the bell is stopped.' },
    n3: { title: 'Through the alley', note: 'Sneaking past the gate.' },
  },
  branch: 'Sneak route',
  beat: 'The bell is silent. Brindle can sleep.',
  overview: {
    pitch:
      'A short adventure about a courier who has one evening to silence a runaway bell. A small game that shows how story, variables and design notes fit together.',
    pillars: ['Talk before you act', 'Every coin counts', 'Two ways in'],
    audience: 'Players who like short, story-first adventures with a few well-placed choices.',
    loop:
      'Talk to people, collect what you need, reach the tower. Each choice at the gate changes what the player carries and which way the story goes.',
  },
  mechanics: {
    m1: {
      title: 'Talk your way in',
      summary: 'Choices at the gate decide whether Wren gets the key.',
      tags: ['dialogue', 'core'],
      description:
        'At the gate the player picks one of three approaches. Paying needs at least one coin; pleading changes nothing but can be repeated.',
      params: [['Options', '3'], ['Plead limit', 'none']],
    },
    m2: {
      title: 'Coins and trust',
      summary: 'Coins buy favours, and every favour raises trust.',
      tags: ['economy'],
      description: 'The player starts with five coins. A bribe costs one coin and raises the gatekeeper\'s trust by one.',
      params: [['Start coins', '5'], ['Bribe cost', '1 coin'], ['Trust per bribe', '+1']],
    },
    m3: {
      title: 'Quiet route',
      summary: 'A second way in, past the gate, for players with no key.',
      tags: ['route', 'stealth'],
      description:
        'Without the key the player is sent to the back alley, which leads to the tower. The route is skipped when the key was bought.',
      params: [['Noise radius', '3 m']],
    },
    m4: {
      title: 'Silence the bell',
      summary: 'The goal of the adventure: reach the tower and stop the bell.',
      tags: ['goal'],
      description: 'At the top of the tower the player pulls the lever on cue. Pulling it ends the story.',
      params: [['Lever timing', 'on cue'], ['Attempts', '1']],
    },
    m5: {
      title: 'Night timer',
      summary: 'A countdown on screen until midnight.',
      tags: ['ui'],
      description: 'Cut: a visible clock made the short story feel rushed.',
      params: [['Duration', '10 min']],
    },
  },
  glossary: [
    ['Beat', 'A short note on the story map, such as a moment or a goal, that is not a script or a conversation.'],
    ['Route', 'One timeline branch. Items tagged with a route belong only to that path through the story.'],
    ['Unlock', 'A condition on a story-map arrow. The way on opens only when the variables fit.'],
    ['Variable', 'A named value the story remembers: a flag, a number or text.'],
    ['Trust', 'How much the gatekeeper believes Wren; a number that grows with every favour.'],
    ['Brindle', 'The village where the story takes place.'],
  ],
}

const pl: GameSampleText = {
  title: 'Klucz do wieży zegarowej',
  author: 'Przykład Storyworks',
  folders: { act1: 'Akt 1: Brama', act2: 'Akt 2: Wieża' },
  items: {
    arrival: { title: 'Przybycie', synopsis: 'Wren dociera do Brindle i słyszy dzwon.' },
    gate: { title: 'Rozmowa przy bramie', synopsis: 'Bram pilnuje klucza. Wren musi pogadać, zapłacić albo odejść.' },
    alley: { title: 'Zaułek', synopsis: 'Bez klucza Wren szuka innej drogi do środka.' },
    tower: { title: 'Wieża zegarowa', synopsis: 'Wren i Ida zatrzymują dzwon.' },
  },
  scripts: {
    arrival: [
      [null, 'Wieczór w Brindle. Dzwon na wieży zegarowej bije już trzecią godzinę i nikt nie wie, jak go zatrzymać.'],
      ['wren', 'Akurat dziś musiałam dostarczać list.'],
      [null, 'Z góry wieży ktoś woła.'],
      ['ida', 'Kurierko! To list dla mnie? Weź klucz od Brama i wchodź na górę!'],
      ['wren', 'Bram. Oczywiście, że Bram.'],
    ],
    alley: [
      [null, 'Wąski zaułek biegnie wzdłuż muru wieży. Przy ziemi wisi obluzowana, zardzewiała krata.'],
      ['wren', 'To nie drzwi, ale wystarczy.'],
      [null, 'Wren przeciska się przez otwór i wychodzi u stóp schodów, bez klucza.'],
    ],
    tower: [
      [null, 'Na szczycie wieży kobieta w poplamionym smarem fartuchu szarpie się z wielkim mosiężnym kołem.'],
      ['ida', 'Wren! Wreszcie. Bram cię wpuścił?'],
      ['wren', 'Tak czy inaczej. Co mam robić?'],
      ['ida', 'Trzymaj tę dźwignię. Kiedy powiem teraz, pociągnij. Teraz!'],
      [null, 'Wren ciągnie. Trybiki jęczą, młot odsuwa się od dzwonu i całe Brindle cichnie.'],
      ['ida', 'Słyszysz? Tak brzmi spokojny wieczór. Dziękuję.'],
    ],
  },
  conv: {
    greet: [
      ['bram', 'Stój. Wieża jest zamknięta, odkąd dzwon zaczął bić.'],
      ['wren', 'Mam list do Idy. Prosiła, żebym przyniosła klucz.'],
    ],
    pay: [['bram', 'Hm. Uczciwa cena. Masz mosiężny klucz. Uważaj na schody.']],
    plead: [['bram', 'Prośby są darmowe i tyle samo warte.']],
    leave: [['bram', 'Jak chcesz. Dzwon będzie bił całą noc.']],
    old: [['bram', 'Klucz? Nie ma żadnego klucza. Zgubiłem go lata temu.']],
    askPay: 'Daj mu monetę.',
    askPlead: 'Poproś go.',
    askLeave: 'Odejdź.',
  },
  variables: { key: 'ma_klucz', coins: 'monety', trust: 'zaufanie_brama' },
  entries: {
    wren: { name: 'Wren', aliases: [], notes: 'Młoda kurierka z torbą za ciężką na jej plecy. Postać gracza.' },
    ida: { name: 'Ida', aliases: [], notes: 'Zegarmistrzyni. Uparta, praktyczna, zwykle cała w smarze.' },
    bram: {
      name: 'Bram',
      aliases: ['Strażnik bramy'],
      notes: 'Pilnuje bramy wieży i jedynego klucza. Da się przekupić, ale udaje, że nie.',
    },
    tower: { name: 'Wieża zegarowa', aliases: ['Wieża'], notes: 'Najwyższy budynek w Brindle. Jej dzwon się zaciął.' },
    key: { name: 'Mosiężny klucz', aliases: [], notes: 'Otwiera drzwi wieży. Bram nosi go na sznurku na szyi.' },
  },
  nodes: {
    n1: { title: 'Przybycie do Brindle', note: 'Wren dociera do wioski.' },
    n2: { title: 'Dzwon cichnie', note: 'Wieża zdobyta, dzwon zatrzymany.' },
    n3: { title: 'Przez zaułek', note: 'Obejście bramy.' },
  },
  branch: 'Ścieżka skradania',
  beat: 'Dzwon milknie. Brindle może spać.',
  overview: {
    pitch:
      'Krótka przygoda o kurierce, która ma jeden wieczór, by uciszyć szalejący dzwon. Mała gra pokazująca, jak historia, zmienne i notatki projektowe działają razem.',
    pillars: ['Najpierw rozmowa, potem czyn', 'Liczy się każda moneta', 'Dwie drogi do środka'],
    audience: 'Gracze lubiący krótkie przygody z historią na pierwszym planie i kilkoma dobrze ustawionymi wyborami.',
    loop:
      'Rozmawiaj z ludźmi, zdobywaj to, czego potrzebujesz, dojdź do wieży. Każdy wybór przy bramie zmienia to, co gracz niesie, i kierunek opowieści.',
  },
  mechanics: {
    m1: {
      title: 'Wejście dzięki rozmowie',
      summary: 'Wybory przy bramie decydują, czy Wren dostanie klucz.',
      tags: ['dialog', 'rdzeń'],
      description:
        'Przy bramie gracz wybiera jedno z trzech podejść. Zapłata wymaga co najmniej jednej monety; prośby niczego nie zmieniają, ale można je powtarzać.',
      params: [['Opcje', '3'], ['Limit próśb', 'brak']],
    },
    m2: {
      title: 'Monety i zaufanie',
      summary: 'Monety kupują przysługi, a każda przysługa podnosi zaufanie.',
      tags: ['ekonomia'],
      description: 'Gracz zaczyna z pięcioma monetami. Łapówka kosztuje jedną monetę i podnosi zaufanie strażnika o jeden.',
      params: [['Monety na start', '5'], ['Koszt łapówki', '1 moneta'], ['Zaufanie za łapówkę', '+1']],
    },
    m3: {
      title: 'Cicha droga',
      summary: 'Drugie wejście, obok bramy, dla graczy bez klucza.',
      tags: ['ścieżka', 'skradanie'],
      description:
        'Bez klucza gracz trafia do zaułka, który prowadzi do wieży. Ta ścieżka jest pomijana, gdy klucz został kupiony.',
      params: [['Zasięg hałasu', '3 m']],
    },
    m4: {
      title: 'Uciszyć dzwon',
      summary: 'Cel przygody: dojść do wieży i zatrzymać dzwon.',
      tags: ['cel'],
      description: 'Na szczycie wieży gracz pociąga dźwignię na komendę. Pociągnięcie kończy historię.',
      params: [['Moment pociągnięcia', 'na komendę'], ['Próby', '1']],
    },
    m5: {
      title: 'Zegar nocy',
      summary: 'Odliczanie na ekranie do północy.',
      tags: ['interfejs'],
      description: 'Wycięte: widoczny zegar sprawiał, że krótka historia wydawała się pospieszna.',
      params: [['Czas', '10 min']],
    },
  },
  glossary: [
    ['Punkt fabuły', 'Krótka notatka na mapie fabuły, na przykład chwila lub cel, która nie jest skryptem ani rozmową.'],
    ['Ścieżka', 'Jedna gałąź osi czasu. Elementy oznaczone ścieżką należą tylko do tej drogi przez historię.'],
    ['Odblokowanie', 'Warunek na strzałce mapy fabuły. Droga dalej otwiera się tylko wtedy, gdy zmienne pasują.'],
    ['Zmienna', 'Nazwana wartość, którą pamięta historia: flaga, liczba albo tekst.'],
    ['Zaufanie', 'Jak bardzo strażnik wierzy Wren; liczba rosnąca z każdą przysługą.'],
    ['Brindle', 'Wioska, w której toczy się historia.'],
  ],
}

export const GAME_SAMPLE_TEXT: Record<SampleLang, GameSampleText> = { en, pl }
