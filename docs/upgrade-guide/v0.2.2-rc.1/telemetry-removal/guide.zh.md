---
kind: upgrade-guide
description: "移除 OpenTelemetry 与产品埋点包、profile 行、环境开关，以及 DeepSeek 请求的 user-id 标头。"
---

# 移除遥测

[English](guide.md) | 中文

## 变更

Harness 不再采集或导出遥测数据：

- 包 `@deepseek-ai/dsh-otel`、`@deepseek-ai/dsh-session-telemetry`、`@deepseek-ai/dsh-session-telemetry-otel`、`@deepseek-ai/dsh-host-product-telemetry-otel` 和 `@deepseek-ai/dsh-client-product-analytics` 已删除，它们提供的 `ctx.otel`、`ctx.sessionTelemetry`、`ctx.productTelemetry`、`ctx.productAnalytics` 服务一并移除。
- 随附的 `dsh-base` profile 不再挂载 `otel` 与 `session-telemetry-otel` 行，`dsh-web-app` 不再挂载 `desktop-product-telemetry` 与 `product-analytics`。
- `DSH_TELEMETRY_DISABLED`、`DSH_TELEMETRY_MODE`、`DSH_TELEMETRY_OTLP_URL` 和 `DSH_PRODUCT_ANALYTICS_OTLP_URL` 不再被读取；没有任何代码路径向 OTLP 端点发送记录。
- `@deepseek-ai/dsh-app-boot` 不再导出 `resolveTelemetryPatch`，`ProfileContext` 不再包含 `telemetryDisabledEnv`。
- `dsh-llm-deepseek` 不再发送 `x-deepseek-harness-user-id` 请求标头。`x-deepseek-harness-session-id` 不变。
- DeepSeek 会话日志上传（`dsh_session_log`）也在本版本中移除；参见[移除会话日志上传](../session-log-upload-removal/guide.zh.md)。

## 迁移

1. 从启动器、CI 工作流、容器定义和 shell 配置中删除这四个环境变量。用 `env | grep DSH_TELEMETRY` 和 `env | grep DSH_PRODUCT_ANALYTICS` 确认，输出必须为空。
2. 删除自定义 `cordis.yml`、overlay 和 home patch 中指向已删除包或禁用已删除行 id 的行。加载时遇到无法解析的行会直接失败。
3. 删除对 `resolveTelemetryPatch` 的调用和对 `ctx.profileContext.telemetryDisabledEnv` 的读取；二者已从发布的类型中移除。
4. 在自定义插件中，移除 `ctx.otel`、`ctx.sessionTelemetry`、`ctx.productTelemetry` 和 `ctx.productAnalytics` 的注入、监听和 `emit`/`report` 调用。
5. 删除只为遥测服务的本地 `.anonymous-user-id` 处理。该文件本身保留：`/feedback` 仍会记录它。
6. 用 `dsh --profile web`（或你的 profile）确认升级：进程必须正常启动，且 `dsh plugin-manager` 不再列出遥测行。
