---
description: "Manage MCP servers from the dsh Web client's Plugins page, including live status, restart, probe, and edits to configured entries."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-settings-mcp

English | [中文](README.zh.md)

## Summary

The page shows each managed server's transport, tool namespace, and live status. It lets users add, edit, enable, and delete configured entries, restart servers, and probe their available tools. Configuration changes go through the Host's `mcp-manager` namespace; servers registered only for another plugin's lifetime cannot be edited or removed here.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount this browser plugin in a Web composition that also serves the `mcp-manager` settings namespace.

### Minimal configuration

Add the client entry to the composition's `cordis.patch.yml`:

```yaml
plugins:
  - id: ui-settings-mcp
    name: '@deepseek-ai/dsh-client-ui-settings-mcp'
```

The package has no plugin-specific options; it edits `mcp-manager.servers` while that namespace is served by the Host.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

While the Host serves `mcp-manager`, the browser plugin registers a `plugins.item` page and watches `mcp-manager.servers` through the shared settings service. Its controller combines the last accepted settings record with the `mcpManager.watch` Remote stream, then orders the rows by server name.

Edits write the complete server record from the last accepted settings snapshot, preserving startup, tool-call, close, and reconnect settings the page does not edit. Configured entries can be enabled, edited, or deleted; plugin-owned runtime entries remain read-only apart from restart and probe.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [mcp-manager](../../mcp/mcp-manager/README.md) — Host settings, validation, server lifecycle, and Remote methods.
- [mcp-client](../../mcp/mcp-client/README.md) — MCP transports and tool registration.
- [ui-settings](../ui-settings/README.md) — the settings service and served-namespace lifetime.
- [ui-settings-plugins](../ui-settings-plugins/README.md) — the Plugins page and its tab slot.

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through the configured MCP servers whose registered tools contribute to model requests.

#### KV Cache effect

Changing the active server entries can change tool definitions in later requests and affect prefix reuse; this page does not rewrite earlier Session messages or send model requests.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Runtime-only servers are read-only here** — servers registered for another plugin's lifetime can be restarted or probed, but their configuration and lifetime remain with that plugin.
- **Advanced manager settings are preserved, not edited** — server startup, tool-call, and close timeouts plus reconnect policy survive entry edits, but the page does not expose controls for them.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
