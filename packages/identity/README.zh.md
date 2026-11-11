---
description: "identity 包组：反馈确认文本所点名的匿名 id，每个 harness home 一个。"
kind: "package-group"
---

# identity/ — 共享身份

[English](README.md) | 中文

## 概述

identity 组为每个 harness home 提供一个匿名 id，`/feedback` 确认文本会点名该 id，因此一条记录的备注可以追溯到某一套安装，而无需识别用户身份。无需配置任何东西：id 会在该命令首次运行时自动出现，并在文件被删除前保持稳定。本组只有一个包；本页列出本组的组成，包 README 负责细节。

## 目录

- [包](#packages)
- [相关文档](#related-documentation)
- [开发备注](#dev-note)

<a id="packages"></a>
## 包

| 包 | 职责 |
|---|---|
| [`anonymous-user-id`](anonymous-user-id/README.zh.md) | 让每个 harness home 拥有一个匿名 id，反馈确认文本会点名该 id，使一条备注可以追溯到某一套安装，而无需识别用户 |

<a id="related-documentation"></a>
## 相关文档

- [dsh-command-feedback](../feedback/command-feedback/README.zh.md)——在确认文本中点名该匿名安装的反馈命令。
- [反馈子系统](../../docs/subsystems/feedback.zh.md)——在 Session 日志中记录人类反馈，并持有匿名 id 出现的确认文本。

<a id="dev-note"></a>
## 开发备注

无。
