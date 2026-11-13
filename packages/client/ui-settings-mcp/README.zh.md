---
description: "在 dsh Web 客户端的插件页管理 MCP 服务器，包括实时状态、重启、探测和已配置条目的增删改。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-settings-mcp

[English](README.md) | 中文

## 概述

此页显示每台受管服务器的传输方式、工具命名空间和实时状态。用户可以添加、编辑、启用和删除已配置条目，重启服务器并探测其可用工具。配置变更通过 Host 的 `mcp-manager` 命名空间进行；仅在其他插件生命周期内注册的服务器不能在此编辑或删除。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在同时服务 `mcp-manager` 设置命名空间的 Web 组合中挂载此浏览器插件。

### 最小配置

将客户端条目添加到组合的 `cordis.patch.yml`：

```yaml
plugins:
  - id: ui-settings-mcp
    name: '@deepseek-ai/dsh-client-ui-settings-mcp'
```

本包没有插件专属选项；Host 服务该命名空间期间，本页会编辑 `mcp-manager.servers`。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

Host 服务 `mcp-manager` 时，浏览器插件会注册 `plugins.item` 页面，并通过共享设置服务监视 `mcp-manager.servers`。其控制器将最近接受的设置记录与 `mcpManager.watch` Remote 流合并，再按服务器名称排列条目。

编辑会根据最近接受的设置快照写入完整服务器记录，并保留页面不会编辑的启动、工具调用、关闭和重连设置。已配置条目可启用、编辑或删除；由插件持有生命周期的条目保持只读，仅可重启或探测。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [mcp-manager](../../mcp/mcp-manager/README.zh.md)——Host 设置、校验、服务器生命周期和 Remote 方法。
- [mcp-client](../../mcp/mcp-client/README.zh.md)——MCP 传输方式与工具注册。
- [ui-settings](../ui-settings/README.zh.md)——设置服务与命名空间的服务生命周期。
- [ui-settings-plugins](../ui-settings-plugins/README.zh.md)——插件页及其标签 slot。

-----

<a id="model-experience"></a>
## Model Experience

间接通过已配置的 MCP 服务器；这些服务器注册的工具会进入模型请求。

#### KV Cache effect

更改存活服务器条目可能改变后续请求的工具定义并影响前缀复用；本页不会改写较早的 Session 消息，也不会发送模型请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **运行时条目在此为只读**——由其他插件持有生命周期的服务器可以重启或探测，但其配置与生命周期仍由该插件管理。
- **高级管理器设置会保留，但不能编辑**——条目编辑会保留服务器启动、工具调用和关闭超时及重连策略，但本页不提供修改这些设置的控件。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

无。

</details>
