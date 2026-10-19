export const DEFAULT_RECENT_COUNT = 50;

/** Parses the recents preference, falling back to the default for invalid values. */
export function resolveRecentCount(value: string | undefined | null): number {
  // Preferences are strings; treat missing, zero, and negative values as the default.
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_RECENT_COUNT;
}
