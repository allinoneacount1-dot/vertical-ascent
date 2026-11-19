export type DistantIslandSpec = {
  id: string
  pos: [number, number, number]
  radius: number
  depth: number
  waterfallHeight: number
}

export const CLOUD_SEA_ALTITUDES = [135, 345] as const

/** 5 distant floating Laputa islands placed at outer radius 175-255 m (well clear of the climbing corridor). */
export const DISTANT_ISLANDS: readonly DistantIslandSpec[] = [
  { id: 'island-east-z2', pos: [195, 168, -40], radius: 22, depth: 28, waterfallHeight: 52 },
  { id: 'island-west-z2', pos: [-210, 195, 65], radius: 26, depth: 34, waterfallHeight: 60 },
  { id: 'island-north-z3', pos: [-45, 290, -225], radius: 30, depth: 38, waterfallHeight: 74 },
  { id: 'island-se-z3', pos: [170, 325, 145], radius: 24, depth: 30, waterfallHeight: 68 },
  { id: 'island-nw-z4', pos: [-165, 425, -165], radius: 28, depth: 36, waterfallHeight: 82 },
]

export const WORLD_VISTA_META = {
  villageHouses: 44,
  valleyTrees: 132,
  distantIslands: DISTANT_ISLANDS.length,
  circlingBirds: 22,
} as const
