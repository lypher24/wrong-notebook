---
name: cherry-wrong-book
description: Analyze and record wrong-question text or photos inside Codex. Use when the user wants to process a wrong question, upload or paste wrong-question text or a photo, get subject/answer/analysis/tags, confirm edits, and save the final version into a local SQLite wrong-book store for later web UI work.
metadata:
  short-description: 在 Codex 里分析并录入错题
---

# Cherry Wrong Book

用这个 skill 处理“错题分析 + 人工确认 + 本地入库”整条链路。

## 默认目标

除非用户明确说“只分析不保存”，否则按下面流程工作：

1. 读题：支持纯文字、截图、拍照题。
2. 出草稿：给出学科、题目、答案、解析、标签、是否依赖图片。
3. 让用户确认或修改。
4. 只有在用户明确确认后才入库。
5. 返回记录编号、保存位置、是否有重复提醒。

## 先做判断

- 如果图片太糊、题干缺失、图形信息看不清，不要硬猜，先说明缺什么，再请用户补图或补文字。
- 如果题目依赖图形、函数图像、几何图、实验图、电路图，`requires_image` 设为 `true`。
- 标签控制在 **1-5 个**，优先用稳定的知识点标签，不要给泛标签（如“难题”“易错题”）。

## 输出草稿时的固定格式

先给用户一版草稿，结构固定为：

- 学科
- 题目
- 答案
- 解析
- 标签
- 是否依赖图片
- 待确认项（只有确实有风险时才写）

默认用简体中文解释；题目原文如果本来是英文，题目和答案可保留英文。

## 学科规范

保存前把学科收敛到下面之一：

- 数学 / math
- 物理 / physics
- 化学 / chemistry
- 生物 / biology
- 英语 / english
- 语文 / chinese
- 历史 / history
- 地理 / geography
- 政治 / politics
- 其他 / other

## 保存规则

- **默认不自动保存。**
- 只有用户出现“确认保存 / 入库 / 就按这版存 / 可以保存”等明确确认时，才调用存库脚本。
- 保存时必须同时带上：
  - `draft`：模型第一次给出的草稿
  - `final`：用户确认后的最终版
  - `input`：原始输入方式与来源信息
  - `meta`：额外说明、风险、备注

如果用户改了内容，`final` 必须反映修改后的结果，`draft` 保留第一次草稿。

## 图片处理

- 如果用户给了**本机图片路径**，把它写入 `input.image_source_path`，并让存库脚本复制到工作区 `data/codex-wrong-book/images/`。
- 如果用户只是直接发了聊天图片，没有本机路径，也照常分析；但保存时把 `input.source_type` 设为 `thread_attachment`，不填 `image_source_path`。这时数据库会保存题目数据，但不会自动归档原图文件。

## 先初始化，再保存

第一次在某个工作区保存时，先运行一次初始化：

`python <skill-dir>/scripts/wrongbook_store.py init --workspace-root <cwd>`

其中：

- `<skill-dir>` 是本 skill 目录
- `<cwd>` 默认就是当前工作区目录

不要假设脚本在当前工作区里；要按 **skill 目录相对路径** 解析 `scripts/wrongbook_store.py`。

## 保存时的命令约定

1. 把待保存 payload 写成 UTF-8 JSON 临时文件。
2. 先调用：

`python <skill-dir>/scripts/wrongbook_store.py save --workspace-root <cwd> --payload-file <temp-json>`

3. 如果脚本返回重复提醒（退出码 20），先把已有记录摘要告诉用户，问是否仍要另存一条。
4. 只有在用户明确说“仍然保存”时，再加 `--allow-duplicate` 重试。

## 查询命令

需要回看时可用：

- 单条：`python <skill-dir>/scripts/wrongbook_store.py get --workspace-root <cwd> --id <entry-id>`
- 最近记录：`python <skill-dir>/scripts/wrongbook_store.py list --workspace-root <cwd> --limit 20`

如果要了解字段和目录结构，再读 `references/storage-schema.md`。

## 推荐 payload 结构

```json
{
  "input": {
    "source_type": "chat_text",
    "raw_text": "用户原始题面或补充说明",
    "image_source_path": null
  },
  "draft": {
    "subject": "数学",
    "question_text": "……",
    "answer_text": "……",
    "analysis": "……",
    "tags": ["一元二次方程"],
    "requires_image": false
  },
  "final": {
    "subject": "math",
    "question_text": "……",
    "answer_text": "……",
    "analysis": "……",
    "tags": ["一元二次方程"],
    "requires_image": false
  },
  "notes": "",
  "meta": {
    "confirmed_by_user": true
  }
}
```

## 交付口径

保存成功后，简短告诉用户：

- 已保存
- 记录编号
- 学科和标签
- 图片是否已归档
- 数据库位置

不要把脚本原始 JSON 大段贴给用户，除非用户明确要看。
