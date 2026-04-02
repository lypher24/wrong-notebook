# Codex 版错题本 v1

这套实现不走网页录入，而是把“读题、出草稿、确认、入库”搬到 Codex 对话里。

## 现在有的东西

- 一个可安装的 Codex skill：`cherry-wrong-book`
- 一个本地 SQLite 存储脚本：`codex-skills/cherry-wrong-book/scripts/wrongbook_store.py`
- 一个安装脚本：`node scripts/install-codex-wrongbook-skill.js`

## 安装

在仓库根目录运行：

```bash
node scripts/install-codex-wrongbook-skill.js
```

它会把 skill 复制到：

- `%CODEX_HOME%/skills/cherry-wrong-book`
- 如果没设 `CODEX_HOME`，默认是 `~/.codex/skills/cherry-wrong-book`

## 数据位置

每个工作区自己的数据放在：

- `data/codex-wrong-book/wrongbook.sqlite`
- `data/codex-wrong-book/images/`

## 当前边界

- 直接聊天附件如果没有本机路径，仍能保存题目数据，但不会自动复制原图文件。
- 要归档原图，需要给到 Codex 可访问的本机路径。
