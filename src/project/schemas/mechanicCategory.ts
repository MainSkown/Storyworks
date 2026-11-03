import { z } from 'zod'

export const MECHANIC_CATEGORY_VERSION = 1

export const mechanicCategorySchema = z.strictObject({
  version: z.literal(MECHANIC_CATEGORY_VERSION),
  id: z.string(),
  name: z.string(),
  color: z.string(),
})

export type MechanicCategory = z.infer<typeof mechanicCategorySchema>
