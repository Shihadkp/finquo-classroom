// Wire shapes shared by server pages and client components (dates arrive as ISO strings).

export type ClassDTO = {
  id: string;
  title: string;
  mentorId: string;
  studentId: string;
  startAt: string;
  endAt: string;
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED";
  channelName: string;
  completedAt: string | null;
  notes: string | null;
  mentor: { id: string; name: string };
  student: { id: string; name: string };
  recording: { status: RecordingStatus; durationSec: number | null; error: string | null } | null;
  sessionId: string | null;
  session: { id: string; order: number; title: string } | null;
  studentJoinedAt: string | null;
  mentorJoinedAt: string | null;
};

export type RecordingStatus = "RECORDING" | "UPLOADED" | "PROCESSING" | "READY" | "FAILED";

/** Prisma rows → JSON-safe DTO (Dates to ISO). */
export function toDTO<T>(row: T): T extends object ? ClassDTO : never {
  return JSON.parse(JSON.stringify(row));
}
