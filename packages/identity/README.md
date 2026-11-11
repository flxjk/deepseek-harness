---
description: "The identity package group: the anonymous, per-harness-home id that the feedback acknowledgement names."
kind: "package-group"
---

# identity/ — shared identity

English | [中文](README.zh.md)

## Summary

The identity group provides one anonymous id per harness home that the `/feedback` acknowledgement names, so a recorded remark can be tied to an installation without identifying the user. There is nothing to configure: the id appears automatically the first time the command runs and stays stable until its file is deleted. The group has one package; this page maps it, and the package README owns the details.

## Table of Contents

- [Packages](#packages)
- [Related documentation](#related-documentation)
- [Dev Note](#dev-note)

<a id="packages"></a>
## Packages

| Package | Role |
|---|---|
| [`anonymous-user-id`](anonymous-user-id/README.md) | Gives every harness home one anonymous id that the feedback acknowledgement names, so a remark can be tied to an installation without identifying the user |

<a id="related-documentation"></a>
## Related documentation

- [dsh-command-feedback](../feedback/command-feedback/README.md) — the feedback command that names the anonymous installation in its acknowledgement.
- [Feedback subsystem](../../docs/subsystems/feedback.md) — records human feedback in the Session log and owns the acknowledgement the anonymous id appears in.

<a id="dev-note"></a>
## Dev Note

None.
