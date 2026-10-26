export type PomodoroSession = {
  version: 1;
  sessionId: string;
  taskId: number | null;
  status: "running" | "paused" | "pending";
  secondsLeft: number;
  endsAt: number | null;
  updatedAt: number;
};

const COOKIE_NAME = "life-workbench-pomodoro";
const MAX_SECONDS = 25 * 60;
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isSession(value: unknown): value is PomodoroSession {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<PomodoroSession>;
  return session.version === 1 &&
    typeof session.sessionId === "string" && UUID_PATTERN.test(session.sessionId) &&
    (session.taskId === null || (Number.isInteger(session.taskId) && Number(session.taskId) > 0)) &&
    ["running", "paused", "pending"].includes(String(session.status)) &&
    Number.isInteger(session.secondsLeft) && Number(session.secondsLeft) >= 0 && Number(session.secondsLeft) <= MAX_SECONDS &&
    Number.isFinite(session.updatedAt) &&
    (session.status === "running" ? Number.isFinite(session.endsAt) : session.endsAt === null) &&
    (session.status !== "pending" || session.secondsLeft === 0);
}

export function readPomodoroSession(): PomodoroSession | null {
  const encoded = document.cookie.split("; ").find((item) => item.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1);
  if (!encoded) return null;
  try {
    const value: unknown = JSON.parse(decodeURIComponent(encoded));
    if (!isSession(value)) {
      clearPomodoroSession();
      return null;
    }
    const age = Date.now() - value.updatedAt;
    if (age > MAX_AGE_SECONDS * 1000 || (value.status === "running" && age > 24 * 60 * 60 * 1000)) {
      clearPomodoroSession();
      return null;
    }
    return value;
  } catch {
    clearPomodoroSession();
    return null;
  }
}

export function savePomodoroSession(session: PomodoroSession) {
  if (!isSession(session)) return;
  const value = encodeURIComponent(JSON.stringify({ ...session, updatedAt: Date.now() }));
  document.cookie = `${COOKIE_NAME}=${value}; Path=/; Max-Age=${MAX_AGE_SECONDS}; SameSite=Lax`;
}

export function clearPomodoroSession() {
  document.cookie = `${COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax`;
}
