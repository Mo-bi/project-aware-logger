/**
 * 飞书同步模块
 * 实现本地文档与飞书文档的双向同步
 */

const fs = require('fs-extra');
const path = require('path');
const OpenClawIntegration = require('./openclaw-integration');

class FeishuSync {
  constructor(config) {
    this.config = config;
    this.enabled = config.storage.feishu.enabled;
    this.appId = config.storage.feishu.app_id;
    this.appSecret = config.storage.feishu.app_secret;
    this.defaultFolder = config.storage.feishu.default_folder;
    
    // 初始化OpenClaw工具集成
    this.openclaw = new OpenClawIntegration();
    
    // 同步状态记录
    this.syncStatus = new Map(); // filePath -> {docToken, lastSync, hash}
  }

  /**
   * 检查飞书配置是否完整
   */
  checkConfig() {
    if (!this.enabled) {
      return { valid: false, reason: '飞书同步未启用' };
    }
    
    if (!this.appId || !this.appSecret) {
      return { valid: false, reason: '缺少飞书应用凭证' };
    }
    
    return { valid: true };
  }

  /**
   * 同步文档到飞书
   */
  async syncDocument(localPath, title, content, options = {}) {
    const configCheck = this.checkConfig();
    if (!configCheck.valid) {
      console.log(`[Feishu] 跳过同步: ${configCheck.reason}`);
      return { success: false, reason: configCheck.reason };
    }

    try {
      console.log(`[Feishu] 开始同步: ${localPath}`);
      
      // 检查是否需要同步（内容是否变化）
      const shouldSync = await this.shouldSync(localPath, content);
      if (!shouldSync && !options.force) {
        console.log(`[Feishu] 内容未变化，跳过同步: ${localPath}`);
        return { success: true, skipped: true };
      }

      // 获取或创建飞书文档
      const docToken = await this.getOrCreateDocument(localPath, title);
      
      if (!docToken) {
        return { success: false, reason: '无法获取文档token' };
      }

      // 更新文档内容
      const updateResult = await this.updateDocumentContent(docToken, title, content);
      
      if (updateResult.success) {
        // 记录同步状态
        await this.recordSyncStatus(localPath, docToken, content);
        console.log(`[Feishu] 同步成功: ${title} -> ${docToken}`);
        return { 
          success: true, 
          docToken, 
          url: this.getDocumentUrl(docToken),
          localPath 
        };
      } else {
        return { success: false, reason: updateResult.reason };
      }

    } catch (error) {
      console.error(`[Feishu] 同步失败 ${localPath}:`, error.message);
      return { success: false, reason: error.message, error };
    }
  }

  /**
   * 检查是否需要同步
   */
  async shouldSync(localPath, newContent) {
    // 计算新内容的hash
    const newHash = this.calculateHash(newContent);
    
    // 获取上次同步状态
    const lastStatus = this.syncStatus.get(localPath);
    
    if (!lastStatus) {
      return true; // 从未同步过
    }
    
    // 检查内容是否变化
    if (lastStatus.hash === newHash) {
      return false; // 内容未变化
    }
    
    // 检查是否超过同步间隔
    const now = Date.now();
    const lastSyncTime = lastStatus.lastSync || 0;
    const syncInterval = this.config.storage.feishu.sync_interval_minutes * 60 * 1000;
    
    if (now - lastSyncTime < syncInterval && !this.config.storage.feishu.sync_on_complete) {
      return false; // 未到同步时间
    }
    
    return true;
  }

  /**
   * 计算内容hash
   */
  calculateHash(content) {
    // 简单hash计算，实际可以使用更复杂的算法
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 转换为32位整数
    }
    return hash.toString(16);
  }

  /**
   * 获取或创建飞书文档
   */
  async getOrCreateDocument(localPath, title) {
    // 检查是否已有对应的飞书文档
    const existingToken = await this.findExistingDocument(localPath, title);
    if (existingToken) {
      return existingToken;
    }

    // 创建新文档
    return await this.createNewDocument(title);
  }

  /**
   * 查找现有文档
   */
  async findExistingDocument(localPath, title) {
    // 从同步记录中查找
    const status = this.syncStatus.get(localPath);
    if (status && status.docToken) {
      // 验证文档是否还存在
      const exists = await this.verifyDocumentExists(status.docToken);
      if (exists) {
        return status.docToken;
      }
    }

    // TODO: 通过飞书API搜索文档
    // 这里可以扩展：根据标题搜索飞书文档
    
    return null;
  }

  /**
   * 验证文档是否存在
   */
  async verifyDocumentExists(docToken) {
    try {
      // 这里调用飞书API检查文档是否存在
      // 暂时返回true，假设文档存在
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * 创建新文档
   */
  async createNewDocument(title) {
    try {
      console.log(`[Feishu] 创建新文档: ${title}`);
      
      // 使用OpenClaw工具创建文档
      const result = await this.openclaw.feishuDoc('create_and_write', {
        title: title,
        content: '# ' + title + '\n\n文档内容待填充...',
        // owner_open_id: 'YOUR_OPEN_ID' // 如需指定文档所有者，填入你的 open_id
      });
      
      if (result.success) {
        console.log(`[Feishu] 文档创建成功: ${result.doc_token}`);
        return result.doc_token;
      } else {
        console.error(`[Feishu] 文档创建失败:`, result.error);
        return null;
      }
    } catch (error) {
      console.error(`[Feishu] 创建文档失败:`, error);
      return null;
    }
  }

  /**
   * 更新文档内容
   */
  async updateDocumentContent(docToken, title, content) {
    try {
      console.log(`[Feishu] 更新文档内容: ${title} (${docToken})`);
      
      // 使用OpenClaw工具更新文档
      const result = await this.openclaw.feishuDoc('write', {
        doc_token: docToken,
        content: content
      });
      
      if (result.success) {
        console.log(`[Feishu] 文档更新成功: ${docToken}`);
        return { success: true, revision: result.revision };
      } else {
        console.error(`[Feishu] 文档更新失败:`, result.error);
        return { success: false, reason: result.error };
      }
    } catch (error) {
      console.error(`[Feishu] 更新文档失败:`, error);
      return { success: false, reason: error.message };
    }
  }

  /**
   * 记录同步状态
   */
  async recordSyncStatus(localPath, docToken, content) {
    const status = {
      docToken,
      lastSync: Date.now(),
      hash: this.calculateHash(content),
      localPath
    };
    
    this.syncStatus.set(localPath, status);
    
    // 保存到文件
    await this.saveSyncStatus();
  }

  /**
   * 保存同步状态
   */
  async saveSyncStatus() {
    const statusPath = path.join(
      this.config.storage.local.base_path,
      '.feishu_sync_status.json'
    );
    
    try {
      const data = Array.from(this.syncStatus.entries()).reduce((obj, [key, value]) => {
        obj[key] = value;
        return obj;
      }, {});
      
      await fs.ensureDir(path.dirname(statusPath));
      await fs.writeJson(statusPath, data, { spaces: 2 });
    } catch (error) {
      console.warn(`[Feishu] 保存同步状态失败:`, error.message);
    }
  }

  /**
   * 加载同步状态
   */
  async loadSyncStatus() {
    const statusPath = path.join(
      this.config.storage.local.base_path,
      '.feishu_sync_status.json'
    );
    
    try {
      if (await fs.pathExists(statusPath)) {
        const data = await fs.readJson(statusPath);
        for (const [key, value] of Object.entries(data)) {
          this.syncStatus.set(key, value);
        }
        console.log(`[Feishu] 加载了 ${Object.keys(data).length} 条同步记录`);
      }
    } catch (error) {
      console.warn(`[Feishu] 加载同步状态失败:`, error.message);
    }
  }

  /**
   * 获取文档URL
   */
  getDocumentUrl(docToken) {
    // 飞书文档URL格式
    return `https://example.feishu.cn/docx/${docToken}`;
  }

  /**
   * 同步整个目录
   */
  async syncDirectory(dirPath, options = {}) {
    if (!this.enabled) {
      return { success: false, reason: '飞书同步未启用' };
    }

    try {
      console.log(`[Feishu] 开始同步目录: ${dirPath}`);
      
      const files = await this.getAllMarkdownFiles(dirPath);
      const results = [];
      
      for (const file of files) {
        try {
          const content = await fs.readFile(file, 'utf8');
          const title = path.basename(file, '.md');
          
          const result = await this.syncDocument(file, title, content, options);
          results.push({
            file,
            title,
            success: result.success,
            docToken: result.docToken,
            url: result.url
          });
          
          // 避免请求过于频繁
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          console.error(`[Feishu] 同步文件失败 ${file}:`, error.message);
          results.push({
            file,
            success: false,
            error: error.message
          });
        }
      }
      
      const successCount = results.filter(r => r.success).length;
      const totalCount = results.length;
      
      console.log(`[Feishu] 目录同步完成: ${successCount}/${totalCount} 成功`);
      
      return {
        success: successCount > 0,
        total: totalCount,
        successCount,
        results
      };
      
    } catch (error) {
      console.error(`[Feishu] 同步目录失败:`, error);
      return { success: false, reason: error.message };
    }
  }

  /**
   * 获取所有Markdown文件
   */
  async getAllMarkdownFiles(dirPath) {
    const files = [];
    
    if (!await fs.pathExists(dirPath)) {
      return files;
    }

    const items = await fs.readdir(dirPath);
    
    for (const item of items) {
      const itemPath = path.join(dirPath, item);
      const stats = await fs.stat(itemPath);
      
      if (stats.isDirectory()) {
        const subFiles = await this.getAllMarkdownFiles(itemPath);
        files.push(...subFiles);
      } else if (stats.isFile() && item.endsWith('.md')) {
        files.push(itemPath);
      }
    }
    
    return files;
  }

  /**
   * 初始化模块
   */
  async init() {
    if (this.enabled) {
      await this.loadSyncStatus();
      console.log(`[Feishu] 同步模块初始化完成，已启用`);
    } else {
      console.log(`[Feishu] 同步模块未启用`);
    }
  }

  /**
   * 获取同步状态报告
   */
  getSyncReport() {
    const total = this.syncStatus.size;
    const recent = Array.from(this.syncStatus.values())
      .filter(status => Date.now() - status.lastSync < 24 * 60 * 60 * 1000)
      .length;
    
    return {
      enabled: this.enabled,
      configValid: this.checkConfig().valid,
      totalSynced: total,
      recentlySynced: recent,
      lastSync: total > 0 ? 
        new Date(Math.max(...Array.from(this.syncStatus.values()).map(s => s.lastSync))) : 
        null
    };
  }

  /**
   * 手动触发同步
   */
  async manualSync(localPath) {
    if (!this.enabled) {
      return { success: false, reason: '飞书同步未启用' };
    }

    try {
      if (!await fs.pathExists(localPath)) {
        return { success: false, reason: '文件不存在' };
      }

      const content = await fs.readFile(localPath, 'utf8');
      const title = path.basename(localPath, '.md');
      
      return await this.syncDocument(localPath, title, content, { force: true });
    } catch (error) {
      return { success: false, reason: error.message };
    }
  }
}

module.exports = FeishuSync;