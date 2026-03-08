/**
 * 飞书API直接调用模块
 * 使用OpenClaw配置的凭证直接调用飞书API
 */

const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');

class FeishuAPI {
  constructor(config) {
    this.config = config;
    this.appId = config.storage.feishu.app_id;
    this.appSecret = config.storage.feishu.app_secret;
    this.defaultFolder = config.storage.feishu.default_folder;
    this.accessToken = null;
    this.tokenExpireTime = 0;
  }

  /**
   * 获取访问令牌
   */
  async getAccessToken() {
    // 检查令牌是否过期（提前5分钟刷新）
    const now = Date.now();
    if (this.accessToken && now < this.tokenExpireTime - 5 * 60 * 1000) {
      return this.accessToken;
    }

    try {
      const response = await axios.post(
        'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
        {
          app_id: this.appId,
          app_secret: this.appSecret
        },
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data.code === 0) {
        this.accessToken = response.data.tenant_access_token;
        this.tokenExpireTime = now + response.data.expire * 1000;
        console.log(`[FeishuAPI] 获取访问令牌成功，有效期: ${response.data.expire}秒`);
        return this.accessToken;
      } else {
        throw new Error(`获取令牌失败: ${response.data.msg}`);
      }
    } catch (error) {
      console.error('[FeishuAPI] 获取访问令牌失败:', error.message);
      throw error;
    }
  }

  /**
   * 调用飞书API
   */
  async callAPI(method, endpoint, data = null) {
    const token = await this.getAccessToken();
    
    try {
      const url = `https://open.feishu.cn/open-apis/${endpoint}`;
      const config = {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      };

      let response;
      if (method === 'GET') {
        response = await axios.get(url, config);
      } else if (method === 'POST') {
        response = await axios.post(url, data, config);
      } else if (method === 'PUT') {
        response = await axios.put(url, data, config);
      } else if (method === 'DELETE') {
        response = await axios.delete(url, config);
      } else {
        throw new Error(`不支持的HTTP方法: ${method}`);
      }

      if (response.data.code === 0) {
        return response.data;
      } else {
        throw new Error(`API调用失败: ${response.data.msg} (code: ${response.data.code})`);
      }
    } catch (error) {
      console.error(`[FeishuAPI] API调用失败 ${method} ${endpoint}:`, error.message);
      if (error.response) {
        console.error('响应数据:', error.response.data);
      }
      throw error;
    }
  }

  /**
   * 创建文档
   */
  async createDocument(title, folderToken = null, ownerId = null) {
    try {
      const data = {
        title: title
      };

      if (folderToken) {
        data.folder_token = folderToken;
      }

      if (ownerId) {
        data.owner_id = ownerId;
        data.owner_id_type = 'open_id';
      }

      const result = await this.callAPI('POST', 'docx/v1/documents', data);
      
      console.log(`[FeishuAPI] 创建文档成功: ${title}`);
      console.log(`  文档Token: ${result.data.document.document_id}`);
      console.log(`  文档链接: https://your-domain.feishu.cn/docx/${result.data.document.document_id}`);
      
      return {
        success: true,
        docToken: result.data.document.document_id,
        url: `https://your-domain.feishu.cn/docx/${result.data.document.document_id}`,
        revision: result.data.document.revision_id
      };
    } catch (error) {
      console.error(`[FeishuAPI] 创建文档失败:`, error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 更新文档内容
   */
  async updateDocument(docToken, content) {
    try {
      // 飞书文档更新需要特定的block格式
      // 这里简化处理，先获取文档结构，然后更新
      
      // 获取文档当前blocks
      const blocksResult = await this.getDocumentBlocks(docToken);
      if (!blocksResult.success) {
        throw new Error('无法获取文档blocks');
      }

      // 如果有内容，先清空文档
      if (blocksResult.blocks && blocksResult.blocks.length > 0) {
        await this.clearDocument(docToken);
      }

      // 创建新的内容block
      const blockData = {
        children: [
          {
            block_type: 2, // 文本block
            text: {
              elements: [
                {
                  text_run: {
                    content: content,
                    text_element_style: {}
                  }
                }
              ],
              style: {}
            }
          }
        ]
      };

      const result = await this.callAPI(
        'POST', 
        `docx/v1/documents/${docToken}/blocks/${docToken}/children`,
        blockData
      );

      console.log(`[FeishuAPI] 更新文档成功: ${docToken}`);
      return {
        success: true,
        revision: result.data.children[0]?.revision_id
      };
    } catch (error) {
      console.error(`[FeishuAPI] 更新文档失败:`, error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 获取文档blocks
   */
  async getDocumentBlocks(docToken) {
    try {
      const result = await this.callAPI(
        'GET', 
        `docx/v1/documents/${docToken}/blocks/${docToken}/children`
      );
      
      return {
        success: true,
        blocks: result.data.items || []
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 清空文档内容
   */
  async clearDocument(docToken) {
    try {
      // 获取所有blocks
      const blocksResult = await this.getDocumentBlocks(docToken);
      if (!blocksResult.success || !blocksResult.blocks) {
        return { success: false, error: '无法获取blocks' };
      }

      // 删除所有子blocks
      for (const block of blocksResult.blocks) {
        await this.callAPI(
          'DELETE',
          `docx/v1/documents/${docToken}/blocks/${block.block_id}`
        );
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 搜索文档
   */
  async searchDocuments(query, options = {}) {
    try {
      const data = {
        query: query,
        search_scopes: [
          {
            scope_type: 1, // 我的文档
            scope_id: "0"
          }
        ]
      };

      if (options.page_size) {
        data.page_size = options.page_size;
      }
      if (options.page_token) {
        data.page_token = options.page_token;
      }

      const result = await this.callAPI('POST', 'drive/v1/files/search', data);
      
      return {
        success: true,
        items: result.data.items || [],
        has_more: result.data.has_more || false,
        page_token: result.data.page_token || null
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 获取文件夹下的文件
   */
  async listFolderFiles(folderToken, options = {}) {
    try {
      let url = `drive/v1/files?folder_token=${folderToken}`;
      
      if (options.page_size) {
        url += `&page_size=${options.page_size}`;
      }
      if (options.page_token) {
        url += `&page_token=${options.page_token}`;
      }
      if (options.order_by) {
        url += `&order_by=${options.order_by}`;
      }

      const result = await this.callAPI('GET', url);
      
      return {
        success: true,
        files: result.data.files || [],
        has_more: result.data.has_more || false,
        page_token: result.data.page_token || null
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 上传文件到飞书
   */
  async uploadFile(filePath, fileName = null) {
    try {
      const stats = await fs.stat(filePath);
      const fileSize = stats.size;
      
      // 1. 准备上传
      const prepareData = {
        file_name: fileName || path.basename(filePath),
        parent_type: 'explorer',
        parent_node: '0',
        size: fileSize
      };

      const prepareResult = await this.callAPI('POST', 'drive/v1/files/upload_prepare', prepareData);
      
      if (!prepareResult.success) {
        throw new Error('上传准备失败');
      }

      const uploadInfo = prepareResult.data;
      
      // 2. 分片上传（简化：小文件直接上传）
      const fileContent = await fs.readFile(filePath);
      
      // 这里简化处理，实际需要根据uploadInfo进行分片上传
      console.log(`[FeishuAPI] 文件上传准备完成: ${fileName || path.basename(filePath)}`);
      console.log(`  上传Token: ${uploadInfo.upload_token}`);
      
      return {
        success: true,
        upload_token: uploadInfo.upload_token,
        file_token: uploadInfo.file_token
      };
    } catch (error) {
      console.error(`[FeishuAPI] 上传文件失败:`, error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 测试API连接
   */
  async testConnection() {
    try {
      const token = await this.getAccessToken();
      if (!token) {
        return { success: false, error: '无法获取访问令牌' };
      }

      // 尝试调用一个简单的API
      const result = await this.callAPI('GET', 'drive/v1/files/root_folder_meta');
      
      return {
        success: true,
        message: '飞书API连接测试成功',
        token_valid: true,
        root_folder: result.data
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        token_valid: false
      };
    }
  }

  /**
   * 获取用户信息
   */
  async getUserInfo(openId) {
    try {
      const result = await this.callAPI('GET', `contact/v3/users/${openId}`);
      
      return {
        success: true,
        user: result.data.user
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 创建文件夹
   */
  async createFolder(name, parentToken = null) {
    try {
      const data = {
        name: name,
        type: 'folder'
      };

      if (parentToken) {
        data.parent_token = parentToken;
      }

      const result = await this.callAPI('POST', 'drive/v1/files/create_folder', data);
      
      return {
        success: true,
        folder_token: result.data.token,
        url: result.data.url
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = FeishuAPI;