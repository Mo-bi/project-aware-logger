#!/usr/bin/env node

/**
 * ProjectAwareLogger - 主入口文件
 * 智能项目感知日志系统
 */

const fs = require('fs-extra');
const path = require('path');
const yaml = require('yaml');

// 工具模块
const TaskClassifier = require('./utils/task-classifier');
const VolumeManager = require('./utils/volume-manager');
const StorageManager = require('./utils/storage-manager');

class ProjectAwareLogger {
  constructor() {
    this.config = this.loadConfig();
    this.taskClassifier = new TaskClassifier(this.config);
    this.volumeManager = new VolumeManager(this.config);
    this.storageManager = new StorageManager(this.config);
    
    // 初始化飞书同步
    this.initFeishuSync();
    
    // 当前状态
    this.currentProject = null;
    this.currentTaskLevel = null;
    this.conversationHistory = [];
  }

  /**
   * 初始化飞书同步
   */
  async initFeishuSync() {
    try {
      await this.storageManager.feishuSync.init();
      this.feishuEnabled = this.config.storage.feishu.enabled;
      
      if (this.feishuEnabled) {
        console.log('✅ 飞书同步模块已启用');
      } else {
        console.log('ℹ️  飞书同步未启用，如需使用请编辑配置文件');
      }
    } catch (error) {
      console.warn('飞书同步初始化失败:', error.message);
      this.feishuEnabled = false;
    }
  }

  /**
   * 加载配置
   */
  loadConfig() {
    const defaultConfig = {
      storage: {
        local: {
          base_path: path.join(process.env.HOME || process.env.USERPROFILE, 'OpenClaw_Archives'),
          auto_create_dirs: true
        },
        feishu: {
          enabled: false,
          app_id: '',
          app_secret: '',
          default_folder: '',
          sync_on_complete: true,
          sync_interval_minutes: 60
        }
      },
      thresholds: {
        quick_query_max_rounds: 3,
        short_task_max_rounds: 10,
        short_task_max_duration_hours: 4,
        auto_new_volume_lines: 500,
        auto_new_volume_days: 1
      },
      behavior: {
        auto_detect_project: true,
        ask_before_new_volume: true,
        show_progress_summary: true
      }
    };

    // 尝试加载用户配置
    const userConfigPath = path.join(
      process.env.HOME || process.env.USERPROFILE,
      '.openclaw/config/project-aware-logger.json'
    );

    try {
      if (fs.existsSync(userConfigPath)) {
        const userConfig = JSON.parse(fs.readFileSync(userConfigPath, 'utf8'));
        return this.deepMerge(defaultConfig, userConfig);
      }
    } catch (error) {
      console.warn(`无法加载用户配置: ${error.message}, 使用默认配置`);
    }

    return defaultConfig;
  }

  /**
   * 深度合并对象
   */
  deepMerge(target, source) {
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        if (!target[key] || typeof target[key] !== 'object') {
          target[key] = {};
        }
        this.deepMerge(target[key], source[key]);
      } else {
        target[key] = source[key];
      }
    }
    return target;
  }

  /**
   * 处理新消息
   */
  async processMessage(message, context = {}) {
    try {
      // 添加到对话历史
      this.conversationHistory.push({
        role: 'user',
        content: message,
        timestamp: new Date().toISOString()
      });

      // 分析消息内容
      const analysis = this.analyzeMessage(message, context);

      // 根据分析结果处理
      let response = '';
      let actions = [];

      switch (analysis.action) {
        case 'quick_query':
          response = '这是一次性查询，仅对话内回答，不生成文档。';
          break;

        case 'short_task':
          response = await this.handleShortTask(message, analysis);
          actions = ['save_document'];
          break;

        case 'long_project':
          response = await this.handleLongProject(message, analysis);
          actions = ['save_document', 'track_project'];
          break;

        case 'project_continue':
          response = await this.handleProjectContinue(message, analysis);
          actions = ['load_context', 'save_document'];
          break;

        case 'manual_command':
          response = await this.handleManualCommand(message, analysis);
          break;

        default:
          response = '正在分析任务类型...';
      }

      // 保存对话历史
      await this.saveConversationHistory();

      return {
        response,
        actions,
        metadata: {
          taskLevel: this.currentTaskLevel,
          projectName: this.currentProject?.name,
          documentPath: this.currentProject?.currentDocument
        }
      };

    } catch (error) {
      console.error('处理消息时出错:', error);
      return {
        response: `处理消息时出错: ${error.message}`,
        actions: [],
        metadata: {}
      };
    }
  }

  /**
   * 分析消息内容
   */
  analyzeMessage(message, context) {
    // 检查手动命令
    const commandResult = this.checkManualCommands(message);
    if (commandResult) {
      return commandResult;
    }

    // 检查项目继续
    const continueResult = this.checkProjectContinue(message);
    if (continueResult) {
      return continueResult;
    }

    // 自动检测任务类型
    return this.taskClassifier.classify(message, this.conversationHistory, context);
  }

  /**
   * 检查手动命令
   */
  checkManualCommands(message) {
    const commands = {
      // 强制任务级别
      '这是小任务，直接归档': { action: 'manual_command', command: 'force_short_task' },
      '这是大项目：': { action: 'manual_command', command: 'force_long_project' },
      
      // 文档管理
      '开新文档': { action: 'manual_command', command: 'new_volume' },
      '合并所有部分': { action: 'manual_command', command: 'merge_parts' },
      
      // 查询类
      '我有哪些进行中的项目？': { action: 'manual_command', command: 'list_projects' },
      '查看.*进度': { action: 'manual_command', command: 'show_progress' },
      
      // 备份控制
      '只存本地': { action: 'manual_command', command: 'local_only' },
      '立即同步飞书': { action: 'manual_command', command: 'sync_feishu' }
    };

    for (const [pattern, result] of Object.entries(commands)) {
      if (message.includes(pattern.replace('.*', ''))) {
        return {
          ...result,
          parameters: this.extractCommandParameters(message, pattern)
        };
      }
    }

    return null;
  }

  /**
   * 检查项目继续
   */
  checkProjectContinue(message) {
    if (!this.currentProject) {
      return null;
    }

    const continueKeywords = ['继续', '接着', '上次的', '之前的', '接着做', '继续做'];
    const hasContinueKeyword = continueKeywords.some(keyword => message.includes(keyword));
    
    const projectKeywords = this.currentProject.keywords || [];
    const hasProjectKeyword = projectKeywords.some(keyword => message.includes(keyword));

    if (hasContinueKeyword || hasProjectKeyword) {
      return {
        action: 'project_continue',
        projectName: this.currentProject.name,
        confidence: hasContinueKeyword && hasProjectKeyword ? 0.9 : 0.6
      };
    }

    return null;
  }

  /**
   * 提取命令参数
   */
  extractCommandParameters(message, pattern) {
    if (pattern.includes('{项目名}')) {
      const match = message.match(/这是大项目：(.*)/);
      return match ? { projectName: match[1].trim() } : {};
    }
    
    if (pattern.includes('查看.*进度')) {
      const match = message.match(/查看(.*)进度/);
      return match ? { projectName: match[1].trim() } : {};
    }
    
    return {};
  }

  /**
   * 处理短期任务
   */
  async handleShortTask(message, analysis) {
    this.currentTaskLevel = 'short_task';
    
    // 生成文档内容
    const documentContent = this.generateDocumentContent(message, 'short_task');
    
    // 保存文档
    const documentPath = await this.storageManager.saveShortTask(
      analysis.taskName || '未命名任务',
      documentContent
    );

    return `短期任务已保存: ${path.basename(documentPath)}\n路径: ${documentPath}`;
  }

  /**
   * 处理长期项目
   */
  async handleLongProject(message, analysis) {
    this.currentTaskLevel = 'long_project';
    
    // 确定项目名称
    const projectName = analysis.projectName || this.extractProjectName(message);
    
    // 初始化或获取项目
    if (!this.currentProject || this.currentProject.name !== projectName) {
      this.currentProject = await this.volumeManager.initializeProject(projectName, message);
    }

    // 检查是否需要新建 Part
    const shouldNewVolume = await this.volumeManager.shouldCreateNewVolume(this.currentProject);
    
    if (shouldNewVolume) {
      await this.volumeManager.createNewVolume(this.currentProject);
    }

    // 生成文档内容
    const documentContent = this.generateDocumentContent(message, 'long_project');

    // 追加到当前文档
    await this.volumeManager.appendToCurrentVolume(this.currentProject, documentContent);

    // 更新项目状态
    this.currentProject.lastActive = new Date().toISOString();

    return `项目《${projectName}》已更新\n当前部分: Part${this.currentProject.currentPart}\n文档: ${this.currentProject.currentDocument}`;
  }

  /**
   * 处理项目继续
   */
  async handleProjectContinue(message, analysis) {
    // 加载项目上下文
    const context = await this.volumeManager.loadProjectContext(analysis.projectName);
    
    if (!context) {
      return `未找到项目《${analysis.projectName}》的历史记录，将创建新项目。`;
    }

    this.currentProject = context;
    this.currentTaskLevel = 'long_project';

    // 检查是否需要新建 Part（跨天）
    const shouldNewVolume = await this.volumeManager.shouldCreateNewVolume(this.currentProject);
    
    if (shouldNewVolume) {
      await this.volumeManager.createNewVolume(this.currentProject);
      return `检测到跨天继续，已创建 Part${this.currentProject.currentPart}\n正在加载项目上下文...`;
    }

    return `继续项目《${analysis.projectName}》Part${this.currentProject.currentPart}\n已加载历史上下文。`;
  }

  /**
   * 处理手动命令
   */
  async handleManualCommand(message, analysis) {
    switch (analysis.command) {
      case 'force_short_task':
        return await this.handleShortTask(message, { taskName: '手动指定短期任务' });
      
      case 'force_long_project':
        const projectName = analysis.parameters?.projectName || '手动指定项目';
        return await this.handleLongProject(message, { projectName });
      
      case 'new_volume':
        if (this.currentProject) {
          await this.volumeManager.createNewVolume(this.currentProject);
          return `已创建新部分: Part${this.currentProject.currentPart}`;
        }
        return '当前没有进行中的项目';
      
      case 'list_projects':
        const projects = await this.storageManager.listActiveProjects();
        if (projects.length === 0) {
          return '没有进行中的项目';
        }
        return `进行中的项目:\n${projects.map(p => `- ${p.name} (Part${p.currentPart})`).join('\n')}`;
      
      case 'show_progress':
        const projectName2 = analysis.parameters?.projectName;
        if (!projectName2) {
          return '请指定项目名称，如：查看"项目名"进度';
        }
        const progress = await this.volumeManager.getProjectProgress(projectName2);
        return progress || `未找到项目《${projectName2}》`;
      
      case 'sync_feishu':
        if (this.feishuEnabled) {
          // 同步当前文档或所有文档
          if (this.currentProject?.currentDocument) {
            const result = await this.storageManager.feishuSync.manualSync(this.currentProject.currentDocument);
            return result.success ? 
              `✅ 飞书同步成功！文档链接: ${result.url || '已更新'}` :
              `❌ 飞书同步失败: ${result.reason}`;
          } else {
            return '当前没有活跃文档，请指定文档路径或开始一个项目';
          }
        } else {
          return '飞书同步未启用，请在配置中启用并填写凭证';
        }
        
      default:
        return `命令已接收: ${analysis.command}`;
    }
  }

  /**
   * 提取项目名称
   */
  extractProjectName(message) {
    // 改进的项目名称提取算法
    const patterns = [
      // 模式1: "开始[项目内容]系统/平台/..."
      { pattern: /开始\s*([^，,。.;;！!？?]*?)(?:系统|平台|网站|博客|应用|工具|服务|项目|功能)/, group: 1 },
      // 模式2: "项目：[项目名称]"
      { pattern: /项目[：:]\s*([^，,。.;;！!？?\s]+)/, group: 1 },
      // 模式3: "搭建[项目内容]系统"
      { pattern: /搭建\s*([^，,。.;;！!？?]*?)(?:系统|平台|网站|博客)/, group: 1 },
      // 模式4: "开发[项目内容]系统"
      { pattern: /开发\s*([^，,。.;;！!？?]*?)(?:系统|平台|应用)/, group: 1 },
      // 模式5: "创建[项目内容]工具"
      { pattern: /创建\s*([^，,。.;;！!？?]*?)(?:工具|应用|系统)/, group: 1 },
      // 模式6: "实现[项目内容]功能"
      { pattern: /实现\s*([^，,。.;;！!？?]*?)功能/, group: 1 },
      // 模式7: "设计[项目内容]系统"
      { pattern: /设计\s*([^，,。.;;！!？?]*?)(?:系统|方案|架构)/, group: 1 }
    ];

    for (const { pattern, group } of patterns) {
      const match = message.match(pattern);
      if (match && match[group]) {
        let name = match[group].trim();
        
        // 清理名称：移除常见修饰词
        const modifiers = ['一个', '一套', '一款', '一种', '我的', '个人', '公司', '企业'];
        modifiers.forEach(mod => {
          name = name.replace(new RegExp(`^${mod}\\s*`), '');
        });
        
        // 如果名称为空或太短，尝试提取更多内容
        if (name.length < 2) {
          // 提取整个匹配内容
          const fullMatch = match[0];
          const words = fullMatch.split(/\s+/).filter(word => 
            word.length > 1 && !this.isCommonWord(word) && !modifiers.includes(word)
          );
          if (words.length > 0) {
            name = words.join('_');
          }
        }
        
        // 限制长度并清理
        name = name.substring(0, Math.min(30, name.length))
                 .replace(/[，,。.;;！!？?]/g, '')
                 .trim();
        
        return name || '未命名项目';
      }
    }

    // 备选方案：提取技术相关短语
    const techPhrases = this.extractTechPhrases(message);
    if (techPhrases.length > 0) {
      return techPhrases[0].substring(0, 30);
    }

    // 最后：提取前2-3个有意义的词
    const meaningfulWords = message.split(/\s+/).filter(word => 
      word.length > 1 && !this.isCommonWord(word)
    );
    
    if (meaningfulWords.length >= 2) {
      return meaningfulWords.slice(0, Math.min(3, meaningfulWords.length))
                           .join('_')
                           .substring(0, 30);
    }

    // 最终备选
    return '项目_' + new Date().getTime().toString().slice(-6);
  }

  /**
   * 提取技术短语
   */
  extractTechPhrases(message) {
    const techKeywords = [
      '博客系统', '网站系统', '管理系统', '控制系统',
      '学习平台', '电商平台', '社交平台', '云平台',
      '数据可视化', '人工智能', '机器学习', '深度学习',
      '移动应用', '桌面应用', 'Web应用', '小程序',
      '自动化工具', '分析工具', '开发工具', '测试工具'
    ];
    
    const foundPhrases = [];
    
    for (const phrase of techKeywords) {
      if (message.includes(phrase)) {
        foundPhrases.push(phrase);
      }
    }
    
    return foundPhrases;
  }

  /**
   * 检查是否为常见词
   */
  isCommonWord(word) {
    const commonWords = [
      '的', '了', '在', '是', '我', '有', '和', '就',
      '不', '人', '都', '一', '一个', '这个', '那个',
      '可以', '需要', '应该', '可能', '如果', '但是',
      '然后', '接着', '首先', '最后', '怎么', '如何',
      '什么', '为什么', '怎么样', '帮忙', '请', '谢谢'
    ];
    
    return commonWords.includes(word.toLowerCase());
  }

  /**
   * 生成文档内容
   */
  generateDocumentContent(message, taskType) {
    const timestamp = new Date().toISOString();
    const dateStr = new Date().toLocaleDateString('zh-CN');
    const timeStr = new Date().toLocaleTimeString('zh-CN');

    let content = '';

    if (taskType === 'long_project' && this.currentProject) {
      // 长期项目文档头部
      content += `---\n`;
      content += `project: ${this.currentProject.name}\n`;
      content += `part: ${this.currentProject.currentPart}\n`;
      content += `date: ${dateStr}\n`;
      content += `prev_part: ${this.currentProject.currentPart > 1 ? `Part${this.currentProject.currentPart - 1}` : 'null'}\n`;
      content += `next_part: 待填充\n`;
      content += `status: WIP\n`;
      content += `---\n\n`;
      content += `# ${this.currentProject.name} - 第${this.currentProject.currentPart}部分（${dateStr}）\n\n`;
      content += `> 项目上下文：这是项目《${this.currentProject.name}》的第${this.currentProject.currentPart}部分\n`;
      if (this.currentProject.currentPart > 1) {
        content += `> 上一部分：Part${this.currentProject.currentPart - 1}\n`;
      }
      content += `> 本部分时段：${timeStr} ~ \n\n`;
      content += `## 本次更新\n\n`;
    } else {
      // 短期任务文档
      content += `---\n`;
      content += `type: short_task\n`;
      content += `date: ${dateStr}\n`;
      content += `time: ${timeStr}\n`;
      content += `---\n\n`;
      content += `# 短期任务记录\n\n`;
    }

    content += `### 用户输入\n`;
    content += `${message}\n\n`;
    content += `### 处理时间\n`;
    content += `${timestamp}\n\n`;

    return content;
  }

  /**
   * 保存对话历史
   */
  async saveConversationHistory() {
    // 限制历史记录长度
    if (this.conversationHistory.length > 100) {
      this.conversationHistory = this.conversationHistory.slice(-50);
    }

    // 可以保存到文件或数据库
    const historyPath = path.join(
      this.config.storage.local.base_path,
      '.conversation_history.json'
    );

    try {
      await fs.ensureDir(path.dirname(historyPath));
      await fs.writeJson(historyPath, this.conversationHistory, { spaces: 2 });
    } catch (error) {
      console.warn('保存对话历史失败:', error.message);
    }
  }

  /**
   * 获取状态信息
   */
  getStatus() {
    return {
      currentProject: this.currentProject,
      currentTaskLevel: this.currentTaskLevel,
      conversationHistoryLength: this.conversationHistory.length,
      config: {
        storagePath: this.config.storage.local.base_path,
        feishuEnabled: this.config.storage.feishu.enabled
      }
    };
  }

  /**
   * 重置状态
   */
  reset() {
    this.currentProject = null;
    this.currentTaskLevel = null;
    this.conversationHistory = [];
  }
}

// 导出模块
module.exports = ProjectAwareLogger;

// 如果直接运行，提供命令行接口
if (require.main === module) {
  const logger = new ProjectAwareLogger();
  
  // 简单测试
  const testMessage = process.argv[2] || '测试消息';
  logger.processMessage(testMessage).then(result => {
    console.log('响应:', result.response);
    console.log('元数据:', result.metadata);
  }).catch(error => {
    console.error('错误:', error);
  });
}