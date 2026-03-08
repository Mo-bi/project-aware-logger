# Project Aware Logger

智能项目感知日志系统 - 自动任务分级与文档管理

## 简介

Project Aware Logger 是一个智能日志系统，能够自动区分一次性查询、短期任务与长期项目，并支持本地+飞书双备份，保持对话连续性。

## 功能特性

- **智能任务分级**：自动识别任务类型（一次性查询 / 短期任务 / 长期项目）
- **双备份机制**：本地存储 + 飞书文档同步
- **项目持续性**：长期项目可跨对话保持上下文
- **自动化文档**：自动生成项目文档和进度报告

## 安装

```bash
cd project-aware-logger
npm install
```

## 配置

复制 `feishu-config-example.json` 为 `feishu-config.json` 并填入你的飞书配置：

```json
{
  "appId": "your-app-id",
  "appSecret": "your-app-secret"
}
```

## 使用

```bash
node index.js
```

详细使用说明请参考 [USAGE.md](USAGE.md)

## 项目结构

```
project-aware-logger/
├── index.js              # 主程序入口
├── openclaw-integration.js  # OpenClaw 集成
├── utils/                # 工具函数
├── templates/           # 文档模板
├── feishu-config-example.json  # 飞书配置示例
├── SKILL.md            # Skill 定义
└── USAGE.md            # 使用说明
```

## 技术栈

- Node.js
- axios
- fs-extra
- yaml
- 飞书开放 API

## License

MIT
