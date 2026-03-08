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

### 1. 复制配置文件

```bash
cp config.example.json config.json
```

### 2. 编辑 config.json

```json
{
  "feishu": {
    "app_id": "你的飞书应用ID",
    "app_secret": "你的飞书应用密钥",
    "member_id": "你的open_id（用于自动设置编辑权限）"
  },
  "local": {
    "base_path": "~/OpenClaw_Archives"
  }
}
```

### 3. 获取飞书配置

**方式一：飞书开放平台**
1. 访问 [飞书开放平台](https://open.feishu.cn/)
2. 创建应用，获取 App ID 和 App Secret
3. 开启需要的权限（docx:document:create, drive:permission:member 等）

**方式二：联系管理员**
如果你是飞书企业用户，请联系企业管理员创建应用

### 4. 获取你的 open_id

1. 打开飞书
2. 点击头像 → 设置 → 关于
3. 点击自己的头像，查看用户ID
4. 或者使用飞书 API: `https://open.feishu.cn/open-apis/authen/v1/index_access_token`

**注意**：open_id 格式类似：`ou_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

## 使用

### 归档工具

项目提供了 `archive.js` 归档工具，用于每日工作日志的本地+飞书双备份。

```bash
# 从文件归档
node archive.js "2026-03-08 工作日志" ./log.md

# 从 stdin 归档
cat log.md | node archive.js "2026-03-08 工作日志"

# 或者
node archive.js "2026-03-08 工作日志" < summary.md
```

归档工具会自动：
- ✅ 保存到本地 `~/OpenClaw_Archives/daily_logs/`
- ✅ 同步到飞书云文档
- ✅ 为配置的 member_id 设置编辑权限

### 主程序

```bash
node index.js
```

详细使用说明请参考 [USAGE.md](USAGE.md)

## 项目结构

```
project-aware-logger/
├── index.js              # 主程序入口
├── archive.js            # 归档工具
├── config.example.json   # 配置示例
├── openclaw-integration.js  # OpenClaw 集成
├── utils/                # 工具函数
│   ├── feishu-sync.js   # 飞书同步
│   └── ...
├── templates/            # 文档模板
├── SKILL.md             # Skill 定义
└── USAGE.md             # 使用说明
```

## 技术栈

- Node.js
- axios
- @larksuiteoapi/node-sdk
- fs-extra
- 飞书开放 API

## 常见问题

### Q: config.json 里的 member_id 是什么？
A: 这是你的飞书 open_id。配置后，归档工具会自动给这个用户设置文档编辑权限。

### Q: 如何获取飞书应用凭证？
A: 在 [飞书开放平台](https://open.feishu.cn/) 创建应用，然后获取 App ID 和 App Secret。

### Q: 权限设置失败怎么办？
A: 检查你的飞书应用是否有 `drive:permission:member` 权限。

## License

MIT

## 作者

Neo (https://github.com/Mo-bi)
