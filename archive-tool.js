#!/usr/bin/env node

/**
 * ProjectAwareLogger - 归档工具
 * 用于每日工作日志的本地+飞书双备份
 * 
 * 使用 OpenClaw 的 feishu_doc 工具进行飞书同步
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

// 配置
const CONFIG = {
  local: {
    base_path: path.join(os.homedir(), 'OpenClaw_Archives', 'daily_logs')
  }
};

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

// 使用 OpenClaw feishu_doc 工具创建飞书文档
async function createFeishuDoc(title, content) {
  return new Promise((resolve, reject) => {
    const feishuTool = spawn('openclaw', ['feishu', 'doc', 'create', title, content], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let stdout = '';
    let stderr = '';
    
    feishuTool.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    feishuTool.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    feishuTool.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`feishu doc create failed: ${stderr}`));
      }
    });
  });
}

// 主函数
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
  
  // 2. 飞书同步 - 使用 feishu_drive 工具
  let feishuUrl = null;
  console.log('\n☁️ 正在同步到飞书...');
  try {
    // 使用 feishu_drive import_document 功能
    const feishuTool = spawn('openclaw', [
      'feishu', 'drive', 'import_document',
      title + '.md',
      content
    ], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let stdout = '';
    let stderr = '';
    
    feishuTool.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    feishuTool.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    await new Promise((resolve, reject) => {
      feishuTool.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(stderr || 'feishu import failed'));
        }
      });
    });
    
    // 解析返回的文档链接
    const linkMatch = stdout.match(/https:\/\/feishu\.cn\/docx\/[a-zA-Z0-9]+/);
    if (linkMatch) {
      feishuUrl = linkMatch[0];
      console.log(`✅ 飞书同步成功: ${feishuUrl}`);
    } else {
      console.log(`✅ 飞书同步完成（链接在输出中）`);
      feishuUrl = '已同步';
    }
  } catch (error) {
    console.error(`❌ 飞书同步失败: ${error.message}`);
  }
  
  // 3. 输出结果
  console.log('\n' + '='.repeat(50));
  console.log('📊 归档结果:');
  console.log(`   本地: ${localPath ? '✅ 成功' : '❌ 失败'}`);
  console.log(`   飞书: ${feishuUrl ? '✅ 成功' : '❌ 失败'}`);
  if (feishuUrl && feishuUrl.startsWith('http')) {
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
用法: node archive-tool.js <标题> [内容文件路径]

示例:
  node archive-tool.js "2026-03-08 工作日志" ./log.md
  node archive-tool.js "今日总结" 
`);
    process.exit(1);
  }
  
  const title = args[0];
  const contentFile = args[1];
  
  let content;
  if (contentFile) {
    content = fs.readFileSync(contentFile, 'utf8');
    archive(title, content).catch(console.error);
  } else {
    let content = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => content += chunk);
    process.stdin.on('end', () => {
      archive(title, content).catch(console.error);
    });
  }
}

module.exports = { archive };
