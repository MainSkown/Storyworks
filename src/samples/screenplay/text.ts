/** Story text for the sample screenplay; structure and ids live in build.ts. */
import type { SampleLang } from '../text'
import type { ElementType } from '../../editor/screenplay/rules'

/** [element, text]; headings, cues and transitions are written in capitals. */
export type El = [ElementType, string]

export interface ScreenplaySceneText {
  title: string
  synopsis: string
  els: El[]
}

export interface ScreenplayEntryText {
  name: string
  aliases: string[]
  notes: string
  appendix: string
}

export interface ScreenplayText {
  title: string
  author: string
  contact: string
  date: string
  sequences: string[]
  scenes: Record<string, ScreenplaySceneText>
  entries: Record<'anna' | 'marek' | 'driver' | 'stop', ScreenplayEntryText>
  nodes: Record<'n1' | 'n2', { title: string; note: string }>
  /** Margin comment, attached to the dialogue line of scene s3 that starts with `commentOn`. */
  comment: { on: string; text: string }
}

const en: ScreenplayText = {
  title: 'The Last Bus',
  author: 'Storyworks sample',
  contact: 'hello@example.com',
  date: '1 November 2026',
  sequences: ['Waiting', 'On the Road'],
  scenes: {
    s1: {
      title: 'The Timetable',
      synopsis: 'Anna waits alone at the stop.',
      els: [
        ['sceneHeading', 'EXT. MILL ROAD STOP - NIGHT'],
        ['action', 'Rain drums on the bus shelter. ANNA (30s) sits on her suitcase and reads the timetable for the third time.'],
        ['action', 'A streetlight flickers. Somewhere a dog barks, then stops.'],
      ],
    },
    s2: {
      title: 'A Familiar Car',
      synopsis: 'Her brother finds her before the bus comes.',
      els: [
        ['sceneHeading', 'EXT. MILL ROAD STOP - LATER'],
        ['action', 'Headlights. A battered hatchback stops at the kerb. MAREK (30s) gets out without an umbrella.'],
        ['character', 'MAREK'],
        ['dialogue', 'You said you would leave without telling anyone.'],
        ['character', 'ANNA'],
        ['parenthetical', '(not looking up)'],
        ['dialogue', 'I left a note.'],
        ['character', 'MAREK'],
        ['dialogue', 'On the fridge. Under a magnet.'],
      ],
    },
    s3: {
      title: 'The Key',
      synopsis: 'Marek offers the key to their mother\'s house.',
      els: [
        ['sceneHeading', 'EXT. MILL ROAD STOP - LATER'],
        ['action', 'Marek holds out a small brass key.'],
        ['character', 'MAREK'],
        ['dialogue', 'Mum\'s house. It is yours as much as mine.'],
        ['character', 'ANNA'],
        ['dialogue', 'I do not want it.'],
        ['character', 'MAREK'],
        ['dialogue', 'Then keep it for someone who does.'],
        ['action', 'Anna takes the key without a word. A bus swings out of the dark.'],
        ['transition', 'CUT TO:'],
      ],
    },
    s4: {
      title: 'Last Stop',
      synopsis: 'Anna boards. The driver warns her there is nothing at the end.',
      els: [
        ['sceneHeading', 'INT. NIGHT BUS - NIGHT'],
        ['action', 'Empty seats, wet windows. Anna pays and sits at the back.'],
        ['character', 'DRIVER'],
        ['dialogue', 'Where to?'],
        ['character', 'ANNA'],
        ['dialogue', 'The end of the line.'],
        ['character', 'DRIVER'],
        ['dialogue', 'That is forty minutes. There is nothing there.'],
        ['character', 'ANNA'],
        ['parenthetical', '(quietly)'],
        ['dialogue', 'I know.'],
      ],
    },
    s5: {
      title: 'The Empty Stop',
      synopsis: 'Marek stays behind and finds her note.',
      els: [
        ['sceneHeading', 'EXT. MILL ROAD STOP - NIGHT'],
        ['action', 'The red lights of the bus fade into the fog. Marek stands alone, hands in his pockets.'],
        ['action', 'He sits where Anna sat. Under the bench lies a folded note: "Back on Sunday."'],
      ],
    },
    s6: {
      title: 'End of the Line',
      synopsis: 'Dawn. Anna wakes with the key in her hand.',
      els: [
        ['sceneHeading', 'INT. NIGHT BUS - DAWN'],
        ['action', 'Anna sleeps against the window, the key in her fist. The bus slows.'],
        ['character', 'DRIVER'],
        ['dialogue', 'End of the line.'],
        ['character', 'ANNA'],
        ['dialogue', 'Already?'],
        ['transition', 'FADE OUT.'],
      ],
    },
  },
  entries: {
    anna: { name: 'Anna', aliases: ['Ann'], notes: 'Thirty, quiet, travels light. Leaving a town she grew up in.', appendix: 'The traveller.' },
    marek: { name: 'Marek', aliases: [], notes: 'Anna\'s older brother. Practical, never says what he feels.', appendix: 'Her brother.' },
    driver: { name: 'Driver', aliases: ['Bus driver'], notes: 'Drives the night bus on the same route for years.', appendix: 'The night bus driver.' },
    stop: { name: 'Mill Road Stop', aliases: [], notes: 'A bus shelter at the edge of town. One bench, one streetlight.', appendix: 'The bus stop.' },
  },
  nodes: {
    n1: { title: 'Anna and Marek at the stop', note: 'The evening before she leaves.' },
    n2: {
      title: 'The last bus leaves',
      note: 'Deliberate mistake: this event is dated before the one it follows, so the Checks page shows one warning. Change the date to clear it.',
    },
  },
  comment: { on: 'Mum\'s house.', text: 'Too blunt? Maybe he should only hold the key out and say nothing.' },
}

const pl: ScreenplayText = {
  title: 'Ostatni autobus',
  author: 'Przykład Storyworks',
  contact: 'hello@example.com',
  date: '1 listopada 2026',
  sequences: ['Czekanie', 'W drodze'],
  scenes: {
    s1: {
      title: 'Rozkład jazdy',
      synopsis: 'Anna czeka samotnie na przystanku.',
      els: [
        ['sceneHeading', 'EXT. PRZYSTANEK MŁYŃSKA - NOC'],
        ['action', 'Deszcz bębni w dach wiaty. ANNA (około trzydziestki) siedzi na walizce i po raz trzeci czyta rozkład jazdy.'],
        ['action', 'Latarnia mruga. Gdzieś szczeka pies, po chwili cichnie.'],
      ],
    },
    s2: {
      title: 'Znajomy samochód',
      synopsis: 'Brat odnajduje ją, zanim przyjedzie autobus.',
      els: [
        ['sceneHeading', 'EXT. PRZYSTANEK MŁYŃSKA - PÓŹNIEJ'],
        ['action', 'Światła reflektorów. Sfatygowany hatchback staje przy krawężniku. MAREK (około trzydziestki) wysiada bez parasola.'],
        ['character', 'MAREK'],
        ['dialogue', 'Mówiłaś, że wyjedziesz bez słowa.'],
        ['character', 'ANNA'],
        ['parenthetical', '(nie podnosząc wzroku)'],
        ['dialogue', 'Zostawiłam kartkę.'],
        ['character', 'MAREK'],
        ['dialogue', 'Na lodówce. Pod magnesem.'],
      ],
    },
    s3: {
      title: 'Klucz',
      synopsis: 'Marek podaje klucz do domu mamy.',
      els: [
        ['sceneHeading', 'EXT. PRZYSTANEK MŁYŃSKA - PÓŹNIEJ'],
        ['action', 'Marek wyciąga rękę z małym mosiężnym kluczem.'],
        ['character', 'MAREK'],
        ['dialogue', 'Dom mamy. Jest twój tak samo jak mój.'],
        ['character', 'ANNA'],
        ['dialogue', 'Nie chcę go.'],
        ['character', 'MAREK'],
        ['dialogue', 'To zachowaj go dla kogoś, kto będzie chciał.'],
        ['action', 'Anna bierze klucz bez słowa. Z ciemności wyjeżdża autobus.'],
        ['transition', 'CIĘCIE DO:'],
      ],
    },
    s4: {
      title: 'Koniec trasy?',
      synopsis: 'Anna wsiada. Kierowca ostrzega, że na końcu nic nie ma.',
      els: [
        ['sceneHeading', 'INT. AUTOBUS NOCNY - NOC'],
        ['action', 'Puste siedzenia, mokre szyby. Anna płaci i siada z tyłu.'],
        ['character', 'KIEROWCA'],
        ['dialogue', 'Dokąd?'],
        ['character', 'ANNA'],
        ['dialogue', 'Na koniec trasy.'],
        ['character', 'KIEROWCA'],
        ['dialogue', 'To czterdzieści minut. Tam nic nie ma.'],
        ['character', 'ANNA'],
        ['parenthetical', '(cicho)'],
        ['dialogue', 'Wiem.'],
      ],
    },
    s5: {
      title: 'Pusty przystanek',
      synopsis: 'Marek zostaje i znajduje jej kartkę.',
      els: [
        ['sceneHeading', 'EXT. PRZYSTANEK MŁYŃSKA - NOC'],
        ['action', 'Czerwone światła autobusu znikają we mgle. Marek stoi sam, z rękami w kieszeniach.'],
        ['action', 'Siada tam, gdzie siedziała Anna. Pod ławką leży złożona kartka: „Wracam w niedzielę."'],
      ],
    },
    s6: {
      title: 'Ostatni przystanek',
      synopsis: 'Świt. Anna budzi się z kluczem w dłoni.',
      els: [
        ['sceneHeading', 'INT. AUTOBUS NOCNY - ŚWIT'],
        ['action', 'Anna śpi oparta o szybę, z kluczem w pięści. Autobus zwalnia.'],
        ['character', 'KIEROWCA'],
        ['dialogue', 'Koniec trasy.'],
        ['character', 'ANNA'],
        ['dialogue', 'Już?'],
        ['transition', 'ŚCIEMNIENIE.'],
      ],
    },
  },
  entries: {
    anna: { name: 'Anna', aliases: ['Ania'], notes: 'Trzydzieści lat, małomówna, podróżuje lekko. Opuszcza miasto, w którym dorastała.', appendix: 'Podróżna.' },
    marek: { name: 'Marek', aliases: [], notes: 'Starszy brat Anny. Praktyczny, nigdy nie mówi, co czuje.', appendix: 'Jej brat.' },
    driver: { name: 'Kierowca', aliases: ['Kierowca autobusu'], notes: 'Od lat jeździ nocnym autobusem tą samą trasą.', appendix: 'Kierowca nocnego autobusu.' },
    stop: { name: 'Przystanek Młyńska', aliases: [], notes: 'Wiata na skraju miasta. Jedna ławka, jedna latarnia.', appendix: 'Przystanek autobusowy.' },
  },
  nodes: {
    n1: { title: 'Anna i Marek na przystanku', note: 'Wieczór przed jej wyjazdem.' },
    n2: {
      title: 'Ostatni autobus odjeżdża',
      note: 'Celowy błąd: to zdarzenie ma datę wcześniejszą niż to, po którym następuje, więc strona Kontrole pokazuje jedno ostrzeżenie. Zmień datę, aby je usunąć.',
    },
  },
  comment: { on: 'Dom mamy.', text: 'Za wprost? Może niech tylko poda klucz i nic nie mówi.' },
}

export const SCREENPLAY_TEXT: Record<SampleLang, ScreenplayText> = { en, pl }
