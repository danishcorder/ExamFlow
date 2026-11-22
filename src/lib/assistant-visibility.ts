// The site-wide assistant must never be reachable while a candidate is answering an exam.
const ASSISTANT_HIDDEN_PATH_PREFIXES = ['/app/exam-session', '/demo-exam'] as const;

export function isAssistantHiddenOn(pathname: string): boolean {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return ASSISTANT_HIDDEN_PATH_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}
