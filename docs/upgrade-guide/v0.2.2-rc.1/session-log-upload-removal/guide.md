---
kind: upgrade-guide
description: "The DeepSeek Session-log upload packages, request field, settings row, and settings key are removed."
---

# DeepSeek Session-log upload removal

English | [中文](guide.zh.md)

## Change

The harness no longer uploads the canonical Session log with DeepSeek model requests:

- The packages `@deepseek-ai/dsh-session-log-deepseek` and `@deepseek-ai/dsh-client-ui-settings-session-log` are deleted, along with the `ctx.sessionLogDeepSeek` service.
- `dsh-llm-deepseek` no longer contributes the `dsh_session_log` request field; the `dsh_plugin_packages` field is unchanged.
- The Web **Settings → General → Upload Session Log when using the official model API** row is gone, and the `session-log-deepseek` settings key no longer exists.
- Feedback is recorded in the Session log only; nothing uploads it.
- Sessions whose log already contains `session-log-deepseek/delivery-accepted` still load: the event stays declared in `SessionEventMap` so the read path accepts recorded logs, and no new event of that type is appended.

## Migration

1. Remove `session-log-deepseek` rows and their `enabled` configuration from custom `cordis.yml` files, overlays, and home patches. Loading fails loud on an unresolvable row.
2. Delete any stored `session-log-deepseek` setting. General settings no longer exposes it, and a stored value has no effect.
3. Remove `ctx.sessionLogDeepSeek.registerExclusion()` calls and injections from custom plugins; the service is gone.
4. Stop expecting `dsh_session_log` in DeepSeek request bodies; `dsh_plugin_packages` remains.
5. Confirm the upgrade with `dsh --profile web` (or your profile): the process must boot, and General settings must show no Session-log upload row.
