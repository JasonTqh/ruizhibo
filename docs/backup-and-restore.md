# 备份与恢复

本项目使用 Docker Compose 运行测试/生产化环境时，数据库位于 `postgres_data` 卷，local 文件存储位于 `uploads_data` 卷。Docker 镜像可以重新构建，但删除卷会丢失业务数据，因此备份必须保存在 Docker 卷之外。

## 1. 备份内容

`pnpm backup:deployment` 会为每次备份创建独立时间戳目录，其中包含：

```text
backups/ruizhibo-YYYYMMDD-HHmmss/
  backup.json
  database.dump
  uploads.tar.gz
```

- `database.dump`：PostgreSQL custom format 转储，可由 `pg_restore` 校验和恢复。
- `uploads.tar.gz`：仅在 `FILE_STORAGE_DRIVER=local` 时生成。
- `backup.json`：记录创建时间、Git 版本、存储驱动、文件大小和 SHA-256。

备份目录已被 `.gitignore` 忽略，不应提交到 Git。正式环境还应将备份同步到另一台设备或受控对象存储，避免单机故障同时损坏源数据和备份。

## 2. 创建备份

先确保 `deploy/.env` 已配置，且 Compose 中的 `db` 服务正在运行：

```powershell
docker compose --env-file deploy/.env -f deploy/docker-compose.test.yml ps
pnpm backup:deployment
```

指定备份位置：

```powershell
pnpm backup:deployment -- -OutputDirectory D:\ruizhibo-backups
```

只校验 Compose 和环境文件，不生成备份：

```powershell
pnpm backup:deployment -- -ValidateOnly
```

如果已由存储平台单独备份 local 上传目录，可显式跳过：

```powershell
pnpm backup:deployment -- -SkipUploads
```

## 3. 校验备份

恢复脚本默认可以只做非写入校验，会检查清单版本、文件大小和 SHA-256：

```powershell
pnpm restore:deployment -- `
  -BackupDirectory backups\ruizhibo-20260813-120000 `
  -ValidateOnly
```

备份文件不完整、意外损坏或与清单不一致时，校验会失败，不会进入恢复流程。SHA-256 用于完整性校验，不代替备份访问控制或数字签名。

## 4. 恢复

恢复会清理并覆盖目标数据库，所以必须显式传入 `-ConfirmRestore`：

```powershell
pnpm restore:deployment -- `
  -BackupDirectory backups\ruizhibo-20260813-120000 `
  -ConfirmRestore
```

执行顺序：

1. 校验 Compose 配置、备份清单、文件大小和 SHA-256。
2. 默认把当前数据再备份到 `backups/pre-restore`。
3. 验证 `pg_restore` 和上传文件归档可读。
4. 如果 API 正在运行，先停止 API，恢复完成后再重新启动。
5. 恢复数据库；local 模式下同时替换上传目录。

仅在已经手动创建当前环境备份时，才可使用 `-SkipSafetyBackup`。仅恢复数据库时可使用 `-SkipUploads`。

## 5. S3/COS/OSS 存储

当 `FILE_STORAGE_DRIVER=s3` 时，脚本仅备份数据库中的文件元数据，不会从远程桶下载对象。测试/生产桶必须另外配置：

- 桶版本控制或云平台定时快照。
- 与数据库备份相同或更长的保留周期。
- 受控的跨桶或跨地域复制。
- 至少每季度执行一次数据库与对象文件的联合恢复演练。

## 6. 运维建议

- 每日至少一次自动备份，重要发布前手动再备份一次。
- 建议保留 7 份日备份、4 份周备份和 6 份月备份。
- 定时任务只调用备份脚本，不要在未人工确认时调用恢复脚本。
- 每次备份后应保留任务退出码，并定期用 `-ValidateOnly` 检查备份。
- 恢复后运行 `pnpm verify:deployment` 和必要的教师/家长 API 验证。
