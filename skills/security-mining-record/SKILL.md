---
name: security-mining-record
description: Maintain a live vulnerability-mining Markdown record during authorized security research tasks.
---

# Security Mining Record Skill

当用户执行已授权的漏洞挖掘任务，并且任务 prompt 提供了实时 Markdown 记录文件路径时，你必须维护该路径对应的漏洞挖掘记录文档。

行为要求：

1. 在整个任务过程中持续更新 prompt 指定的记录文件。
2. 使用自然 Markdown，自行组织标题和段落；不要套用预设章节，也不要输出 JSON。
3. 不要把工具原始输出整段堆入文档，只保留关键结论、证据引用和复核所需短摘录。

什么时候写：

- 用户确认测试对象、限制条件或授权边界时，记录已确认的信息和不能做的动作。
- 每次工具调用产生有价值结果时，记录工具名称、关键结论、证据文件路径或可复核的短摘录。
- 出现疑似漏洞时，记录受影响对象、问题描述、验证状态、风险判断、复现要点和下一步。
- 需要人工审批、用户纠偏或暂停时，记录原因、用户决定以及对后续工作的影响。
- 生成最终 Markdown 报告前，补齐已确认问题、证据引用、未确认线索、审批/纠偏结论，以及报告需要继承的关键过程摘要；报告文件由 1Code 基于完整聊天链路、工具调用和本记录生成。
