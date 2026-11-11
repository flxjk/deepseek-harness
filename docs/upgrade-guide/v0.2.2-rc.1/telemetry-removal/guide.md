---
kind: upgrade-guide
description: "OpenTelemetry and product-analytics packages, profile rows, environment switches, and the DeepSeek request user-id header are removed."
---

# Telemetry removal

English | [中文](guide.zh.md)

## Change

The harness no longer collects or exports telemetry:

- The packages `@deepseek-ai/dsh-otel`, `@deepseek-ai/dsh-session-telemetry`, `@deepseek-ai/dsh-session-telemetry-otel`, `@deepseek-ai/dsh-host-product-telemetry-otel`, and `@deepseek-ai/dsh-client-product-analytics` are deleted, along with the `ctx.otel`, `ctx.sessionTelemetry`, `ctx.productTelemetry`, and `ctx.productAnalytics` services they provided.
- The shipped `dsh-base` profile no longer mounts the `otel` and `session-telemetry-otel` rows, and `dsh-web-app` no longer mounts `desktop-product-telemetry` and `product-analytics`.
- `DSH_TELEMETRY_DISABLED`, `DSH_TELEMETRY_MODE`, `DSH_TELEMETRY_OTLP_URL`, and `DSH_PRODUCT_ANALYTICS_OTLP_URL` are no longer read; no code path sends records to an OTLP endpoint.
- `@deepseek-ai/dsh-app-boot` no longer exports `resolveTelemetryPatch`, and `ProfileContext` no longer carries `telemetryDisabledEnv`.
- `dsh-llm-deepseek` no longer sends the `x-deepseek-harness-user-id` request header. `x-deepseek-harness-session-id` is unchanged.
- The DeepSeek Session-log upload (`dsh_session_log`) is also removed in this release; see [Session-log upload removal](../session-log-upload-removal/guide.md).

## Migration

1. Delete the four environment variables from launchers, CI workflows, container definitions, and shell profiles. Confirm with `env | grep DSH_TELEMETRY` and `env | grep DSH_PRODUCT_ANALYTICS`, which must print nothing.
2. Remove custom `cordis.yml` rows, overlays, and home patches that name a deleted package or disable a deleted row id. Loading now fails loud on an unresolvable row.
3. Remove calls to `resolveTelemetryPatch` and reads of `ctx.profileContext.telemetryDisabledEnv`; both are gone from the published types.
4. In custom plugins, drop `ctx.otel`, `ctx.sessionTelemetry`, `ctx.productTelemetry`, and `ctx.productAnalytics` injections, listeners, and `emit`/`report` calls.
5. Delete local `.anonymous-user-id` handling that only fed telemetry. The file itself stays: `/feedback` still records it.
6. Confirm the upgrade with `dsh --profile web` (or your profile): the process must boot, and `dsh plugin-manager` must list no telemetry row.
