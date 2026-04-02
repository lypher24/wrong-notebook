# 存储结构

这个 skill 默认把数据存到当前工作区下：

- 数据库：`data/codex-wrong-book/wrongbook.sqlite`
- 图片归档目录：`data/codex-wrong-book/images/`

## 表结构（v1）

主表：`wrong_entries`

核心字段：

- `id`：记录编号
- `created_at` / `updated_at`
- `question_hash`：用于重复提醒
- `subject_key` / `subject_label`
- `requires_image`
- `question_text`
- `answer_text`
- `analysis_text`
- `tags_json`
- `source_type`
- `image_path`：归档后的相对路径；没有本机路径时为空
- `input_json`：原始输入信息
- `draft_json`：第一次草稿
- `final_json`：确认后的最终版
- `meta_json`：额外元信息
- `notes`

## `input` 建议字段

```json
{
  "source_type": "chat_text | local_image_path | thread_attachment | mixed",
  "raw_text": "用户原始文字，可为空",
  "image_source_path": "本机图片路径，可为空"
}
```

## `draft` / `final` 建议字段

```json
{
  "subject": "数学 或 math",
  "question_text": "题目",
  "answer_text": "答案",
  "analysis": "解析",
  "tags": ["标签1", "标签2"],
  "requires_image": false
}
```

脚本保存时会把学科规范成：

- `math`
- `physics`
- `chemistry`
- `biology`
- `english`
- `chinese`
- `history`
- `geography`
- `politics`
- `other`

## 重复提醒

- 脚本会根据规范化后的 `question_text` 计算 hash。
- 默认检查最近 12 小时内是否已有同题。
- 有重复时，`save` 会返回退出码 `20`，并输出已存在记录摘要。
- 如果用户确认要重复保存，再加 `--allow-duplicate`。

## 边界说明

- 直接聊天附件如果没有本机路径，仍可保存题目数据，但 `image_path` 为空。
- 要归档原图，必须拿到本机可访问路径。
