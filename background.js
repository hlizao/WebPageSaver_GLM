/**
 * background.js - Service Worker（Manifest V3）
 * 负责协调 content script 和下载操作
 *
 * 核心流程：
 *   1. 注入 content.js 收集资源列表
 *   2. 批量下载媒体资源（限流 + 重试）
 *   3. 通知 content.js 生成 HTML 快照（路径已重写）
 *   4. 下载 HTML 文件
 *   5. 发送完成通知
 *
 * 跨平台兼容：Windows / macOS / Linux
 */

// ============================================================
// 常量定义
// ============================================================

/** 媒体类型对应的子目录名 */
const MEDIA_SUBDIRS = {
  image: 'pictures',
  video: 'videos',
  audio: 'audios',
};

/** 下载根目录名 */
const DOWNLOAD_ROOT = 'WebPageSaver';

/** Chrome downloads API 路径分隔符 */
const PATH_SEP = '/';

/** 并发下载最大数 */
const MAX_CONCURRENT_DOWNLOADS = 3;

/** 下载重试次数 */
const MAX_RETRIES = 3;

/** 重试基础延迟（ms），指数退避 */
const RETRY_BASE_DELAY = 1000;

/** 允许下载的 Content-Type 前缀（安全校验） */
const ALLOWED_CONTENT_TYPES = [
  'image/',
  'video/',
  'audio/',
  'application/octet-stream',
  'application/pdf',
  'text/',
];

/** 危险文件扩展名黑名单（拒绝下载） */
const DANGEROUS_EXTENSIONS = new Set([
  '.exe', '.bat', '.cmd', '.com', '.scr', '.pif', '.msi', '.msp', '.mst',
  '.js', '.vbs', '.wsf', '.wsh', '.ps1', '.psm1', '.app',
  '.deb', '.rpm', '.dmg', '.pkg',
  '.sh', '.bash', '.zsh', '.fish',
]);

/** Windows 保留文件名 */
const WIN_RESERVED_NAMES = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
]);

/** 文件名最大长度 */
const MAX_FILENAME_LENGTH = 200;

/** 大文件阈值（10MB），超过此值使用流式下载 */
const LARGE_FILE_THRESHOLD = 10 * 1024 * 1024;

/** 已下载记录的 storage key */
const STORAGE_KEY_DOWNLOAD_HISTORY = 'downloadHistory';

/** 日志级别 */
const LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
const CURRENT_LOG_LEVEL = LOG_LEVELS.INFO;

// ============================================================
// 日志系统
// ============================================================

const logger = {
  debug(...args) {
    if (CURRENT_LOG_LEVEL <= LOG_LEVELS.DEBUG) {
      console.log('[DEBUG][网页保存器]', ...args);
    }
  },
  info(...args) {
    if (CURRENT_LOG_LEVEL <= LOG_LEVELS.INFO) {
      console.log('[INFO][网页保存器]', ...args);
    }
  },
  warn(...args) {
    if (CURRENT_LOG_LEVEL <= LOG_LEVELS.WARN) {
      console.warn('[WARN][网页保存器]', ...args);
    }
  },
  error(...args) {
    if (CURRENT_LOG_LEVEL <= LOG_LEVELS.ERROR) {
      console.error('[ERROR][网页保存器]', ...args);
    }
  },
};

// ============================================================
// 工具函数
// ============================================================

/**
 * 从 URL 中提取文件名（跨平台安全）
 * 处理 CDN URL 中的 @后缀（如 image.jpg@small → image_small.jpg）
 * @param {string} url - 资源 URL
 * @returns {string} 安全的文件名
 */
function extractFilename(url) {
  try {
    const pathname = new URL(url).pathname;
    let rawName = decodeURIComponent(pathname.split(PATH_SEP).pop() || '');

    if (!rawName || rawName.length > MAX_FILENAME_LENGTH) {
      return 'resource_' + Date.now();
    }

    // 处理 CDN 后缀（如 image.jpg@small, image.png@thumbnail）
    const atIndex = rawName.lastIndexOf('@');
    if (atIndex > 0) {
      const beforeAt = rawName.substring(0, atIndex);
      const afterAt = rawName.substring(atIndex + 1);
      const dotBeforeAt = beforeAt.lastIndexOf('.');
      if (dotBeforeAt > 0) {
        const ext = beforeAt.substring(dotBeforeAt);
        const base = beforeAt.substring(0, dotBeforeAt);
        rawName = base + '_' + afterAt + ext;
      } else {
        rawName = beforeAt + '_' + afterAt;
      }
    }

    // 清理文件名中的非法字符（覆盖 Windows/macOS/Linux）
    let safeName = rawName
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^\.+/, '_')
      .replace(/\.+$/, '')
      .substring(0, MAX_FILENAME_LENGTH);

    // 处理 Windows 保留文件名
    const dotIndex = safeName.lastIndexOf('.');
    const baseName = dotIndex > 0 ? safeName.substring(0, dotIndex) : safeName;
    if (WIN_RESERVED_NAMES.has(baseName.toUpperCase())) {
      safeName = '_' + safeName;
    }

    return safeName || 'resource_' + Date.now();
  } catch {
    return 'resource_' + Date.now();
  }
}

/**
 * 检查文件扩展名是否安全（拒绝可执行文件等危险类型）
 * @param {string} filename - 文件名
 * @returns {boolean} true 表示安全
 */
function isSafeFilename(filename) {
  const dotIndex = filename.lastIndexOf('.');
  if (dotIndex < 0) return true; // 无扩展名，允许
  const ext = filename.substring(dotIndex).toLowerCase();
  return !DANGEROUS_EXTENSIONS.has(ext);
}

/**
 * 校验 Content-Type 是否为允许的媒体类型
 * @param {string} contentType - HTTP Content-Type 头
 * @returns {boolean} true 表示允许下载
 */
function isAllowedContentType(contentType) {
  if (!contentType) return true; // 无 Content-Type 时允许
  const ct = contentType.split(';')[0].trim().toLowerCase();
  return ALLOWED_CONTENT_TYPES.some(allowed => ct.startsWith(allowed));
}

/**
 * 确保文件名唯一（大小写不敏感去重）
 * @param {string} name - 原始文件名
 * @param {Set<string>} usedNames - 已使用的小写文件名集合
 * @returns {string} 唯一的文件名
 */
function ensureUniqueName(name, usedNames) {
  const lowerName = name.toLowerCase();
  if (!usedNames.has(lowerName)) {
    usedNames.add(lowerName);
    return name;
  }

  const dotIndex = name.lastIndexOf('.');
  const base = dotIndex > 0 ? name.substring(0, dotIndex) : name;
  const ext = dotIndex > 0 ? name.substring(dotIndex) : '';

  let counter = 1;
  let newName;
  do {
    newName = `${base}_${counter}${ext}`;
    counter++;
  } while (usedNames.has(newName.toLowerCase()));

  usedNames.add(newName.toLowerCase());
  return newName;
}

/**
 * 生成页面标题作为文件名（跨平台安全）
 * @param {string} title - 页面标题
 * @returns {string} 安全的文件名
 */
function sanitizeFilename(title) {
  let safeName = (title || 'page')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^\.+/, '_')
    .substring(0, 100);

  const dotIndex = safeName.lastIndexOf('.');
  const baseName = dotIndex > 0 ? safeName.substring(0, dotIndex) : safeName;
  if (WIN_RESERVED_NAMES.has(baseName.toUpperCase())) {
    safeName = '_' + safeName;
  }

  return safeName;
}

/**
 * 构建下载文件路径
 * @param  {...string} parts - 路径组成部分
 * @returns {string} 完整的下载路径
 */
function buildDownloadPath(...parts) {
  return [DOWNLOAD_ROOT, ...parts].join(PATH_SEP);
}

/**
 * 延迟函数（用于重试退避）
 * @param {number} ms - 延迟毫秒数
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 将内容字符串转为可下载的 URL
 * MV3 Service Worker 不支持 URL.createObjectURL 和 FileReader，
 * 使用 Blob + URL.createObjectURL 的替代方案：
 * 通过 content script 在页面上下文中创建 Blob URL，再传回 Service Worker
 * 
 * 对于 HTML 内容，直接使用 data: URL（HTML 文件通常不会太大）
 * @param {string} content - 文本内容
 * @param {string} mimeType - MIME 类型
 * @returns {string} data: URL
 */
function contentToDataUrl(content, mimeType = 'text/html;charset=utf-8') {
  // 使用 base64 编码避免特殊字符问题
  const base64 = btoa(unescape(encodeURIComponent(content)));
  return `data:${mimeType};base64,${base64}`;
}

// ============================================================
// 下载历史记录管理
// ============================================================

/**
 * 加载已下载记录（避免会话内重复下载）
 * @returns {Promise<Object>} url → timestamp 映射
 */
async function loadDownloadHistory() {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY_DOWNLOAD_HISTORY);
    return result[STORAGE_KEY_DOWNLOAD_HISTORY] || {};
  } catch {
    return {};
  }
}

/**
 * 保存下载记录
 * @param {Object} history - url → timestamp 映射
 */
async function saveDownloadHistory(history) {
  try {
    // 只保留最近 500 条记录，避免 storage 无限增长
    const entries = Object.entries(history);
    if (entries.length > 500) {
      entries.sort((a, b) => b[1] - a[1]);
      history = Object.fromEntries(entries.slice(0, 500));
    }
    await chrome.storage.local.set({ [STORAGE_KEY_DOWNLOAD_HISTORY]: history });
  } catch (err) {
    logger.warn('保存下载记录失败:', err.message);
  }
}

// ============================================================
// 资源下载核心逻辑
// ============================================================

/**
 * 通过 fetch 下载资源并校验安全性
 * @param {string} url - 资源 URL
 * @returns {Promise<{blob: Blob|null, skipped: boolean, reason: string}>}
 */
async function fetchResourceWithValidation(url) {
  try {
    const resp = await fetch(url, { mode: 'cors', credentials: 'include' });
    if (!resp.ok) {
      // CORS 失败，尝试 no-cors
      try {
        const noCorsResp = await fetch(url, { mode: 'no-cors' });
        if (noCorsResp.type === 'opaque') {
          return { blob: null, skipped: true, reason: 'opaque response' };
        }
        return { blob: await noCorsResp.blob(), skipped: false, reason: '' };
      } catch {
        return { blob: null, skipped: true, reason: 'no-cors fetch 失败' };
      }
    }

    // 校验 Content-Type
    const contentType = resp.headers.get('Content-Type');
    if (!isAllowedContentType(contentType)) {
      logger.warn('拒绝非媒体类型:', contentType, url);
      return { blob: null, skipped: true, reason: `不安全的 Content-Type: ${contentType}` };
    }

    // 大文件检查：直接用原始 URL 下载，不走 blob
    const contentLength = parseInt(resp.headers.get('Content-Length') || '0', 10);
    if (contentLength > LARGE_FILE_THRESHOLD) {
      logger.info('大文件，直接用 URL 下载:', url, `(${(contentLength / 1024 / 1024).toFixed(1)}MB)`);
      return { blob: null, skipped: false, reason: 'large_file', directUrl: url };
    }

    // 小文件也不需要走 blob，直接用原始 URL 更可靠
    // 释放响应，避免内存占用
    return { blob: null, skipped: false, reason: '', directUrl: url };
  } catch {
    // fetch 失败，仍然可以直接用 chrome.downloads 下载
    return { blob: null, skipped: false, reason: '', directUrl: url };
  }
}

/**
 * 带重试的资源下载
 * @param {string} url - 资源 URL
 * @param {string} downloadPath - 下载路径
 * @param {number} retries - 剩余重试次数
 * @returns {Promise<{success: boolean, method: string}>}
 */
async function downloadWithRetry(url, downloadPath, retries = MAX_RETRIES) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // 优先直接用原始 URL 下载（最可靠，不受 Service Worker API 限制）
      // 有了 host_permissions，chrome.downloads 可以直接下载跨域资源
      try {
        await chrome.downloads.download({
          url: url,
          filename: downloadPath,
          saveAs: false,
          conflictAction: 'uniquify',
        });
        return { success: true, method: 'direct' };
      } catch (directErr) {
        // 直接下载失败，记录并重试
        if (attempt < retries) {
          logger.info(`直接下载失败，${RETRY_BASE_DELAY * Math.pow(2, attempt)}ms 后重试 (${attempt + 1}/${retries}):`, directErr.message);
          await delay(RETRY_BASE_DELAY * Math.pow(2, attempt));
          continue;
        }
        logger.warn('直接下载最终失败:', url, directErr.message);
        return { success: false, method: 'direct_failed' };
      }
    } catch (err) {
      if (attempt < retries) {
        logger.info(`下载异常，重试 (${attempt + 1}/${retries}):`, err.message);
        await delay(RETRY_BASE_DELAY * Math.pow(2, attempt));
        continue;
      }
      logger.error('下载最终失败:', url, err.message);
      return { success: false, method: 'error' };
    }
  }
  return { success: false, method: 'exhausted_retries' };
}

/**
 * 并发限流下载资源列表
 * @param {Array} resources - 资源列表 [{url, type, ...}]
 * @param {Function} onProgress - 进度回调 (current, total, status)
 * @returns {Promise<{urlMapping: Object, stats: Object}>}
 */
async function downloadResources(resources, onProgress) {
  const urlMapping = {};
  const usedNames = new Set();
  const stats = { total: resources.length, success: 0, skipped: 0, failed: 0 };

  // 并发限流：使用信号量模式
  let running = 0;
  const queue = [...resources];
  const results = [];

  const processNext = async () => {
    if (queue.length === 0) return;

    const res = queue.shift();
    running++;

    try {
      // 安全校验：文件扩展名
      const tempName = extractFilename(res.url);
      if (!isSafeFilename(tempName)) {
        logger.warn('拒绝危险文件:', tempName);
        stats.skipped++;
        onProgress(stats.success + stats.skipped + stats.failed, stats.total,
          `跳过危险文件: ${tempName}`);
        return;
      }

      // 确定本地文件名和路径
      const originalName = extractFilename(res.url);
      const localName = ensureUniqueName(originalName, usedNames);
      const subdir = MEDIA_SUBDIRS[res.type] || 'others';
      const localPath = [subdir, localName].join(PATH_SEP);
      urlMapping[res.url] = localPath;

      const downloadPath = buildDownloadPath('media', localPath);
      const current = stats.success + stats.skipped + stats.failed;

      onProgress(current, stats.total, `下载资源 (${current + 1}/${stats.total})`);

      const result = await downloadWithRetry(res.url, downloadPath);

      if (result.success) {
        stats.success++;
      } else if (result.method === 'skipped') {
        stats.skipped++;
      } else {
        stats.failed++;
      }
    } finally {
      running--;
      // 尝试启动下一个
      if (queue.length > 0 && running < MAX_CONCURRENT_DOWNLOADS) {
        processNext();
      }
    }
  };

  // 启动初始并发
  const initialBatch = Math.min(MAX_CONCURRENT_DOWNLOADS, queue.length);
  const promises = [];
  for (let i = 0; i < initialBatch; i++) {
    promises.push(processNext());
  }

  // 等待所有完成
  await new Promise(resolve => {
    const check = setInterval(() => {
      if (queue.length === 0 && running === 0) {
        clearInterval(check);
        resolve();
      }
    }, 100);
  });

  return { urlMapping, stats };
}

// ============================================================
// 消息处理（主流程）
// ============================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action !== 'savePage') return false;

  const { tabId, options } = message;

  (async () => {
    try {
      // ----------------------------------------------------------
      // 步骤 1：注入 content script（如果尚未注入）
      // ----------------------------------------------------------
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['content.js'],
        });
      } catch (injectErr) {
        // 可能已注入，忽略错误
        logger.debug('脚本注入跳过:', injectErr.message);
      }

      // ----------------------------------------------------------
      // 步骤 2：收集媒体资源列表
      // ----------------------------------------------------------
      sendProgress(tabId, '正在扫描页面资源...', 0, 0);

      const collectResult = await chrome.tabs.sendMessage(tabId, {
        action: 'collectResources',
        options,
      });

      const resources = collectResult.mediaResources || [];
      logger.info(`发现 ${resources.length} 个媒体资源`);

      // ----------------------------------------------------------
      // 步骤 3：批量下载媒体资源（限流 + 重试）
      // ----------------------------------------------------------
      const { urlMapping, stats } = await downloadResources(
        resources,
        (current, total, status) => sendProgress(tabId, status, current, total)
      );

      logger.info(`下载完成: 成功=${stats.success} 跳过=${stats.skipped} 失败=${stats.failed}`);

      // ----------------------------------------------------------
      // 步骤 4：生成 HTML 快照（媒体路径已重写）
      // ----------------------------------------------------------
      sendProgress(tabId, '正在生成页面快照...', stats.total, stats.total);

      const snapshotResult = await chrome.tabs.sendMessage(tabId, {
        action: 'generateSnapshot',
        options,
        urlMapping,
      });

      // ----------------------------------------------------------
      // 步骤 5：保存 HTML 文件
      // ----------------------------------------------------------
      sendProgress(tabId, '正在保存 HTML 文件...', stats.total, stats.total);

      const tab = await chrome.tabs.get(tabId);
      const pageName = sanitizeFilename(tab.title);

      // 使用 data: URL 保存 HTML（MV3 Service Worker 兼容，HTML 通常不会太大）
      const htmlDataUrl = contentToDataUrl(snapshotResult.html);

      await chrome.downloads.download({
        url: htmlDataUrl,
        filename: buildDownloadPath(pageName + '.html'),
        saveAs: false,
        conflictAction: 'uniquify',
      });

      // ----------------------------------------------------------
      // 步骤 6：保存下载记录
      // ----------------------------------------------------------
      const history = await loadDownloadHistory();
      const now = Date.now();
      for (const url of Object.keys(urlMapping)) {
        history[url] = now;
      }
      await saveDownloadHistory(history);

      // ----------------------------------------------------------
      // 步骤 7：发送完成通知
      // ----------------------------------------------------------
      const summary = `✅ 保存完成！\n成功: ${stats.success} | 跳过: ${stats.skipped} | 失败: ${stats.failed}`;
      sendProgress(tabId, summary, stats.total, stats.total);
      chrome.runtime.sendMessage({ action: 'complete', stats });

      // 系统通知
      try {
        await chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon128.png',
          title: '网页保存器',
          message: `${pageName}.html 保存完成\n成功${stats.success} / 跳过${stats.skipped} / 失败${stats.failed}`,
        });
      } catch {
        logger.debug('通知发送失败（可能未授权）');
      }

    } catch (err) {
      logger.error('保存失败:', err);
      chrome.runtime.sendMessage({ action: 'error', error: err.message });
    }
  })();

  return true;
});

/**
 * 向 popup 发送进度更新
 */
function sendProgress(tabId, status, current, total) {
  chrome.runtime.sendMessage({
    action: 'progress',
    status,
    current,
    total,
  }).catch(() => {
    // popup 可能已关闭，忽略
  });
}
