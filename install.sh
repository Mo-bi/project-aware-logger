#!/bin/bash

# ProjectAwareLogger 安装脚本
# 作者: Neo
# 版本: 1.0.0

set -e

echo "🚀 开始安装 ProjectAwareLogger 技能..."
echo "========================================"

# 检查是否在 OpenClaw workspace 中
if [ ! -d "$HOME/.openclaw" ]; then
    echo "❌ 未找到 OpenClaw 目录，请先安装 OpenClaw"
    exit 1
fi

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ 未找到 Node.js，请先安装 Node.js"
    exit 1
fi

echo "✅ 环境检查通过"

# 安装依赖
echo "📦 安装依赖..."
cd "$(dirname "$0")"
npm install --silent

if [ $? -eq 0 ]; then
    echo "✅ 依赖安装成功"
else
    echo "❌ 依赖安装失败"
    exit 1
fi

# 创建配置目录
echo "⚙️  创建配置..."
mkdir -p "$HOME/.openclaw/config"

# 检查是否已有配置文件
CONFIG_FILE="$HOME/.openclaw/config/project-aware-logger.json"
if [ ! -f "$CONFIG_FILE" ]; then
    echo "📝 创建默认配置文件..."
    cat > "$CONFIG_FILE" << 'EOF'
{
  "storage": {
    "local": {
      "base_path": "~/OpenClaw_Archives",
      "auto_create_dirs": true
    },
    "feishu": {
      "enabled": false,
      "app_id": "",
      "app_secret": "",
      "default_folder": "",
      "sync_on_complete": true,
      "sync_interval_minutes": 60
    }
  },
  "thresholds": {
    "quick_query_max_rounds": 3,
    "short_task_max_rounds": 10,
    "short_task_max_duration_hours": 4,
    "auto_new_volume_lines": 500,
    "auto_new_volume_days": 1
  },
  "behavior": {
    "auto_detect_project": true,
    "ask_before_new_volume": true,
    "show_progress_summary": true
  }
}
EOF
    echo "✅ 配置文件已创建: $CONFIG_FILE"
else
    echo "📋 使用现有配置文件: $CONFIG_FILE"
fi

# 创建存储目录
STORAGE_PATH="$HOME/OpenClaw_Archives"
if [ ! -d "$STORAGE_PATH" ]; then
    echo "📁 创建存储目录..."
    mkdir -p "$STORAGE_PATH"
    echo "✅ 存储目录已创建: $STORAGE_PATH"
else
    echo "📁 存储目录已存在: $STORAGE_PATH"
fi

# 测试技能
echo "🧪 测试技能..."
TEST_OUTPUT=$(node -e "
const Logger = require('./index.js');
try {
    const logger = new Logger();
    console.log('SUCCESS: ProjectAwareLogger 加载成功');
    console.log('STORAGE_PATH: ' + logger.config.storage.local.base_path);
} catch (error) {
    console.error('ERROR: ' + error.message);
    process.exit(1);
}
")

if echo "$TEST_OUTPUT" | grep -q "SUCCESS"; then
    echo "✅ 技能测试通过"
    echo "$TEST_OUTPUT" | grep "STORAGE_PATH"
else
    echo "❌ 技能测试失败"
    echo "$TEST_OUTPUT"
    exit 1
fi

# 创建使用示例
echo "📚 创建使用示例..."
cat > "$(dirname "$0")/USAGE.md" << 'EOF'
# ProjectAwareLogger 使用指南

## 快速开始

### 1. 基本使用
系统会自动检测任务类型：

- **一次性查询** (Level 0): 简单问题，不保存文档
- **短期任务** (Level 1): 几小时内完成的任务，保存为单文档
- **长期项目** (Level 2): 跨天项目，自动分卷保存

### 2. 手动命令

```
# 强制指定任务级别
"这是小任务，直接归档" → 强制 Level 1
"这是大项目：博客系统" → 强制 Level 2

# 文档管理
"开新文档" → 新建 Part
"合并所有部分" → 生成完整版

# 查询类
"我有哪些进行中的项目？" → 列出项目
"查看 博客系统 进度" → 展示进度

# 备份控制
"只存本地" → 跳过飞书同步
"立即同步飞书" → 手动触发同步
```

### 3. 示例对话

**示例1: 短期任务**
```
用户: 帮我总结这篇新闻
系统: 短期任务已保存: 新闻总结_2026-03-05.md
```

**示例2: 长期项目**
```
用户: 开始搭建个人博客系统
系统: 项目《个人博客系统》已更新，当前部分: Part1
```

**示例3: 项目继续**
```
用户: 继续昨天的博客项目
系统: 继续项目《个人博客系统》Part1，已加载历史上下文
```

## 文件结构

```
~/OpenClaw_Archives/
├── short_tasks/            # 短期任务
│   └── 2026-03-05/
│       └── 任务名_2026-03-05.md
└── projects/               # 长期项目
    └── 项目名/
        ├── Part1_2026-03-04.md
        ├── Part2_2026-03-05.md
        └── .project.json   # 项目元数据
```

## 配置说明

编辑 `~/.openclaw/config/project-aware-logger.json`：

```json
{
  "storage": {
    "local": {
      "base_path": "~/OpenClaw_Archives"
    },
    "feishu": {
      "enabled": false  // 设置为 true 启用飞书同步
    }
  },
  "thresholds": {
    "quick_query_max_rounds": 3,     // 简单查询最大轮次
    "short_task_max_rounds": 10,     // 短期任务最大轮次
    "auto_new_volume_lines": 500     // 自动分卷行数阈值
  }
}
```

## 飞书集成（可选）

1. 在飞书开放平台创建应用
2. 获取 App ID 和 App Secret
3. 在配置中启用并填写凭证

## 故障排除

### 常见问题
1. **文档未保存**: 检查存储目录权限
2. **项目检测不准确**: 调整阈值配置
3. **飞书同步失败**: 检查网络和 API 密钥

### 查看日志
```bash
# 查看技能输出
cd ~/.openclaw/workspace/project-aware-logger
node index.js "测试消息"
```

## 更新

检查更新：
```bash
cd ~/.openclaw/workspace/project-aware-logger
git pull origin main
npm install
```

## 支持

如有问题，请参考：
- 技能文档: SKILL.md
- 在线帮助: https://docs.openclaw.ai
- 社区: https://discord.com/invite/clawd
EOF

echo "✅ 使用指南已创建: $(dirname "$0")/USAGE.md"

echo ""
echo "🎉 安装完成！"
echo "========================================"
echo "📖 使用指南: $(dirname "$0")/USAGE.md"
echo "⚙️  配置文件: $CONFIG_FILE"
echo "📁 存储目录: $STORAGE_PATH"
echo ""
echo "💡 开始使用："
echo "1. 阅读 USAGE.md 了解详细用法"
echo "2. 尝试发送消息测试技能"
echo "3. 根据需要调整配置文件"
echo ""
echo "🚀 ProjectAwareLogger 已就绪！"