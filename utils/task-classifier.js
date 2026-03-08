/**
 * 任务分类器
 * 智能分析消息内容，确定任务级别
 */

class TaskClassifier {
  constructor(config) {
    this.config = config;
    this.keywords = this.initKeywords();
  }

  /**
   * 初始化关键词
   */
  initKeywords() {
    return {
      // 项目开始关键词
      projectStart: [
        '开始', '搭建', '项目', '实现', '开发', '创建',
        '构建', '设计', '编写', '制作', '建立'
      ],
      
      // 技术栈关键词
      technicalStack: [
        '安装', '配置', '部署', '调试', '测试',
        '数据库', 'API', '前端', '后端', '服务器',
        '框架', '库', '依赖', '环境', '版本'
      ],
      
      // 时间参考关键词
      timeReference: [
        '今天', '明天', '下周', '月底', '季度',
        '阶段', '步骤', '分期', '分步', '先...然后'
      ],
      
      // 查询类关键词
      queryKeywords: [
        '是什么', '为什么', '怎么样', '如何', '怎么',
        '请问', '帮忙', '解释', '定义', '推荐'
      ],
      
      // 简单任务关键词
      simpleTask: [
        '总结', '翻译', '写个', '生成', '转换',
        '计算', '查找', '搜索', '整理', '列出'
      ]
    };
  }

  /**
   * 分类消息
   */
  classify(message, conversationHistory = [], context = {}) {
    // 分析消息特征
    const features = this.analyzeFeatures(message, conversationHistory, context);
    
    // 计算置信度分数
    const scores = this.calculateScores(features);
    
    // 确定任务级别
    return this.determineTaskLevel(scores, features);
  }

  /**
   * 分析消息特征
   */
  analyzeFeatures(message, conversationHistory, context) {
    const features = {
      messageLength: message.length,
      wordCount: message.split(/\s+/).length,
      
      // 关键词匹配
      keywordMatches: {
        projectStart: this.countKeywords(message, this.keywords.projectStart),
        technicalStack: this.countKeywords(message, this.keywords.technicalStack),
        timeReference: this.countKeywords(message, this.keywords.timeReference),
        query: this.countKeywords(message, this.keywords.queryKeywords),
        simpleTask: this.countKeywords(message, this.keywords.simpleTask)
      },
      
      // 对话特征
      conversationFeatures: {
        roundCount: conversationHistory.length,
        hasPreviousRounds: conversationHistory.length > 0,
        lastMessageTime: this.getLastMessageTime(conversationHistory)
      },
      
      // 结构特征
      structureFeatures: {
        hasSteps: this.hasStepStructure(message),
        hasDependencies: this.hasDependencyWords(message),
        hasTechnicalTerms: this.hasTechnicalTerms(message)
      }
    };

    return features;
  }

  /**
   * 计算置信度分数
   */
  calculateScores(features) {
    const scores = {
      quickQuery: 0,
      shortTask: 0,
      longProject: 0
    };

    // Level 0: 一次性查询
    if (features.keywordMatches.query > 0) {
      scores.quickQuery += 0.7;
    }
    if (features.messageLength < 50) {
      scores.quickQuery += 0.3;
    }
    if (features.conversationFeatures.roundCount <= this.config.thresholds.quick_query_max_rounds) {
      scores.quickQuery += 0.2;
    }

    // Level 1: 短期任务
    if (features.keywordMatches.simpleTask > 0) {
      scores.shortTask += 0.6;
    }
    if (features.messageLength >= 50 && features.messageLength < 200) {
      scores.shortTask += 0.4;
    }
    if (!features.structureFeatures.hasSteps && !features.structureFeatures.hasDependencies) {
      scores.shortTask += 0.3;
    }

    // Level 2: 长期项目
    if (features.keywordMatches.projectStart > 0) {
      scores.longProject += 0.8;
    }
    if (features.keywordMatches.technicalStack > 0) {
      scores.longProject += 0.6;
    }
    if (features.keywordMatches.timeReference > 0) {
      scores.longProject += 0.5;
    }
    if (features.structureFeatures.hasSteps || features.structureFeatures.hasDependencies) {
      scores.longProject += 0.7;
    }
    if (features.structureFeatures.hasTechnicalTerms) {
      scores.longProject += 0.4;
    }

    // 对话历史影响
    if (features.conversationFeatures.roundCount > this.config.thresholds.short_task_max_rounds) {
      scores.longProject += 0.3;
      scores.shortTask -= 0.2;
    }

    return scores;
  }

  /**
   * 确定任务级别
   */
  determineTaskLevel(scores, features) {
    // 找到最高分
    const maxScore = Math.max(scores.quickQuery, scores.shortTask, scores.longProject);
    
    let result = {
      action: 'quick_query',
      confidence: maxScore,
      features: features
    };

    if (maxScore === scores.longProject && scores.longProject >= 0.5) {
      result.action = 'long_project';
      result.projectName = this.extractProjectNameFromFeatures(features);
    } else if (maxScore === scores.shortTask && scores.shortTask >= 0.4) {
      result.action = 'short_task';
      result.taskName = this.extractTaskName(features);
    } else {
      result.action = 'quick_query';
    }

    // 调整置信度
    result.confidence = this.adjustConfidence(result, features);

    return result;
  }

  /**
   * 从特征中提取项目名称
   */
  extractProjectNameFromFeatures(features) {
    // 这里可以扩展更复杂的项目名称提取逻辑
    // 目前返回空，由主模块处理
    return null;
  }

  /**
   * 提取任务名称
   */
  extractTaskName(features) {
    // 简单任务名称提取
    return '短期任务';
  }

  /**
   * 调整置信度
   */
  adjustConfidence(result, features) {
    let confidence = result.confidence;

    // 基于对话轮次调整
    if (features.conversationFeatures.roundCount > 0) {
      if (result.action === 'quick_query' && features.conversationFeatures.roundCount > 2) {
        confidence *= 0.7; // 多轮对话不太可能是简单查询
      }
    }

    // 基于消息长度调整
    if (features.messageLength > 300 && result.action === 'quick_query') {
      confidence *= 0.5; // 长消息不太可能是简单查询
    }

    return Math.min(Math.max(confidence, 0), 1);
  }

  /**
   * 统计关键词出现次数
   */
  countKeywords(message, keywords) {
    let count = 0;
    const lowerMessage = message.toLowerCase();
    
    for (const keyword of keywords) {
      if (lowerMessage.includes(keyword.toLowerCase())) {
        count++;
      }
    }
    
    return count;
  }

  /**
   * 获取最后消息时间
   */
  getLastMessageTime(conversationHistory) {
    if (conversationHistory.length === 0) {
      return null;
    }
    
    const lastMessage = conversationHistory[conversationHistory.length - 1];
    return lastMessage.timestamp ? new Date(lastMessage.timestamp) : new Date();
  }

  /**
   * 检查是否有步骤结构
   */
  hasStepStructure(message) {
    const stepPatterns = [
      /第一步|第二步|第三步/,
      /首先|然后|接着|最后/,
      /第一阶段|第二阶段/,
      /\d+\.\s+/, // 数字编号
      /-\s+/,     // 项目符号
      /\*\s+/     // 星号
    ];
    
    return stepPatterns.some(pattern => pattern.test(message));
  }

  /**
   * 检查是否有依赖词
   */
  hasDependencyWords(message) {
    const dependencyWords = [
      '先', '然后', '接着', '之后', '接下来',
      '需要', '必须', '依赖', '基于', '在...基础上'
    ];
    
    return dependencyWords.some(word => message.includes(word));
  }

  /**
   * 检查是否有技术术语
   */
  hasTechnicalTerms(message) {
    const technicalTerms = [
      'API', 'JSON', 'XML', 'HTTP', 'HTTPS',
      '数据库', '服务器', '客户端', '服务端',
      '框架', '库', '模块', '组件', '接口'
    ];
    
    return technicalTerms.some(term => message.includes(term));
  }
}

module.exports = TaskClassifier;