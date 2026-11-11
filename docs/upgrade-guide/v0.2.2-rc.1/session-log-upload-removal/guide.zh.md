---
kind: upgrade-guide
description: "移除 DeepSeek 会话日志上传的包、请求字段、设置项与设置键。"
---

# 移除 DeepSeek 会话日志上传

[English](guide.md) | 中文

## 变更

Harness 不再随 DeepSeek 模型请求上传权威会话日志：

- 包 `@deepseek-ai/dsh-session-log-deepseek` 与 `@deepseek-ai/dsh-client-ui-settings-session-log` 已删除，它们提供的 `ctx.sessionLogDeepSeek` 服务一并移除。
- `dsh-llm-deepseek` 不再贡献 `dsh_session_log` 请求字段；`dsh_plugin_packages` 字段不变。
- Web 的**设置 → 通用 → 在使用官方模型 API 时上传 Session Log**行已移除，`session-log-deepseek` 设置键不再存在。
- 反馈只记录在会话日志中，没有任何上传。
- 日志中已包含 `session-log-deepseek/delivery-accepted` 的 Session 仍可加载：该事件继续声明在 `SessionEventMap` 中，以便读取已记录的日志，且不会再追加该类型的新事件。

## 迁移

1. 从自定义 `cordis.yml`、overlay 和 home patch 中删除 `session-log-deepseek` 行及其 `enabled` 配置。加载时遇到无法解析的行会直接失败。
2. 删除已存储的 `session-log-deepseek` 设置。通用设置页面不再显示它，存储的值也不再生效。
3. 从自定义插件中移除 `ctx.sessionLogDeepSeek.registerExclusion()` 调用与注入；该服务已移除。
4. 不要再期望 DeepSeek 请求体中包含 `dsh_session_log`；`dsh_plugin_packages` 仍然保留。
5. 用 `dsh --profile web`（或你的 profile）确认升级：进程必须正常启动，且通用设置中不得显示会话日志上传行。
