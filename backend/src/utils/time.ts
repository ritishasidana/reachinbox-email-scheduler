export const HOUR_MS = 3_600_000;

/** Hour buckets are UTC epoch hours, so every app instance agrees on bucket boundaries. */
export const hourBucketOf = (epochMs: number): number => Math.floor(epochMs / HOUR_MS);
export const bucketStartMs = (bucket: number): number => bucket * HOUR_MS;
