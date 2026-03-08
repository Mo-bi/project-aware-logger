# ProjectAwareLogger - 智能项目感知日志系统

## 概述
ProjectAwareLogger 是一个智能的任务分级和文档管理系统，能够自动区分一次性查询、短期任务和长期项目，并提供本地+飞书双备份，保持对话连续性。

## 功能特性

### 🎯 智能任务分级
- **Level 0**: 一次性查询（不归档）
- **Level 1**: 短期任务（单文档归档）
- **Level 2**: 长期项目（多部分文档，按日期分卷）

### 📁 自动分卷管理
- 长期项目自动按日期分卷（Part1, Part2...）
- 跨天自动创建新文档
- 保持项目上下文连续性

### 🔄 双备份机制
- 本地文件系统存储
- 飞书文档实时同步（可选）
- 冲突解决策略

### 🧠 记忆连续性
- 跨会话保持项目上下文
- 自动加载历史进度
- 避免重复劳动

## 安装配置

### 1. 基础配置
```bash
# 安装技能
clawhub install project-aware-logger
```

### 2. 配置文件
编辑 `~/.openclaw/config/project-aware-logger.json`：
```json
{
  "storage": {
    "local": {
      "base_path": "~/OpenClaw_Archives"
    },
    "feishu": {
      "enabled": false,
      "app_id": "",
      "app_secret": "",
      "default_folder": ""
    }
  },
  "thresholds": {
    "quick_query_max_rounds": 3,
    "short_task_max_rounds": 10,
    "auto_new_volume_lines": 500
  }
}
```

### 3. 飞书配置（可选）
1. 在飞书开放平台创建应用
2. 获取 App ID 和 App Secret
3. 在飞书云文档创建目标文件夹
4. 获取文件夹 token

## 使用方法

### 自动模式
系统会自动检测任务类型：
- 简单查询 → Level 0（不归档）
- 短期任务 → Level 1（单文档）
- 长期项目 → Level 2（分卷文档）

### 手动命令
```
# 强制指定任务级别
"这是小任务，直接归档" → 强制 Level 1
"这是大项目：项目名" → 强制 Level 2

# 文档管理
"开新文档" → 新建 Part
"合并所有部分" → 生成完整版

# 查询类
"我有哪些进行中的项目？" → 列出项目
"查看 项目名 进度" → 展示进度
```

## 文件结构

```
OpenClaw_Archives/
├── short_tasks/            # Level 1 短期任务
│   └── 2026-03-05/
│       └── 任务主题_2026-03-05.md
└── projects/               # Level 2 长期项目
    └── 项目名/
        ├── Part1_2026-03-04.md
        ├── Part2_2026-03-05.md
        └── 项目索引.md
```

## 飞书同步

启用飞书同步后，所有文档会自动同步到飞书云文档：
- 实时同步（完成时）
- 增量更新
- 版本控制
- 支持离线查看

## 故障排除

### 常见问题
1. **飞书同步失败**：检查网络连接和 API 密钥
2. **文档未保存**：检查存储路径权限
3. **项目检测不准确**：调整阈值配置

### 日志查看
```bash
tail -f ~/.openclaw/logs/project-aware-logger.log
```

## 更新日志

### v1.0.0 (2026-03-05)
- 基础任务分级功能
- 本地文档存储
- 简单的项目检测
- 基础配置系统

### 计划功能
- 飞书同步集成
- 智能摘要生成
- 项目仪表板
- 高级搜索功能

## 技术支持
如有问题，请参考：
- 项目文档：本文件
- 在线帮助：https://docs.openclaw.ai/skills/project-aware-logger
- 社区支持：https://discord.com/invite/clawd
