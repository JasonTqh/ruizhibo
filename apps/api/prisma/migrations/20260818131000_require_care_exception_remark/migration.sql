ALTER TABLE "StudentCareRecord"
ADD CONSTRAINT "StudentCareRecord_exception_remark_required_check"
CHECK (
  "type" <> 'exception'
  OR (
    "remark" IS NOT NULL
    AND length(btrim("remark")) > 0
  )
);
