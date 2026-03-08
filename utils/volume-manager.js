/**
 * 分卷管理器
 * 管理长期项目的多部分文档
 */

const fs = require('fs-extra');
const path = require('path');

class VolumeManager {
  constructor(config) {
    this.config = config;
    this.projectsBasePath = path.join(config.storage.local.base_path, 'projects');
  }

  /**
   * 初始化项目
   */
  async initializeProject(projectName, initialMessage = '') {
    const projectPath = path.join(this.projectsBasePath, projectName);
    
    // 创建项目目录
    await fs.ensureDir(projectPath);

    // 检查现有项目
    const existingParts = await this.getExistingParts(projectName);
    
    // 调试信息
    console.log(`[DEBUG] 项目 "${projectName}" 现有部分:`, existingParts.map(p => p.name));

    // 如果是新项目，从 Part1 开始
    let currentPart = 1;
    if (existingParts.length > 0) {
      // 找到最大的 Part 编号
      const maxPart = Math.max(...existingParts.map(p => p.partNumber));
      currentPart = maxPart;
      
      // 检查是否需要新建 Part（跨天等）
      const shouldNew = await this.shouldCreateNewVolumeBasedOnLastPart(existingParts[existingParts.length - 1]);
      if (shouldNew) {
        currentPart = maxPart + 1;
      }
    }

    // 项目元数据
    const project = {
      name: projectName,
      path: projectPath,
      currentPart: currentPart,
      totalParts: existingParts.length,
      created: new Date().toISOString(),
      lastActive: new Date().toISOString(),
      status: 'active',
      keywords: this.extractKeywords(initialMessage),
      documents: existingParts
    };

    // 设置当前文档路径
    project.currentDocument = this.getDocumentPath(project, currentPart);

    // 保存项目元数据
    await this.saveProjectMetadata(project);

    return project;
  }

  /**
   * 基于最后部分检查是否需要新建
   */
  async shouldCreateNewVolumeBasedOnLastPart(lastPart) {
    if (!lastPart || !lastPart.path) {
      return true;
    }

    try {
      const stats = await fs.stat(lastPart.path);
      const lastModified = new Date(stats.mtime);
      const now = new Date();
      const hoursDiff = (now - lastModified) / (1000 * 60 * 60);
      
      // 如果最后修改超过24小时，建议新建
      return hoursDiff >= 24;
    } catch (error) {
      return true;
    }
  }

  /**
   * 获取现有部分
   */
  async getExistingParts(projectName) {
    const projectPath = path.join(this.projectsBasePath, projectName);
    
    if (!await fs.pathExists(projectPath)) {
      return [];
    }

    const files = await fs.readdir(projectPath);
    const partFiles = files.filter(file => 
      file.startsWith('Part') && file.endsWith('.md')
    ).sort(); // 按名称排序

    return partFiles.map(file => ({
      name: file,
      path: path.join(projectPath, file),
      partNumber: this.extractPartNumber(file)
    }));
  }

  /**
   * 从文件名提取部分编号
   */
  extractPartNumber(filename) {
    const match = filename.match(/Part(\d+)/);
    return match ? parseInt(match[1]) : 0;
  }

  /**
   * 获取文档路径
   */
  getDocumentPath(project, partNumber) {
    const dateStr = new Date().toLocaleDateString('zh-CN').replace(/\//g, '-');
    const filename = `Part${partNumber}_${dateStr}.md`;
    return path.join(project.path, filename);
  }

  /**
   * 提取关键词
   */
  extractKeywords(message) {
    // 简单关键词提取，可以扩展
    const words = message.split(/\s+/).filter(word => 
      word.length > 2 && !this.isCommonWord(word)
    );
    
    return words.slice(0, 10); // 最多10个关键词
  }

  /**
   * 检查是否为常见词
   */
  isCommonWord(word) {
    const commonWords = [
      '的', '了', '在', '是', '我', '有', '和', '就',
      '不', '人', '都', '一', '一个', '这个', '那个',
      '可以', '需要', '应该', '可能', '如果', '但是'
    ];
    
    return commonWords.includes(word.toLowerCase());
  }

  /**
   * 保存项目元数据
   */
  async saveProjectMetadata(project) {
    const metadataPath = path.join(project.path, '.project.json');
    await fs.writeJson(metadataPath, project, { spaces: 2 });
  }

  /**
   * 加载项目元数据
   */
  async loadProjectMetadata(projectName) {
    const metadataPath = path.join(this.projectsBasePath, projectName, '.project.json');
    
    if (await fs.pathExists(metadataPath)) {
      return await fs.readJson(metadataPath);
    }
    
    return null;
  }

  /**
   * 检查是否需要新建部分
   */
  async shouldCreateNewVolume(project) {
    // 检查当前文档是否存在
    if (!await fs.pathExists(project.currentDocument)) {
      return true;
    }

    // 检查文档大小
    const stats = await fs.stat(project.currentDocument);
    const fileSizeKB = stats.size / 1024;
    
    if (fileSizeKB > this.config.thresholds.auto_new_volume_lines * 2) {
      // 假设每行约2KB
      return true;
    }

    // 检查是否跨天
    const lastActiveDate = new Date(project.lastActive);
    const currentDate = new Date();
    const daysDiff = Math.floor((currentDate - lastActiveDate) / (1000 * 60 * 60 * 24));
    
    if (daysDiff >= this.config.thresholds.auto_new_volume_days) {
      return true;
    }

    // 检查用户是否明确要求新建
    // 这个逻辑在主模块中处理

    return false;
  }

  /**
   * 创建新部分
   */
  async createNewVolume(project) {
    // 更新部分编号
    project.currentPart += 1;
    project.totalParts = project.currentPart;
    
    // 更新文档路径
    project.currentDocument = this.getDocumentPath(project, project.currentPart);
    
    // 更新最后活跃时间
    project.lastActive = new Date().toISOString();
    
    // 保存元数据
    await this.saveProjectMetadata(project);
    
    // 创建新文档的头部
    await this.createNewDocumentHeader(project);
    
    return project;
  }

  /**
   * 创建新文档头部
   */
  async createNewDocumentHeader(project) {
    const dateStr = new Date().toLocaleDateString('zh-CN');
    const timeStr = new Date().toLocaleTimeString('zh-CN');
    
    let header = `---\n`;
    header += `project: ${project.name}\n`;
    header += `part: ${project.currentPart}\n`;
    header += `date: ${dateStr}\n`;
    header += `prev_part: Part${project.currentPart - 1}\n`;
    header += `next_part: 待填充\n`;
    header += `status: WIP\n`;
    header += `---\n\n`;
    header += `# ${project.name} - 第${project.currentPart}部分（${dateStr}）\n\n`;
    header += `> 项目上下文：这是项目《${project.name}》的第${project.currentPart}部分\n`;
    header += `> 上一部分：Part${project.currentPart - 1}\n`;
    header += `> 本部分时段：${timeStr} ~ \n\n`;
    header += `## 开始\n\n`;

    await fs.writeFile(project.currentDocument, header, 'utf8');
  }

  /**
   * 追加内容到当前文档
   */
  async appendToCurrentVolume(project, content) {
    // 确保文档存在
    if (!await fs.pathExists(project.currentDocument)) {
      await this.createNewDocumentHeader(project);
    }

    // 追加内容
    await fs.appendFile(project.currentDocument, content, 'utf8');
    
    // 更新最后修改时间
    project.lastActive = new Date().toISOString();
    await this.saveProjectMetadata(project);
  }

  /**
   * 加载项目上下文
   */
  async loadProjectContext(projectName) {
    // 加载项目元数据
    const project = await this.loadProjectMetadata(projectName);
    
    if (!project) {
      return null;
    }

    // 加载最近的部分内容作为上下文
    const recentContent = await this.loadRecentContent(project);
    
    return {
      ...project,
      context: recentContent
    };
  }

  /**
   * 加载最近内容
   */
  async loadRecentContent(project, maxLines = 100) {
    try {
      if (!project.currentDocument || !await fs.pathExists(project.currentDocument)) {
        return '';
      }

      const content = await fs.readFile(project.currentDocument, 'utf8');
      const lines = content.split('\n');
      
      // 返回最后 maxLines 行
      return lines.slice(-maxLines).join('\n');
    } catch (error) {
      console.warn(`加载项目内容失败: ${error.message}`);
      return '';
    }
  }

  /**
   * 获取项目进度
   */
  async getProjectProgress(projectName) {
    const project = await this.loadProjectMetadata(projectName);
    
    if (!project) {
      return null;
    }

    const parts = await this.getExistingParts(projectName);
    
    let progress = `项目《${projectName}》进度：\n`;
    progress += `- 总部分数: ${parts.length}\n`;
    progress += `- 当前部分: Part${project.currentPart || parts.length}\n`;
    progress += `- 最后活跃: ${new Date(project.lastActive).toLocaleString('zh-CN')}\n`;
    progress += `- 状态: ${project.status}\n\n`;
    
    progress += `各部分：\n`;
    for (const part of parts) {
      try {
        const stats = await fs.stat(part.path);
        const sizeKB = (stats.size / 1024).toFixed(1);
        progress += `  - ${part.name} (${sizeKB}KB)\n`;
      } catch (error) {
        progress += `  - ${part.name} (无法获取大小)\n`;
      }
    }

    return progress;
  }

  /**
   * 列出所有项目
   */
  async listAllProjects() {
    if (!await fs.pathExists(this.projectsBasePath)) {
      return [];
    }

    const items = await fs.readdir(this.projectsBasePath);
    const projects = [];

    for (const item of items) {
      const itemPath = path.join(this.projectsBasePath, item);
      const stats = await fs.stat(itemPath);
      
      if (stats.isDirectory()) {
        const metadata = await this.loadProjectMetadata(item);
        if (metadata) {
          projects.push(metadata);
        }
      }
    }

    return projects.sort((a, b) => 
      new Date(b.lastActive) - new Date(a.lastActive)
    );
  }

  /**
   * 获取活跃项目
   */
  async getActiveProjects() {
    const allProjects = await this.listAllProjects();
    return allProjects.filter(project => 
      project.status === 'active' || 
      (new Date() - new Date(project.lastActive)) < 30 * 24 * 60 * 60 * 1000 // 30天内
    );
  }

  /**
   * 完成项目
   */
  async completeProject(projectName) {
    const project = await this.loadProjectMetadata(projectName);
    
    if (!project) {
      return false;
    }

    project.status = 'completed';
    project.completedAt = new Date().toISOString();
    
    // 更新最后部分的状态
    if (project.currentDocument && await fs.pathExists(project.currentDocument)) {
      let content = await fs.readFile(project.currentDocument, 'utf8');
      content = content.replace(/status: WIP/, 'status: Finalized');
      await fs.writeFile(project.currentDocument, content, 'utf8');
    }

    // 生成项目索引
    await this.generateProjectIndex(project);
    
    // 保存元数据
    await this.saveProjectMetadata(project);
    
    return true;
  }

  /**
   * 生成项目索引
   */
  async generateProjectIndex(project) {
    const parts = await this.getExistingParts(project.name);
    
    let indexContent = `# ${project.name} - 项目索引\n\n`;
    indexContent += `## 项目信息\n`;
    indexContent += `- 创建时间: ${new Date(project.created).toLocaleString('zh-CN')}\n`;
    indexContent += `- 完成时间: ${new Date().toLocaleString('zh-CN')}\n`;
    indexContent += `- 总部分数: ${parts.length}\n`;
    indexContent += `- 状态: 已完成\n\n`;
    
    indexContent += `## 各部分摘要\n\n`;
    
    for (const part of parts) {
      try {
        const content = await fs.readFile(part.path, 'utf8');
        const firstLines = content.split('\n').slice(0, 10).join('\n');
        
        indexContent += `### ${part.name}\n`;
        indexContent += `\`\`\`\n${firstLines}\n...\n\`\`\`\n\n`;
      } catch (error) {
        indexContent += `### ${part.name} (读取失败)\n\n`;
      }
    }

    const indexPath = path.join(project.path, '项目索引.md');
    await fs.writeFile(indexPath, indexContent, 'utf8');
  }
}

module.exports = VolumeManager;