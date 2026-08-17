-- Guardian pickup permission is security-sensitive. Historical rows received
-- this permission from the CP-33 default rather than from explicit consent,
-- so revoke it and require administrators to authorize pickup again.
ALTER TABLE "StudentGuardian"
ALTER COLUMN "canPickup" SET DEFAULT false;

UPDATE "StudentGuardian"
SET "canPickup" = false
WHERE "canPickup" = true;

-- AttendanceEvent and PickupRecord live in separate tables, so a normal
-- unique/check constraint cannot express their business-day mutual exclusion.
-- Both triggers use the same transaction-scoped advisory lock. This prevents
-- concurrent absence and pickup writes from both passing their pre-checks.
CREATE OR REPLACE FUNCTION "guardAttendanceAbsenceAgainstPickup"()
RETURNS trigger AS $$
DECLARE
  business_date date;
BEGIN
  IF NEW."type" <> 'absence' THEN
    RETURN NEW;
  END IF;

  business_date := (NEW."happenedAt" + INTERVAL '8 hours')::date;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(NEW."studentId" || ':' || business_date::text, 0)
  );

  IF EXISTS (
    SELECT 1
    FROM "PickupRecord"
    WHERE "studentId" = NEW."studentId"
      AND "serviceDate" = business_date::timestamp
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'ATTENDANCE_PICKUP_CONFLICT: student already has pickup activity for this business day';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "guardPickupAgainstAttendanceAbsence"()
RETURNS trigger AS $$
DECLARE
  business_date date;
BEGIN
  business_date := NEW."serviceDate"::date;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(NEW."studentId" || ':' || business_date::text, 0)
  );

  IF EXISTS (
    SELECT 1
    FROM "AttendanceEvent"
    WHERE "studentId" = NEW."studentId"
      AND "type" = 'absence'
      AND "happenedAt" >= business_date::timestamp - INTERVAL '8 hours'
      AND "happenedAt" < business_date::timestamp + INTERVAL '16 hours'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'ATTENDANCE_PICKUP_CONFLICT: student is absent for this business day';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AttendanceEvent_pickup_consistency"
BEFORE INSERT OR UPDATE OF "studentId", "type", "happenedAt"
ON "AttendanceEvent"
FOR EACH ROW
EXECUTE FUNCTION "guardAttendanceAbsenceAgainstPickup"();

CREATE TRIGGER "PickupRecord_attendance_consistency"
BEFORE INSERT OR UPDATE OF "studentId", "serviceDate"
ON "PickupRecord"
FOR EACH ROW
EXECUTE FUNCTION "guardPickupAgainstAttendanceAbsence"();
