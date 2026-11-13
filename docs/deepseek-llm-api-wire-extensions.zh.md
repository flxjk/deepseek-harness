# DeepSeek 官方 LLM API 协议扩展

[English](deepseek-llm-api-wire-extensions.md) | 中文

本参考定义 [`@deepseek-ai/dsh-llm-deepseek`](../packages/llm/llm-deepseek/README.zh.md) 在 `deepseek-official` Messages 请求中发送的全部 DeepSeek Harness 专用 HTTP 标头与附加 JSON 字段。它不重新定义上游 DeepSeek API 自有字段。提供方无关的 LLM 接口与 `llm-pi-ai` 不实现这些扩展。

适配器将这些扩展发送至已解析的 `baseURL`，包括已配置的网关。扩展位于 `messages`、系统提示词和工具 schema 之外，因此不会增加模型输入 token，也不会改变模型可见前缀。

## 协议命名空间与版本

| 位置 | 命名方式 | 示例 |
|---|---|---|
| HTTP 字段名 | 小写 kebab-case；HTTP 匹配仍不区分大小写 | `user-agent`, `x-deepseek-harness-session-id` |
| DeepSeek 请求正文扩展字段 | 使用保留 `dsh_` 前缀的 snake case | `dsh_plugin_packages` |
| DSH 持有的嵌套 JSON 成员 | Camel case | `afterSeq`, `throughSeq`, `sessionId` |
| 带标签的值 | 使用 kebab-case 字符串；持久事件采用 `domain/action` | `session-log-deepseek/delivery-accepted` |

每个正文扩展独立持有自身的 `version`。版本仅适用于包含该字段的对象；不同字段的版本之间不存在兼容或排序关系。JSON 成员顺序不属于协议。

[`DeepSeekLlmApiExtensionRegistry`](../packages/llm/deepseek-llm-api-extensions/README.zh.md) 为每个顶层扩展名保留一个提供方。空名称、两端带空白的名称、重复注册以及与 DeepSeek 基础请求冲突的名称都会在 HTTP 分派前失败。

## 请求标头

| 标头 | 出现条件 | 值 |
|---|---|---|
| `user-agent` | 每个提供方 HTTP 请求，包括 Files API 操作 | 采用 `product/version (+url)` 形式的应用身份，其后追加命名所启动 profile 的 `dsh-profile/<profile>`，`tchar` 以外的字节及 `%` 做百分号编码（例如 `dsh-profile/desktop`、`dsh-profile/web`、`dsh-profile/sdk`）；默认产品为 `deepseek-harness` |
| `x-deepseek-harness-session-id` | 携带会话 id 的模型请求 | 确切的请求 `sessionId` 字符串 |
| `x-deepseek-harness-compact` | 用途为 `compaction` 的模型请求 | 字面字符串 `1` |

没有会话的直接请求会省略 `x-deepseek-harness-session-id`。会话标题请求和 Auto 审查请求没有额外的用途标头；请求携带 `sessionId` 时，仍然适用普通的会话 id 规则。

## 正文扩展事务

适配器先序列化包括确切 `messages` 在内的完整基础正文，再让已注册提供方准备字段。提供方会收到该不可变正文、请求取消信号，以及可选的 `sessionId` 和辅助调用 `purpose`。提供方返回 `undefined` 时，本次请求会省略其字段。

系统将已准备的 JSON 值与提供方持有的状态分离，再将其作为基础字段的顶层同级成员合并，并序列化到同一个 HTTP 正文中。某个贡献方准备失败时，系统在该次请求中省略其字段，且只记录首次失败，其余字段照常发送；与基础字段冲突的字段会阻止请求。合并后的正文无法序列化时，适配器发送不含任何扩展字段的基础正文，跳过接受事务，让贡献方在之后的请求中重发自身状态，并记录被省略的字段名。组合未挂载注册表时，适配器发送未经扩展的基础正文。

已配置端点返回 HTTP 2xx 后，适配器会在读取 SSE 正文之前运行已准备的 `accept()` 事务。传输失败和非 2xx 响应不会接受任何贡献。接受失败会记录告警，但不会使模型请求失败；贡献方会在之后的请求中重发未被接受的状态。接受仅记录端点级 HTTP 成功，不表示 SSE 流已完整结束，也不表示端点已持久化扩展。

## `dsh_plugin_packages`

[`@deepseek-ai/dsh-plugin-package-inventory-deepseek`](../packages/llm/plugin-package-inventory-deepseek/README.zh.md) 贡献完整存活的 Loader-backed 插件包清单。该字段默认启用。

```json
{
  "dsh_plugin_packages": {
    "version": 1,
    "packages": [
      {
        "name": "@deepseek-ai/dsh-example",
        "version": "0.1.1-rc.2"
      }
    ]
  }
}
```

| 成员 | 类型 | 含义 |
|---|---|---|
| `version` | `1` | `dsh_plugin_packages` 的 schema 版本 |
| `packages` | 数组 | 本次请求的完整存活集合 |
| `packages[].name` | 字符串 | 来自所属 manifest（元数据清单）的确切非空 npm 包名 |
| `packages[].version` | 可选字符串 | 来自同一 manifest 的确切非空白包版本；不可用时省略 |

每个请求都会重新读取宿主树中的存活非分组 Loader 配置项；请求会话存在 standing agent-preset 树时，也会读取该树。相对与绝对模块使用距离自身最近的所属 manifest；裸包配置项使用激活自身的 Loader 解析基准。具名 manifest 的版本不是非空白字符串时，会贡献 `{ name }`，不受 `private` 影响。名称缺失或 manifest 不可读时，只省略对应配置项；包元数据不会阻塞请求。

发送方会对确切 `(name, 可选 version)` 组合去重，并使用与 locale 无关的文本比较，先按 `name`、再按 `version` 排序，缺失版本排在前面。同一包的多个同时存活版本会保留为独立配置项，包括只有名称的配置项。接收方必须接受版本缺失，不得按包名折叠该数组，也不得根据数组顺序推断包的激活关系。

该清单不包含已禁用、pending、failed、unloading、disposed 和结构性 Loader 配置项。普通依赖、没有具名所属包的松散模块、以编程方式挂载的子 fiber，以及内存动态插件也不在其中，因为它们没有权威的 Loader 包来源信息。

清单已启用但没有符合条件的配置项时，系统发送 `packages: []`；禁用贡献插件时，系统省略整个 `dsh_plugin_packages` 字段。包身份属于提供方元数据，绝不进入模型输入。

## 暴露内容与接收方要求

请求标头会暴露 Harness 应用版本，以及请求携带时的会话身份。 `dsh_plugin_packages` 会暴露存活 npm 包的名称与版本。 通过 `baseURL` 选择的网关会收到与官方端点相同的值。

接收方按名称定位扩展字段，按各字段自己的 `version` 分派，保留不同的包版本，并忽略 JSON 成员顺序。即使缺少注册表或插件包清单贡献，基础请求仍然可用；字段缺失表示该贡献不适用于本次请求。
