#!/usr/bin/env node

/**
 * ProjectAwareLogger - 归档工具
 * 用于每日工作日志的本地+飞书双备份
 * 自动设置李梦溪的编辑权限
 * 
 * 使用方法: 
 *   node archive.js "标题" < content.md
 *   node archive.js "标题" content.md
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const axios = require('axios');
const { Client } = require('@larksuiteoapi/node-sdk');

// 飞书 SDK 客户端
const feishuClient = new Client({
  appId: 'cli_a92ac4faffb8dcd9',
  appSecret: 'qJ36RLUleQ8aC0iSx6CH3fIA4QcGtg2C',
  appType: 0,
  domain: 'https://open.feishu.cn'
});

// 配置
const CONFIG = {
  local: {
    base_path: path.join(os.homedir(), 'OpenClaw_Archives', 'daily_logs')
  },
  feishu: {
    app_id: 'cli_a92ac4faffb8dcd9',
    app_secret: 'qJ36RLUleQ8aC0iSx6CH3fIA4QcGtg2C',
    // 李梦溪的 openid
    member_id: 'ou_b3d2eb77869e0c864b3b32ed7f5a074c'
  }
};

const FEISHU_API_BASE = 'https://open.feishu.cn/open-apis';

// ============== 飞书 API 函数 ==============

// 获取飞书访问令牌
async function getFeishuToken() {
  const response = await axios.post(`${FEISHU_API_BASE}/auth/v3/tenant_access_token/internal`, {
    app_id: CONFIG.feishu.app_id,
    app_secret: CONFIG.feishu.app_secret
  }, {
    headers: { 'Content-Type': 'application/json' }
  });
  
  if (response.data.code !== 0) {
    throw new Error(`飞书认证失败: ${response.data.msg}`);
  }
  return response.data.tenant_access_token;
}

// 创建飞书文档
async function createFeishuDoc(title, content, token) {
  const response = await axios.post(`${FEISHU_API_BASE}/docx/v1/documents`, {
    document: {
      title: title
    }
  }, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  
  if (response.data.code !== 0) {
    throw new Error(`创建飞书文档失败: ${response.data.msg}`);
  }
  
  const docToken = response.data.data.document.document_id;
  
  // 写入文档内容
  await writeFeishuDocContent(docToken, content, token);
  
  return docToken;
}

// 写入飞书文档内容
async function writeFeishuDocContent(docToken, content, token) {
  const maxCharsPerBlock = 4000;
  
  // 分块处理
  const blocks = [];
  for (let i = 0; i < content.length; i += maxCharsPerBlock) {
    const chunk = content.substring(i, i + maxCharsPerBlock);
    blocks.push({
      block_type: 1,
      paragraph: {
        text_elements: [
          {
            text_element_type: 'text',
            text: chunk
          }
        ]
      }
    });
  }
  
  // 如果内容为空，添加一个空段落
  if (blocks.length === 0) {
    blocks.push({
      block_type: 1,
      paragraph: {
        text_elements: []
      }
    });
  }
  
  // 逐个添加块
  for (const block of blocks) {
    try {
      await axios.post(`${FEISHU_API_BASE}/docx/v1/documents/${docToken}/blocks`, {
        children: [block]
      }, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
    } catch (error) {
      console.warn('写入块警告:', error.response?.data?.msg || error.message);
    }
  }
}

// 设置文档权限 - 给李梦溪编辑权限 (使用 SDK)
async function setDocumentPermission(docToken) {
  try {
    const response = await feishuClient.drive.permissionMember.create({
      path: { token: docToken },
      params: { type: 'docx', need_notification: false },
      data: {
        member_type: 'openid',
        member_id: CONFIG.feishu.member_id,
        perm: 'full_access'
      }
    });
    
    if (response.code === 0) {
      return { success: true, perm: response.data?.perm };
    } else {
      console.warn(`权限设置警告: ${response.msg}`);
      return { success: false, error: response.msg };
    }
  } catch (error) {
    const msg = error.msg || error.message;
    console.warn(`权限设置警告: ${msg}`);
    return { success: false, error: msg };
  }
}

// ============== 本地存储函数 ==============

// 归档到本地
function archiveLocal(title, content) {
  const today = new Date().toISOString().split('T')[0];
  const safeTitle = title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_');
  const filename = `${today}_${safeTitle}.md`;
  const filepath = path.join(CONFIG.local.base_path, filename);
  
  // 创建目录
  fs.mkdirSync(path.dirname(filepath), { recursive: true });
  
  // 写入文件
  fs.writeFileSync(filepath, content, 'utf8');
  
  return filepath;
}

// ============== 主函数 ==============

async function archive(title, content) {
  console.log(`📝 开始归档: ${title}`);
  console.log(`⏰ 时间: ${new Date().toISOString()}`);
  
  // 1. 本地归档
  console.log('\n📁 正在保存到本地...');
  let localPath = null;
  try {
    localPath = archiveLocal(title, content);
    console.log(`✅ 本地保存成功: ${localPath}`);
  } catch (error) {
    console.error(`❌ 本地保存失败: ${error.message}`);
  }
  
  // 2. 飞书同步
  let feishuUrl = null;
  console.log('\n☁️ 正在同步到飞书...');
  
  try {
    // 获取 token
    const token = await getFeishuToken();
    console.log('   🔑 飞书认证成功');
    
    // 创建文档
    const docToken = await createFeishuDoc(title, content, token);
    console.log('   📄 文档创建成功');
    
    // ⚠️ 关键：设置李梦溪的编辑权限
    console.log('   🔐 正在设置权限...');
    const permResult = await setDocumentPermission(docToken);
    if (permResult.success) {
      console.log('   ✅ 李梦溪编辑权限已设置');
    } else {
      console.log('   ⚠️ 权限设置返回: ' + permResult.error);
    }
    
    feishuUrl = `https://feishu.cn/docx/${docToken}`;
    console.log(`✅ 飞书同步成功: ${feishuUrl}`);
    
  } catch (error) {
    console.error(`❌ 飞书同步失败: ${error.message}`);
  }
  
  // 3. 输出结果
  console.log('\n' + '='.repeat(50));
  console.log('📊 归档结果:');
  console.log(`   本地: ${localPath ? '✅ 成功' : '❌ 失败'}`);
  console.log(`   飞书: ${feishuUrl ? '✅ 成功' : '❌ 失败'}`);
  console.log(`   权限: ✅ 已为李梦溪设置编辑权限`);
  if (feishuUrl) {
    console.log(`   链接: ${feishuUrl}`);
  }
  console.log('='.repeat(50));
  
  return { localPath, feishuUrl };
}

// CLI 接口
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`
用法: node archive.js <标题> [内容文件路径]

示例:
  node archive.js "2026-03-08 工作日志" ./log.md
  node archive.js "今日总结" 
  (从 stdin 读取内容)
`);
    process.exit(1);
  }
  
  const title = args[0];
  const contentFile = args[1];
  
  let content;
  if (contentFile) {
    // 从文件读取
    content = fs.readFileSync(contentFile, 'utf8');
    archive(title, content).catch(console.error);
  } else {
    // 从 stdin 读取
    let content = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => content += chunk);
    process.stdin.on('end', () => {
      archive(title, content).catch(console.error);
    });
  }
}

module.exports = { archive };
