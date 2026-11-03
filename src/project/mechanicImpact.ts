import { mechanicsFor } from '../game/mechanicLinks'
import type { Mechanic, MechanicLinkKind } from './schemas/mechanic'

/** Mechanics linking to the target; deleting it leaves them with a broken link (no cascade). */
export const mechanicLinkCount = (kind: MechanicLinkKind, id: string, all: readonly Mechanic[]): number =>
  mechanicsFor(kind, id, all).length
