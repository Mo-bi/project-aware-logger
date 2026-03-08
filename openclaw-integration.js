/**
 * OpenClaw 技能集成文件
 * 将 ProjectAwareLogger 集成到 OpenClaw 系统中
 */

const ProjectAwareLogger = require('./index.js');

class ProjectAwareLoggerSkill {
  constructor() {
    this.name = 'project-aware-logger';
    this.description = '智能项目感知日志系统 - 自动任务分级与文档管理';
    this.version = '1.0.0';
    this.logger = null;
  }

  /**
   * 初始化技能
   */
  async init(config = {}) {
    try {
      this.logger = new ProjectAwareLogger();
      
      // 应用自定义配置（如果提供）
      if (config.storage) {
        Object.assign(this.logger.config.storage, config.storage);
      }
      if (config.thresholds) {
        Object.assign(this.logger.config.thresholds, config.thresholds);
      }
      if (config.behavior) {
        Object.assign(this.logger.config.behavior, config.behavior);
      }
      
      console.log(`✅ ${this.name} v${this.version} 初始化成功`);
      console.log(`📁 存储路径: ${this.logger.config.storage.local.base_path}`);
      
      return true;
    } catch (error) {
      console.error(`❌ ${this.name} 初始化失败:`, error);
      return false;
    }
  }

  /**
   * 处理消息
   */
  async handleMessage(message, context = {}) {
    if (!this.logger) {
      await this.init();
    }

    try {
      const result = await this.logger.processMessage(message, context);
      
      // 添加技能标识
      result.skill = this.name;
      result.version = this.version;
      
      return result;
    } catch (error) {
      console.error(`❌ ${this.name} 处理消息失败:`, error);
      return {
        response: `处理消息时出错: ${error.message}`,
        skill: this.name,
        error: true
      };
    }
  }

  /**
   * 获取技能状态
   */
  async getStatus() {
    if (!this.logger) {
      return { initialized: false };
    }

    try {
      const status = this.logger.getStatus();
      const storageStats = await this.logger.storageManager.getStorageStats();
      
      return {
        initialized: true,
        skill: this.name,
        version: this.version,
        currentProject: status.currentProject,
        currentTaskLevel: status.currentTaskLevel,
        storage: {
          path: this.logger.config.storage.local.base_path,
          stats: storageStats
        },
        config: {
          thresholds: this.logger.config.thresholds,
          feishuEnabled: this.logger.config.storage.feishu.enabled
        }
      };
    } catch (error) {
      return {
        initialized: true,
        skill: this.name,
        error: error.message
      };
    }
  }

  /**
   * 执行命令
   */
  async executeCommand(command, args = {}) {
    if (!this.logger) {
      await this.init();
    }

    switch (command) {
      case 'reset':
        this.logger.reset();
        return { success: true, message: '状态已重置' };
        
      case 'list-projects':
        const projects = await this.logger.volumeManager.listAllProjects();
        return {
          success: true,
          projects: projects.map(p => ({
            name: p.name,
            parts: p.totalParts,
            lastActive: p.lastActive,
            status: p.status
          }))
        };
        
      case 'get-stats':
        const stats = await this.logger.storageManager.getStorageStats();
        return { success: true, stats };
        
      case 'search':
        if (!args.query) {
          return { success: false, message: '需要搜索查询参数' };
        }
        const results = await this.logger.storageManager.searchDocuments(args.query, args.options);
        return { success: true, results };
        
      case 'backup-config':
        const backupPath = await this.logger.storageManager.backupConfig();
        return { success: true, backupPath };
        
      default:
        return { success: false, message: `未知命令: ${command}` };
    }
  }

  /**
   * 获取帮助信息
   */
  getHelp() {
    return {
      name: this.name,
      description: this.description,
      version: this.version,
      commands: [
        { command: 'reset', description: '重置技能状态' },
        { command: 'list-projects', description: '列出所有项目' },
        { command: 'get-stats', description: '获取存储统计' },
        { command: 'search <query>', description: '搜索文档' },
        { command: 'backup-config', description: '备份配置' }
      ],
      usage: [
        '系统会自动检测任务类型：',
        '  - 一次性查询 (Level 0): 简单问题，不保存',
        '  - 短期任务 (Level 1): 单文档保存',
        '  - 长期项目 (Level 2): 分卷保存',
        '',
        '手动命令示例：',
        '  "这是小任务，直接归档" → 强制 Level 1',
        '  "这是大项目：项目名" → 强制 Level 2',
        '  "开新文档" → 新建 Part',
        '  "我有哪些进行中的项目？" → 列出项目'
      ]
    };
  }
}

// 导出技能
module.exports = ProjectAwareLoggerSkill;

// 如果直接运行，提供测试接口
if (require.main === module) {
  const skill = new ProjectAwareLoggerSkill();
  
  skill.init().then(async () => {
    console.log('🧪 ProjectAwareLogger 技能测试');
    console.log('==============================');
    
    // 测试1: 获取状态
    const status = await skill.getStatus();
    console.log('状态:', JSON.stringify(status, null, 2));
    
    // 测试2: 处理示例消息
    const testMessages = [
      '这是什么？',
      '帮我总结这篇新闻',
      '开始搭建个人博客系统'
    ];
    
    for (const message of testMessages) {
      console.log(`\n测试消息: "${message}"`);
      const result = await skill.handleMessage(message);
      console.log('响应:', result.response);
      console.log('元数据:', result.metadata);
    }
    
    // 测试3: 执行命令
    console.log('\n测试命令: list-projects');
    const commandResult = await skill.executeCommand('list-projects');
    console.log('结果:', commandResult);
    
  }).catch(error => {
    console.error('测试失败:', error);
  });
}