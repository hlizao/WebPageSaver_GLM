/**
 * background.js - Service Worker（Manifest V3）
 * 负责协调 content script 和下载操作
 * 核心流程：
 *   1. 注入 content.js 收集资源列表
 *   2. 逐个下载媒体资源到 media 文件夹
 *   3. 通知 content.js 生成 HTML 快照（路径已重写）
 *   4. 下载 HTML 文件
 */

// ============================================================
// 工具函数
// ============================================================

/**
 * 媒体类型对应的子目录名
 */
const MEDIA_SUBDIRS = {
  image: 'pictures',
  video: 'videos',
  audio: 'audios',
};

/**
 * 跨平台路径分隔符（Chrome downloads API 始终使用 /）
 */
const PATH_SEP = '/';

/**
 * Windows 保留文件名（不含扩展名）
 */
const WIN_RESERVED_NAMES = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
]);

/**
 * 从 URL 中提取文件名（跨平台安全）
 * @param {string} url - 资源 URL
 * @returns {string} 安全的文件名
 */
function extractFilename(url) {
  try {
    const pathname = new URL(url).pathname;
    const rawName = decodeURIComponent(pathname.split(PATH_SEP).pop() || '');

    // 如果没有扩展名或文件名为空，生成默认名
    if (!rawName || rawName.length > 200) {
      return 'resource_' + Date.now();
    }

    // 清理文件名中的非法字符（覆盖 Windows/macOS/Linux）
    let safeName = rawName
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')  // 替换非法字符和控制字符
      .replace(/\s+/g, '_')                       // 空格替换为下划线
      .replace(/_+/g, '_')                        // 合并连续下划线
      .replace(/^\.+/, '_')                       // 不以点开头（防止隐藏文件）
      .replace(/\.+$/, '')                        // 不以点结尾
      .substring(0, 200);                         // 限制长度

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
 * 确保文件名唯一：如果重名则添加序号
 * @param {string} name - 原始文件名
 * @param {Set<string>} usedNames - 已使用的文件名集合
 * @returns {string} 唯一的文件名
 */
function ensureUniqueName(name, usedNames) {
  if (!usedNames.has(name)) {
    usedNames.add(name);
    return name;
  }
  // 拆分文件名和扩展名
  const dotIndex = name.lastIndexOf('.');
  const base = dotIndex > 0 ? name.substring(0, dotIndex) : name;
  const ext = dotIndex > 0 ? name.substring(dotIndex) : '';

  let counter = 1;
  let newName;
  do {
    newName = `${base}_${counter}${ext}`;
    counter++;
  } while (usedNames.has(newName));

  usedNames.add(newName);
  return newName;
}

/**
 * 通过 fetch + blob 方式下载资源（支持跨域）
 * @param {string} url - 资源 URL
 * @returns {Promise<Blob|null>} 资源的 Blob，失败返回 null
 */
async function fetchAsBlob(url) {
  try {
    // 先尝试直接 fetch
    const resp = await fetch(url, { mode: 'cors', credentials: 'include' });
    if (resp.ok) {
      return await resp.blob();
    }
  } catch {
    // CORS 失败，尝试 no-cors（可能得到 opaque response）
    try {
      const resp = await fetch(url, { mode: 'no-cors' });
      if (resp.type === 'opaque') {
        // opaque response 无法读取内容，放弃
        console.warn('无法下载跨域资源（opaque response）:', url);
        return null;
      }
      return await resp.blob();
    } catch {
      console.warn('资源下载失败:', url);
      return null;
    }
  }
  return null;
}

/**
 * 生成页面标题作为文件名（跨平台安全）
 * @param {string} title - 页面标题
 * @returns {string} 安全的文件名
 */
function sanitizeFilename(title) {
  let safeName = (title || 'page')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')  // 替换非法字符和控制字符
    .replace(/\s+/g, '_')                       // 空格替换为下划线
    .replace(/_+/g, '_')                        // 合并连续下划线
    .replace(/^\.+/, '_')                       // 不以点开头
    .substring(0, 100);                         // 限制长度

  // 处理 Windows 保留文件名
  const dotIndex = safeName.lastIndexOf('.');
  const baseName = dotIndex > 0 ? safeName.substring(0, dotIndex) : safeName;
  if (WIN_RESERVED_NAMES.has(baseName.toUpperCase())) {
    safeName = '_' + safeName;
  }

  return safeName;
}

// ============================================================
// 消息处理
// ============================================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action !== 'savePage') return false;

  const { tabId, options } = message;
  const tabSender = sender; // 保留引用

  // 异步处理，返回 true 保持消息通道
  (async () => {
    try {
      // ----------------------------------------------------------
      // 步骤 1：注入 content script（如果尚未注入）
      // ----------------------------------------------------------
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content.js'],
      });

      // ----------------------------------------------------------
      // 步骤 2：收集媒体资源列表
      // ----------------------------------------------------------
      sendProgress(tabId, '正在扫描页面资源...', 0, 0);

      const collectResult = await chrome.tabs.sendMessage(tabId, {
        action: 'collectResources',
        options,
      });

      const resources = collectResult.mediaResources || [];
      console.log(`[网页保存器] 发现 ${resources.length} 个媒体资源`);

      if (resources.length === 0) {
        sendProgress(tabId, '未发现媒体资源，直接保存 HTML...', 0, 0);
      }

      // ----------------------------------------------------------
      // 步骤 3：逐个下载媒体资源
      // ----------------------------------------------------------
      const urlMapping = {};   // 原始 URL → 本地文件名
      const usedNames = new Set();

      for (let i = 0; i < resources.length; i++) {
        const res = resources[i];
        sendProgress(tabId, `下载资源 (${i + 1}/${resources.length})`, i, resources.length);

        // 确定本地文件名
        const originalName = extractFilename(res.url);
        const localName = ensureUniqueName(originalName, usedNames);
        // 按媒体类型分目录：pictures/videos/audios
        const subdir = MEDIA_SUBDIRS[res.type] || 'others';
        const localPath = [subdir, localName].join(PATH_SEP);
        urlMapping[res.url] = localPath;

        // 尝试下载资源
        const blob = await fetchAsBlob(res.url);
        if (blob) {
          // 使用 chrome.downloads API 保存到 media 子文件夹
          const blobUrl = URL.createObjectURL(blob);
          try {
            await chrome.downloads.download({
              url: blobUrl,
              filename: ['_web_saver_temp', 'media', localPath].join(PATH_SEP),
              saveAs: false,
              conflictAction: 'uniquify',
            });
          } finally {
            URL.revokeObjectURL(blobUrl);
          }
        }
      }

      // ----------------------------------------------------------
      // 步骤 4：生成 HTML 快照（媒体路径已重写）
      // ----------------------------------------------------------
      sendProgress(tabId, '正在生成页面快照...', resources.length, resources.length);

      const snapshotResult = await chrome.tabs.sendMessage(tabId, {
        action: 'generateSnapshot',
        options,
        urlMapping,
      });

      // ----------------------------------------------------------
      // 步骤 5：保存 HTML 文件
      // ----------------------------------------------------------
      sendProgress(tabId, '正在保存 HTML 文件...', resources.length, resources.length);

      // 获取页面标题
      const tab = await chrome.tabs.get(tabId);
      const pageName = sanitizeFilename(tab.title);

      // 将 HTML 内容转为 Blob 并下载
      const htmlBlob = new Blob([snapshotResult.html], { type: 'text/html;charset=utf-8' });
      const htmlBlobUrl = URL.createObjectURL(htmlBlob);

      await chrome.downloads.download({
        url: htmlBlobUrl,
        filename: ['_web_saver_temp', pageName + '.html'].join(PATH_SEP),
        saveAs: false,
        conflictAction: 'uniquify',
      });

      URL.revokeObjectURL(htmlBlobUrl);

      // ----------------------------------------------------------
      // 完成！
      // ----------------------------------------------------------
      sendProgress(tabId, '✅ 全部完成！', resources.length, resources.length);

      // 通知 popup 完成
      chrome.runtime.sendMessage({ action: 'complete' });
    } catch (err) {
      console.error('[网页保存器] 保存失败:', err);
      chrome.runtime.sendMessage({ action: 'error', error: err.message });
    }
  })();

  return true; // 保持异步消息通道
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
    // popup 可能已关闭，忽略错误
  });
}
