BEGIN;

-- Create the replacement constraints before dropping the stricter old ones.
-- Existing IDs, passwords, bindings, permissions and business relations stay intact.
CREATE UNIQUE INDEX "User_role_phone_key" ON "User"("role", "phone");
CREATE UNIQUE INDEX "User_role_wechatOpenid_key" ON "User"("role", "wechatOpenid");
DROP INDEX "User_phone_key";
DROP INDEX "User_wechatOpenid_key";

COMMIT;
