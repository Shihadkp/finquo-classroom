export const programInclude = { sessions: { orderBy: { order: "asc" as const } }, _count: { select: { students: true } } };

export type ProgramDTO = {
  id: string;
  name: string;
  sessions: { id: string; order: number; title: string }[];
  _count: { students: number };
};
