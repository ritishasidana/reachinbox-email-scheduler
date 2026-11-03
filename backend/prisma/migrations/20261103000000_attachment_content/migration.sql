-- Store attachment contents in Postgres so the API (Render) and the worker (GitHub Actions) can both
-- read them. Additive only: existing rows keep their storagePath and stay readable; no data is changed.
ALTER TABLE "Attachment" ADD COLUMN "content" BYTEA;
ALTER TABLE "Attachment" ALTER COLUMN "storagePath" DROP NOT NULL;
