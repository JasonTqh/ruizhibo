# 服务器访问记录

本项目当前使用以下远程服务器作为运维目标：

| 项目 | 值 |
| --- | --- |
| SSH 地址 | `146.56.205.133` |
| SSH 用户 | `ubuntu` |
| 远程主机名 | `VM-0-2-ubuntu` |
| 默认工作目录 | `/home/ubuntu` |
| 项目部署目录 | `/home/ubuntu/ruizhibo` |
| 本机身份文件 | `%USERPROFILE%\.ssh\ruizhibo-ubuntu.pem` |

## 连接命令

Windows PowerShell：

```powershell
ssh -i "$env:USERPROFILE\.ssh\ruizhibo-ubuntu.pem" `
  -o IdentitiesOnly=yes `
  ubuntu@146.56.205.133
```

非交互式运维命令：

```powershell
ssh -i "$env:USERPROFILE\.ssh\ruizhibo-ubuntu.pem" `
  -o IdentitiesOnly=yes `
  -o BatchMode=yes `
  ubuntu@146.56.205.133 "<command>"
```

## 主机身份

首次记录于 2026-10-14，已验证登录成功。已知主机公钥指纹：

- ED25519：`SHA256:Zc8qJDBnOaDh2iF91MINCzFPG/73dTLuX+TknGSomuk`
- RSA：`SHA256:b7D1DLo9RfQWE9y7BHTY01B9Y1hYfURpavjDTa1xs/M`
- ECDSA：`SHA256:zMQxbfqXgaJBXu6Xz9qa+kTSnQvdPgp20E4Y1iqv3WI`

主机密钥发生变化时，应先通过云平台控制台核实，不要直接删除 `known_hosts` 记录并接受新密钥。

## 安全约定

- 私钥仅保存在本机用户的 `.ssh` 目录，不复制到项目、不提交 Git。
- 项目中只记录非敏感的主机、用户、目录和公钥指纹。
- 未经用户明确要求，不执行生产部署、数据库写入、服务重启、删除、覆盖或其他破坏性操作。
- 远程操作前先读取状态；涉及发布或数据变更时按 `docs/test-environment-deployment.md`、`docs/release-verification.md` 和备份恢复文档执行。
- 不在命令输出、日志或文档中记录密码、令牌、AppSecret、数据库连接密钥或私钥内容。

