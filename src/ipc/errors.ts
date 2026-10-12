/**
 * Errors returned by Rust commands are serialized as `{ kind, message }`
 * (see `src-tauri/src/error.rs`).
 */
export type AppErrorKind = "io" | "encoding" | "invalidPath" | "settings" | "internal";

export interface AppError {
  kind: AppErrorKind;
  message: string;
}

export function isAppError(value: unknown): value is AppError {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    "message" in value &&
    typeof (value as { message: unknown }).message === "string"
  );
}

/** Human-readable message for any thrown value. */
export function describeError(value: unknown): string {
  if (isAppError(value)) {
    return value.message;
  }
  if (value instanceof Error) {
    return value.message;
  }
  return String(value);
}
