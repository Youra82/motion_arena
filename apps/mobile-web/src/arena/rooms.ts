export const ARENA_ROOMS = [
  { id: "loft", label: "Studio-Loft" },
  { id: "lebombo", label: "Lebombo" },
] as const;

export type ArenaRoom = (typeof ARENA_ROOMS)[number]["id"];

export function isArenaRoom(value: unknown): value is ArenaRoom {
  return ARENA_ROOMS.some(({ id }) => id === value);
}
