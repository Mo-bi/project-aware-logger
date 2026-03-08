/**
 * 存储管理器
 * 管理本地和飞书存储
 */

const fs = require('fs-extra');
const path = require('path');
const FeishuSync = require('./feishu-sync');

class StorageManager {
  constructor(config) {
    this.config = config;
    this.initStoragePaths();
    this.feishuSync = new FeishuSync(config);
  }

  /**
   * 初始化存储路径
   */
  initStoragePaths() {
    // 本地存储路径
    this.localBasePath = this.config.storage.local.base_path;
    this.shortTasksPath = path.join(this.localBasePath, 'short_tasks');
    this.projectsPath = path.join(this.localBasePath, 'projects');
    
    // 确保目录存在
    if (this.config.storage.local.auto_create_dirs) {
      fs.ensureDirSync(this.localBasePath);
      fs.ensureDirSync(this.shortTasksPath);
      fs.ensureDirSync(this.projectsPath);
    }
  }

  /**
   * 保存短期任务
   */
  async saveShortTask(taskName, content) {
    // 清理任务名称（用于文件名）
    const cleanTaskName = this.cleanFileName(taskName);
    const dateStr = new Date().toLocaleDateString('zh-CN').replace(/\//g, '-');
    
    // 创建日期目录
    const datePath = path.join(this.shortTasksPath, dateStr);
    await fs.ensureDir(datePath);
    
    // 生成文件名
    const filename = `${cleanTaskName}_${dateStr}.md`;
    const filePath = path.join(datePath, filename);
    
    // 如果文件已存在，添加序号
    let finalPath = filePath;
    let counter = 1;
    
    while (await fs.pathExists(finalPath)) {
      const newFilename = `${cleanTaskName}_${dateStr}_${counter}.md`;
      finalPath = path.join(datePath, newFilename);
      counter++;
    }
    
    // 写入文件
    await fs.writeFile(finalPath, content, 'utf8');
    
    // 可选：同步到飞书
    if (this.config.storage.feishu.enabled) {
      await this.syncToFeishu('short_task', finalPath, content);
    }
    
    return finalPath;
  }

  /**
   * 清理文件名
   */
  cleanFileName(name, maxLength = 50) {
    // 移除非法字符
    let clean = name.replace(/[<>:"/\\|?*]/g, '_');
    
    // 移除多余空格
    clean = clean.replace(/\s+/g, '_');
    
    // 限制长度
    if (clean.length > maxLength) {
      clean = clean.substring(0, maxLength);
    }
    
    return clean;
  }

  /**
   * 同步到飞书
   */
  async syncToFeishu(type, localPath, content) {
    try {
      const title = path.basename(localPath, '.md');
      const result = await this.feishuSync.syncDocument(localPath, title, content);
      
      if (result.success) {
        console.log(`✅ 飞书同步成功: ${title}`);
        if (result.url) {
          console.log(`  文档链接: ${result.url}`);
        }
        return true;
      } else {
        console.log(`⚠️  飞书同步跳过: ${result.reason}`);
        return false;
      }
    } catch (error) {
      console.error(`❌ 飞书同步失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 列出活跃项目
   */
  async listActiveProjects() {
    try {
      if (!await fs.pathExists(this.projectsPath)) {
        return [];
      }

      const projects = [];
      const items = await fs.readdir(this.projectsPath);

      for (const item of items) {
        const itemPath = path.join(this.projectsPath, item);
        const stats = await fs.stat(itemPath);
        
        if (stats.isDirectory()) {
          // 检查项目元数据
          const metadataPath = path.join(itemPath, '.project.json');
          if (await fs.pathExists(metadataPath)) {
            try {
              const metadata = await fs.readJson(metadataPath);
              if (metadata.status === 'active') {
                projects.push({
                  name: metadata.name,
                  currentPart: metadata.currentPart || 1,
                  lastActive: metadata.lastActive,
                  path: itemPath
                });
              }
            } catch (error) {
              console.warn(`读取项目元数据失败 ${itemPath}: ${error.message}`);
            }
          }
        }
      }

      return projects.sort((a, b) => 
        new Date(b.lastActive) - new Date(a.lastActive)
      );
    } catch (error) {
      console.error(`列出项目失败: ${error.message}`);
      return [];
    }
  }

  /**
   * 获取存储统计信息
   */
  async getStorageStats() {
    const stats = {
      totalSizeKB: 0,
      fileCount: 0,
      projectCount: 0,
      shortTaskCount: 0,
      byType: {
        short_tasks: { count: 0, sizeKB: 0 },
        projects: { count: 0, sizeKB: 0 }
      }
    };

    try {
      // 统计短期任务
      if (await fs.pathExists(this.shortTasksPath)) {
        const shortTaskStats = await this.calculateDirectorySize(this.shortTasksPath);
        stats.byType.short_tasks = shortTaskStats;
        stats.totalSizeKB += shortTaskStats.sizeKB;
        stats.fileCount += shortTaskStats.count;
        stats.shortTaskCount = shortTaskStats.count;
      }

      // 统计项目
      if (await fs.pathExists(this.projectsPath)) {
        const projectStats = await this.calculateDirectorySize(this.projectsPath);
        stats.byType.projects = projectStats;
        stats.totalSizeKB += projectStats.sizeKB;
        stats.fileCount += projectStats.count;
        stats.projectCount = await this.countProjects();
      }
    } catch (error) {
      console.error(`获取存储统计失败: ${error.message}`);
    }

    return stats;
  }

  /**
   * 计算目录大小
   */
  async calculateDirectorySize(dirPath) {
    let totalSize = 0;
    let fileCount = 0;

    try {
      const items = await fs.readdir(dirPath);
      
      for (const item of items) {
        const itemPath = path.join(dirPath, item);
        const stats = await fs.stat(itemPath);
        
        if (stats.isDirectory()) {
          const subStats = await this.calculateDirectorySize(itemPath);
          totalSize += subStats.size;
          fileCount += subStats.count;
        } else if (stats.isFile()) {
          totalSize += stats.size;
          fileCount++;
        }
      }
    } catch (error) {
      console.warn(`计算目录大小失败 ${dirPath}: ${error.message}`);
    }

    return {
      size: totalSize,
      sizeKB: Math.round(totalSize / 1024),
      count: fileCount
    };
  }

  /**
   * 计算项目数量
   */
  async countProjects() {
    try {
      if (!await fs.pathExists(this.projectsPath)) {
        return 0;
      }

      const items = await fs.readdir(this.projectsPath);
      let projectCount = 0;

      for (const item of items) {
        const itemPath = path.join(this.projectsPath, item);
        const stats = await fs.stat(itemPath);
        
        if (stats.isDirectory()) {
          projectCount++;
        }
      }

      return projectCount;
    } catch (error) {
      console.error(`计算项目数量失败: ${error.message}`);
      return 0;
    }
  }

  /**
   * 备份配置
   */
  async backupConfig() {
    const backupDir = path.join(this.localBasePath, '.backups');
    await fs.ensureDir(backupDir);
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `config_backup_${timestamp}.json`);
    
    try {
      await fs.writeJson(backupPath, this.config, { spaces: 2 });
      return backupPath;
    } catch (error) {
      console.error(`备份配置失败: ${error.message}`);
      return null;
    }
  }

  /**
   * 清理旧备份
   */
  async cleanupOldBackups(maxBackups = 10) {
    const backupDir = path.join(this.localBasePath, '.backups');
    
    if (!await fs.pathExists(backupDir)) {
      return;
    }

    try {
      const files = await fs.readdir(backupDir);
      const backupFiles = files
        .filter(file => file.startsWith('config_backup_') && file.endsWith('.json'))
        .map(file => ({
          name: file,
          path: path.join(backupDir, file),
          time: this.extractBackupTime(file)
        }))
        .filter(item => item.time)
        .sort((a, b) => b.time - a.time); // 按时间倒序

      // 删除多余的备份
      for (let i = maxBackups; i < backupFiles.length; i++) {
        await fs.remove(backupFiles[i].path);
        console.log(`删除旧备份: ${backupFiles[i].name}`);
      }
    } catch (error) {
      console.error(`清理备份失败: ${error.message}`);
    }
  }

  /**
   * 从文件名提取备份时间
   */
  extractBackupTime(filename) {
    const match = filename.match(/config_backup_(.+)\.json/);
    if (!match) return null;
    
    try {
      const timeStr = match[1].replace(/-/g, ':').replace(/_/g, '.');
      return new Date(timeStr).getTime();
    } catch (error) {
      return null;
    }
  }

  /**
   * 搜索文档
   */
  async searchDocuments(query, options = {}) {
    const results = [];
    const searchOptions = {
      maxResults: options.maxResults || 50,
      type: options.type || 'all', // 'all', 'short_tasks', 'projects'
      dateRange: options.dateRange
    };

    try {
      // 搜索短期任务
      if (searchOptions.type === 'all' || searchOptions.type === 'short_tasks') {
        const taskResults = await this.searchInDirectory(this.shortTasksPath, query, searchOptions);
        results.push(...taskResults.map(r => ({ ...r, type: 'short_task' })));
      }

      // 搜索项目文档
      if (searchOptions.type === 'all' || searchOptions.type === 'projects') {
        const projectResults = await this.searchInDirectory(this.projectsPath, query, searchOptions);
        results.push(...projectResults.map(r => ({ ...r, type: 'project' })));
      }
    } catch (error) {
      console.error(`搜索文档失败: ${error.message}`);
    }

    // 按相关性排序（简单实现）
    return results.sort((a, b) => b.score - a.score).slice(0, searchOptions.maxResults);
  }

  /**
   * 在目录中搜索
   */
  async searchInDirectory(dirPath, query, options) {
    const results = [];
    
    if (!await fs.pathExists(dirPath)) {
      return results;
    }

    try {
      const files = await this.getAllFiles(dirPath, '.md');
      
      for (const file of files) {
        // 检查日期范围
        if (options.dateRange) {
          const fileDate = this.extractFileDate(file);
          if (fileDate && !this.isInDateRange(fileDate, options.dateRange)) {
            continue;
          }
        }

        // 读取文件内容
        const content = await fs.readFile(file, 'utf8');
        
        // 简单搜索匹配
        const score = this.calculateRelevance(content, query);
        
        if (score > 0) {
          const excerpt = this.getExcerpt(content, query);
          results.push({
            path: file,
            score: score,
            excerpt: excerpt,
            size: (await fs.stat(file)).size
          });
        }
      }
    } catch (error) {
      console.warn(`搜索目录失败 ${dirPath}: ${error.message}`);
    }

    return results;
  }

  /**
   * 获取所有文件
   */
  async getAllFiles(dirPath, extension = '') {
    const files = [];
    
    try {
      const items = await fs.readdir(dirPath);
      
      for (const item of items) {
        const itemPath = path.join(dirPath, item);
        const stats = await fs.stat(itemPath);
        
        if (stats.isDirectory()) {
          const subFiles = await this.getAllFiles(itemPath, extension);
          files.push(...subFiles);
        } else if (stats.isFile() && (!extension || item.endsWith(extension))) {
          files.push(itemPath);
        }
      }
    } catch (error) {
      // 忽略权限错误等
    }

    return files;
  }

  /**
   * 从文件路径提取日期
   */
  extractFileDate(filePath) {
    // 尝试从文件名提取日期
    const dateMatch = filePath.match(/(\d{4}-\d{2}-\d{2})/);
    if (dateMatch) {
      return new Date(dateMatch[1]);
    }
    
    // 尝试从文件修改时间获取
    try {
      const stats = fs.statSync(filePath);
      return new Date(stats.mtime);
    } catch (error) {
      return null;
    }
  }

  /**
   * 检查是否在日期范围内
   */
  isInDateRange(date, range) {
    if (range.start && date < range.start) return false;
    if (range.end && date > range.end) return false;
    return true;
  }

  /**
   * 计算相关性分数
   */
  calculateRelevance(content, query) {
    const lowerContent = content.toLowerCase();
    const lowerQuery = query.toLowerCase();
    
    let score = 0;
    
    // 完全匹配
    if (lowerContent.includes(lowerQuery)) {
      score += 10;
    }
    
    // 单词匹配
    const queryWords = lowerQuery.split(/\s+/).filter(w => w.length > 2);
    for (const word of queryWords) {
      if (lowerContent.includes(word)) {
        score += 5;
      }
    }
    
    // 频率加权
    const occurrences = (lowerContent.match(new RegExp(lowerQuery, 'g')) || []).length;
    score += occurrences * 2;
    
    return score;
  }

  /**
   * 获取摘要
   */
  getExcerpt(content, query, length = 150) {
    const lowerContent = content.toLowerCase();
    const lowerQuery = query.toLowerCase();
    
    // 查找查询出现的位置
    const index = lowerContent.indexOf(lowerQuery);
    
    if (index === -1) {
      // 如果没有找到，返回开头
      return content.substring(0, length) + (content.length > length ? '...' : '');
    }
    
    // 以查询为中心提取摘要
    const start = Math.max(0, index - Math.floor(length / 2));
    const end = Math.min(content.length, start + length);
    
    let excerpt = content.substring(start, end);
    
    if (start > 0) {
      excerpt = '...' + excerpt;
    }
    if (end < content.length) {
      excerpt = excerpt + '...';
    }
    
    return excerpt;
  }
}

module.exports = StorageManager;