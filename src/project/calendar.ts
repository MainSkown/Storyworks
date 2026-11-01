import { gregorianCalendar } from '../calendar/gregorian'
import { calendarSchema, type Calendar } from '../calendar/schema'
import { parseFile } from './serialize'
import type { Env, FileError, OpenProject } from './types'

export const CALENDAR_FILE = 'calendar.json'

export type CalendarWarning =
  { kind: 'missing'; path: string } | { kind: 'invalid'; path: string; error: FileError }

export interface LoadedCalendar {
  calendar: Calendar
  /** 'fallback' = Gregorian in memory; the file on disk is never touched by loading. */
  source: 'file' | 'fallback'
  /** Set when a listed calendar could not be used. */
  warning?: CalendarWarning
}

/** Reads the listed calendar.json; falls back to Gregorian (with a warning) when it is missing or invalid. */
export async function loadCalendar(project: OpenProject): Promise<LoadedCalendar> {
  const ref = project.manifest.calendar
  if (!ref) return { calendar: gregorianCalendar('gregorian'), source: 'fallback' }
  const fallback = gregorianCalendar(ref.id)
  const text = await project.io.readText(ref.path)
  if (text === null) {
    return { calendar: fallback, source: 'fallback', warning: { kind: 'missing', path: ref.path } }
  }
  const r = parseFile(calendarSchema, text, ref.path)
  if (r.ok) return { calendar: r.value, source: 'file' }
  return {
    calendar: fallback,
    source: 'fallback',
    warning: { kind: 'invalid', path: ref.path, error: r.error },
  }
}

/**
 * Creates a Gregorian calendar.json and lists it when the manifest has no calendar.
 * Does nothing when read-only, when a calendar is already listed, or when an unlisted calendar.json exists.
 */
export async function ensureCalendar(project: OpenProject, env: Env): Promise<void> {
  if (project.readOnly || project.manifest.calendar) return
  if (await project.io.exists(CALENDAR_FILE)) return
  const calendar = gregorianCalendar(
    env.newId(),
    project.manifest.language.startsWith('pl') ? 'pl' : 'en',
  )
  await project.saveItem(CALENDAR_FILE, calendarSchema, calendar)
  project.manifest.calendar = { id: calendar.id, path: CALENDAR_FILE }
  await project.saveManifest()
}

/** Writes only the calendar file. Throws when nothing is listed, the project is read-only, or the value is invalid. */
export async function saveCalendar(project: OpenProject, calendar: Calendar): Promise<void> {
  const ref = project.manifest.calendar
  if (!ref) throw new Error('No calendar is listed in project.json')
  await project.saveItem(ref.path, calendarSchema, calendar)
}
