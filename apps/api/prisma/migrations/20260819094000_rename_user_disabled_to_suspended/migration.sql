-- Postgres supports renaming an enum value directly (PG10+), preserving
-- existing rows and avoiding any DROP/CREATE TYPE dance.
ALTER TYPE "UserStatus" RENAME VALUE 'DISABLED' TO 'SUSPENDED';
