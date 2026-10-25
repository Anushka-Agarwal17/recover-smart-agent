// Error reporting ΓÇö Lovable hooks removed, errors are logged to the console only.
export function reportLovableError(error: unknown, context: Record<string, unknown> = {}) {
  console.error("[RecoverAI error]", error, context);
}
