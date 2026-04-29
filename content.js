/**
 * content.js - 内容脚本
 * 在网页上下文中执行，负责：
 * 1. 收集所有媒体资源 URL（含嵌入 JSON 中的音频/视频）
 * 2. 克隆完整 DOM 并生成离线快照 HTML
 * 3. 重写媒体路径为本地相对路径
 *
 * 跨平台兼容：Windows / macOS / Linux
 */

// ============================================================
// 常量定义
// ============================================================

/** HTML 路径分隔符 */
const PATH_SEP = '/';

/** 媒体类型对应的子目录名 */
const MEDIA_SUBDIRS = {
  image: 'pictures',
  video: 'videos',
  audio: 'audios',
};

/** 音频/视频文件扩展名映射 */
const MEDIA_EXTENSIONS = {
  audio: ['.m4a', '.mp3', '.wav', '.ogg', '.aac', '.flac', '.wma', '.opus', '.aiff', '.ape'],
  video: ['.mp4', '.webm', '.mkv', '.avi', '.mov', '.flv', '.wmv', '.m4v', '.3gp', '.ts'],
};

/** 日志级别 */
const LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
const CURRENT_LOG_LEVEL = LOG_LEVELS.INFO;

const logger = {
  debug(...args) { if (CURRENT_LOG_LEVEL <= LOG_LEVELS.DEBUG) console.log('[DEBUG][网页保存器]', ...args); },
  info(...args) { if (CURRENT_LOG_LEVEL <= LOG_LEVELS.INFO) console.log('[INFO][网页保存器]', ...args); },
  warn(...args) { if (CURRENT_LOG_LEVEL <= LOG_LEVELS.WARN) console.warn('[WARN][网页保存器]', ...args); },
  error(...args) { if (CURRENT_LOG_LEVEL <= LOG_LEVELS.ERROR) console.error('[ERROR][网页保存器]', ...args); },
};

// ============================================================
// JSON 嵌入资源提取
// ============================================================

/**
 * 从页面嵌入的 JSON 数据中提取音频/视频 URL
 * 扫描 <script> 标签中的 JSON 数据（如 __NEXT_DATA__、__INITIAL_STATE__ 等）
 * @param {Array} resources - 资源列表（会被追加）
 * @param {Set<string>} seenUrls - 已见 URL 集合（去重）
 * @param {string} mediaType - 'audio' 或 'video'
 */
function extractMediaFromEmbeddedJson(resources, seenUrls, mediaType) {
  const extensions = MEDIA_EXTENSIONS[mediaType];
  if (!extensions || extensions.length === 0) return;

  const extPattern = extensions.map(e => e.replace('.', '\\.')).join('|');
  const urlRegex = new RegExp(`https?://[^"'\\s<>}\\\\]+(?:${extPattern})(?:[?#][^"'\\s<>}\\\\]*)?`, 'gi');

  document.querySelectorAll('script').forEach((script) => {
    const text = script.textContent;
    if (!text || text.length < 50 || !text.includes('http')) return;

    const matches = text.match(urlRegex);
    if (!matches) return;

    matches.forEach((url) => {
      const cleanUrl = url.replace(/\\u002F/g, '/').replace(/\\\//g, '/');
      if (!seenUrls.has(cleanUrl)) {
        seenUrls.add(cleanUrl);
        resources.push({ url: cleanUrl, type: mediaType, source: 'embedded-json' });
      }
    });
  });
}

// ============================================================
// 资源收集
// ============================================================

/**
 * 解析相对/绝对 URL（跨平台安全）
 * @param {string} urlStr - URL 字符串
 * @returns {string} 绝对 URL，解析失败返回空字符串
 */
function resolveUrl(urlStr) {
  if (!urlStr || urlStr.startsWith('data:') || urlStr.startsWith('blob:') || urlStr.startsWith('#')) {
    return '';
  }
  try {
    return new URL(urlStr, document.baseURI).href;
  } catch {
    return '';
  }
}

/**
 * 收集页面中所有媒体资源的 URL
 * @param {Object} options - 用户选项
 * @returns {Object} { mediaResources: [{url, type}] }
 */
function collectMediaResources(options) {
  const resources = [];
  const seenUrls = new Set();

  // ---------- 图片资源 ----------
  if (options.downloadImages) {
    // <img> 标签
    document.querySelectorAll('img').forEach((img) => {
      const rawSrc = img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('data-original');
      const src = resolveUrl(rawSrc);
      if (src && !seenUrls.has(src)) {
        seenUrls.add(src);
        resources.push({ url: src, type: 'image', attributeName: 'src' });
      }
      // srcset
      const srcset = img.getAttribute('srcset');
      if (srcset) {
        srcset.split(',').forEach((entry) => {
          const raw = entry.trim().split(/\s+/)[0];
          const u = resolveUrl(raw);
          if (u && !seenUrls.has(u)) {
            seenUrls.add(u);
            resources.push({ url: u, type: 'image' });
          }
        });
      }
    });

    // CSS 背景图片
    document.querySelectorAll('*').forEach((el) => {
      try {
        const style = window.getComputedStyle(el);
        const bgImage = style.backgroundImage;
        if (bgImage && bgImage !== 'none') {
          const urlMatch = bgImage.match(/url\(["']?(.*?)["']?\)/g);
          if (urlMatch) {
            urlMatch.forEach((m) => {
              const raw = m.replace(/url\(["']?/, '').replace(/["']?\)/, '');
              const u = resolveUrl(raw);
              if (u && !seenUrls.has(u)) {
                seenUrls.add(u);
                resources.push({ url: u, type: 'image', isBackgroundImage: true });
              }
            });
          }
        }
      } catch { /* 忽略 getComputedStyle 异常 */ }
    });

    // <picture>/<source> 中的 srcset
    document.querySelectorAll('picture source[srcset]').forEach((source) => {
      const srcset = source.getAttribute('srcset');
      if (srcset) {
        srcset.split(',').forEach((entry) => {
          const raw = entry.trim().split(/\s+/)[0];
          const u = resolveUrl(raw);
          if (u && !seenUrls.has(u)) {
            seenUrls.add(u);
            resources.push({ url: u, type: 'image' });
          }
        });
      }
    });
  }

  // ---------- 视频资源 ----------
  if (options.downloadVideos) {
    document.querySelectorAll('video').forEach((video) => {
      const rawSrc = video.getAttribute('src') || video.querySelector('source')?.getAttribute('src');
      const src = resolveUrl(rawSrc);
      if (src && !seenUrls.has(src)) {
        seenUrls.add(src);
        resources.push({ url: src, type: 'video', attributeName: 'src' });
      }
      video.querySelectorAll('source').forEach((source) => {
        const s = resolveUrl(source.getAttribute('src'));
        if (s && !seenUrls.has(s)) {
          seenUrls.add(s);
          resources.push({ url: s, type: 'video', attributeName: 'src' });
        }
      });
    });
    extractMediaFromEmbeddedJson(resources, seenUrls, 'video');
  }

  // ---------- 音频资源 ----------
  if (options.downloadAudio) {
    document.querySelectorAll('audio').forEach((audio) => {
      const rawSrc = audio.getAttribute('src') || audio.querySelector('source')?.getAttribute('src');
      const src = resolveUrl(rawSrc);
      if (src && !seenUrls.has(src)) {
        seenUrls.add(src);
        resources.push({ url: src, type: 'audio', attributeName: 'src' });
      }
      audio.querySelectorAll('source').forEach((source) => {
        const s = resolveUrl(source.getAttribute('src'));
        if (s && !seenUrls.has(s)) {
          seenUrls.add(s);
          resources.push({ url: s, type: 'audio', attributeName: 'src' });
        }
      });
    });
    extractMediaFromEmbeddedJson(resources, seenUrls, 'audio');
  }

  return { mediaResources: resources };
}

// ============================================================
// 快照生成
// ============================================================

/**
 * 生成页面快照 HTML
 * 克隆 DOM，重写媒体路径为本地相对路径
 * @param {Object} options - 用户选项
 * @param {Object} urlMapping - 原始URL → 本地相对路径的映射
 * @returns {string} 处理后的完整 HTML 字符串
 */
function generateSnapshot(options, urlMapping) {
  const clone = document.documentElement.cloneNode(true);

  // 移除内联样式（可选）
  if (!options.keepInlineStyles) {
    clone.querySelectorAll('style').forEach((s) => s.remove());
  }

  // ---------- 重写嵌入 JSON 中的媒体路径 ----------
  // 必须在移除 <script> 之前处理
  if (options.downloadAudio || options.downloadVideos) {
    clone.querySelectorAll('script').forEach((script) => {
      const text = script.textContent;
      if (!text || !text.includes('http')) return;
      if (script.type === 'application/ld+json' || script.type === 'application/json') return;

      let modified = text;
      let changed = false;
      for (const [originalUrl, localPath] of Object.entries(urlMapping)) {
        if (modified.includes(originalUrl)) {
          modified = modified.split(originalUrl).join('./media/' + localPath);
          changed = true;
        }
      }
      if (changed) {
        script.textContent = modified;
        script.type = 'application/json'; // 禁止执行但保留数据
      }
    });
  }

  // 移除 <script> 标签（保留 application/json、application/ld+json）
  clone.querySelectorAll('script').forEach((s) => {
    if (s.type && s.type !== 'text/javascript' && s.type !== 'module') return;
    s.remove();
  });

  // ---------- 重写图片路径 ----------
  if (options.downloadImages) {
    clone.querySelectorAll('img').forEach((img) => {
      const rawSrc = img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('data-original');
      if (rawSrc && urlMapping[rawSrc]) {
        img.setAttribute('src', './media/' + urlMapping[rawSrc]);
      } else if (rawSrc) {
        // 尝试解析为绝对 URL 后匹配
        try {
          const absUrl = new URL(rawSrc, document.baseURI).href;
          if (urlMapping[absUrl]) {
            img.setAttribute('src', './media/' + urlMapping[absUrl]);
          }
        } catch { /* 忽略 */ }
      }
      // srcset
      const srcset = img.getAttribute('srcset');
      if (srcset) {
        const newSrcset = srcset.replace(/([^,\s]+)(\s+[\d.]+[wx])?/g, (match, url, descriptor) => {
          try {
            const absUrl = new URL(url, document.baseURI).href;
            if (urlMapping[absUrl]) {
              return './media/' + urlMapping[absUrl] + (descriptor || '');
            }
          } catch { /* 忽略 */ }
          if (urlMapping[url]) {
            return './media/' + urlMapping[url] + (descriptor || '');
          }
          return match;
        });
        img.setAttribute('srcset', newSrcset);
      }
      // 移除懒加载属性
      img.removeAttribute('loading');
      img.removeAttribute('data-src');
      img.removeAttribute('data-original');
    });
  }

  // ---------- 重写视频路径 ----------
  if (options.downloadVideos) {
    clone.querySelectorAll('video').forEach((video) => {
      const src = video.getAttribute('src');
      if (src && urlMapping[src]) {
        video.setAttribute('src', './media/' + urlMapping[src]);
      }
      video.querySelectorAll('source').forEach((source) => {
        const s = source.getAttribute('src');
        if (s && urlMapping[s]) {
          source.setAttribute('src', './media/' + urlMapping[s]);
        }
      });
    });
  }

  // ---------- 重写音频路径 ----------
  clone.querySelectorAll('audio').forEach((audio) => {
    const src = audio.getAttribute('src');
    if (src && urlMapping[src]) {
      audio.setAttribute('src', './media/' + urlMapping[src]);
    }
    audio.querySelectorAll('source').forEach((source) => {
      const s = source.getAttribute('src');
      if (s && urlMapping[s]) {
        source.setAttribute('src', './media/' + urlMapping[s]);
      }
    });
  });

  // ---------- 注入离线保存标记样式 ----------
  const baseStyle = document.createElement('style');
  baseStyle.textContent = `
    html::before {
      content: "📄 离线保存版本";
      display: block;
      background: #4285f4;
      color: white;
      padding: 4px 12px;
      font-size: 12px;
      font-family: sans-serif;
    }
  `;
  const head = clone.querySelector('head') || document.createElement('head');
  head.insertBefore(baseStyle, head.firstChild);

  // 移除 <base> 避免相对路径问题
  const baseTag = clone.querySelector('base');
  if (baseTag) baseTag.remove();

  return '<!DOCTYPE html>\n' + clone.outerHTML;
}

// ============================================================
// 消息监听
// ============================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'collectResources') {
    const result = collectMediaResources(message.options);
    logger.info(`收集到 ${result.mediaResources.length} 个资源`);
    sendResponse(result);
    return true;
  }

  if (message.action === 'generateSnapshot') {
    const html = generateSnapshot(message.options, message.urlMapping);
    sendResponse({ html });
    return true;
  }
});
