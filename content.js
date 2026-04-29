/**
 * content.js - 内容脚本
 * 在网页上下文中执行，负责：
 * 1. 克隆完整 DOM
 * 2. 收集所有媒体资源 URL
 * 3. 将跨域资源转为 blob URL
 * 4. 返回处理后的 HTML 和资源列表
 */

/**
 * 媒体类型对应的子目录名
 */
const MEDIA_SUBDIRS = {
  image: 'pictures',
  video: 'videos',
  audio: 'audios',
};

/**
 * 音频/视频文件扩展名映射
 */
const MEDIA_EXTENSIONS = {
  audio: ['.m4a', '.mp3', '.wav', '.ogg', '.aac', '.flac', '.wma', '.opus'],
  video: ['.mp4', '.webm', '.mkv', '.avi', '.mov', '.flv', '.wmv', '.m4v'],
};

/**
 * 从页面嵌入的 JSON 数据中提取音频/视频 URL
 * 扫描 <script> 标签中的 JSON 数据（如 __NEXT_DATA__、__INITIAL_STATE__ 等）
 * 递归遍历 JSON 对象，查找包含媒体扩展名的 URL 字符串
 * @param {Array} resources - 资源列表（会被追加）
 * @param {Set<string>} seenUrls - 已见 URL 集合（去重）
 * @param {string} mediaType - 'audio' 或 'video'
 */
function extractMediaFromEmbeddedJson(resources, seenUrls, mediaType) {
  const extensions = MEDIA_EXTENSIONS[mediaType];
  if (!extensions || extensions.length === 0) return;

  // 构建 URL 匹配正则：匹配 http(s)://...扩展名 的 URL
  const extPattern = extensions.map(e => e.replace('.', '\\.')).join('|');
  const urlRegex = new RegExp(`https?://[^"'\\s<>}\\\\]+(?:${extPattern})(?:[?#][^"'\\s<>}\\\\]*)?`, 'gi');

  // 扫描所有 <script> 标签
  document.querySelectorAll('script').forEach((script) => {
    const text = script.textContent;
    if (!text || text.length < 50) return; // 跳过空或极短的脚本

    // 仅扫描含有 JSON 数据特征的脚本
    if (!text.includes('http') || !text.includes('.')) return;

    const matches = text.match(urlRegex);
    if (!matches) return;

    matches.forEach((url) => {
      // 清理 URL（去除可能的转义字符）
      const cleanUrl = url.replace(/\\u002F/g, '/').replace(/\\\//g, '/');
      if (!seenUrls.has(cleanUrl)) {
        seenUrls.add(cleanUrl);
        resources.push({
          url: cleanUrl,
          type: mediaType,
          source: 'embedded-json',
        });
      }
    });
  });
}

/**
 * 收集页面中所有媒体资源的 URL
 * @param {Object} options - 用户选项
 * @returns {Object} { mediaResources: [{url, type, filename}] }
 */
function collectMediaResources(options) {
  const resources = [];
  const seenUrls = new Set(); // 去重

  // ---------- 图片资源 ----------
  if (options.downloadImages) {
    // <img> 标签
    document.querySelectorAll('img').forEach((img) => {
      const src = img.src || img.getAttribute('data-src') || img.getAttribute('data-original');
      if (src && !src.startsWith('data:') && !seenUrls.has(src)) {
        seenUrls.add(src);
        resources.push({
          url: src,
          type: 'image',
          selector: null, // 后续填充
          attributeName: 'src',
        });
      }
    });

    // CSS 背景图片（通过 getComputedStyle 获取）
    document.querySelectorAll('*').forEach((el) => {
      const style = window.getComputedStyle(el);
      const bgImage = style.backgroundImage || style.background;
      if (bgImage && bgImage !== 'none') {
        const urlMatch = bgImage.match(/url\(["']?(.*?)["']?\)/g);
        if (urlMatch) {
          urlMatch.forEach((m) => {
            const u = m.replace(/url\(["']?/, '').replace(/["']?\)/, '');
            if (u && !u.startsWith('data:') && !u.startsWith('#') && !seenUrls.has(u)) {
              seenUrls.add(u);
              resources.push({
                url: u,
                type: 'image',
                isBackgroundImage: true,
              });
            }
          });
        }
      }
    });

    // <picture> / <source> 中的 srcset
    document.querySelectorAll('source[srcset]').forEach((source) => {
      const srcset = source.getAttribute('srcset');
      if (srcset) {
        srcset.split(',').forEach((entry) => {
          const u = entry.trim().split(/\s+/)[0];
          if (u && !u.startsWith('data:') && !seenUrls.has(u)) {
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
      const src = video.src || video.querySelector('source')?.src;
      if (src && !src.startsWith('data:') && !src.startsWith('blob:') && !seenUrls.has(src)) {
        seenUrls.add(src);
        resources.push({ url: src, type: 'video', attributeName: 'src' });
      }
      // <source> 子标签
      video.querySelectorAll('source').forEach((source) => {
        const s = source.src;
        if (s && !s.startsWith('data:') && !s.startsWith('blob:') && !seenUrls.has(s)) {
          seenUrls.add(s);
          resources.push({ url: s, type: 'video', attributeName: 'src' });
        }
      });
    });
  }

  // ---------- 音频资源 ----------
  if (options.downloadAudio) {
    document.querySelectorAll('audio').forEach((audio) => {
      const src = audio.src || audio.querySelector('source')?.src;
      if (src && !src.startsWith('data:') && !src.startsWith('blob:') && !seenUrls.has(src)) {
        seenUrls.add(src);
        resources.push({ url: src, type: 'audio', attributeName: 'src' });
      }
      audio.querySelectorAll('source').forEach((source) => {
        const s = source.src;
        if (s && !s.startsWith('data:') && !s.startsWith('blob:') && !seenUrls.has(s)) {
          seenUrls.add(s);
          resources.push({ url: s, type: 'audio', attributeName: 'src' });
        }
      });
    });

    // 从页面嵌入的 JSON 数据中提取音频 URL（如 __NEXT_DATA__、__INITIAL_STATE__ 等）
    extractMediaFromEmbeddedJson(resources, seenUrls, 'audio');
  }

  // 从页面嵌入的 JSON 数据中提取视频 URL
  if (options.downloadVideos) {
    extractMediaFromEmbeddedJson(resources, seenUrls, 'video');
  }

  return { mediaResources: resources };
}

/**
 * 生成页面快照 HTML
 * 克隆 DOM，重写媒体路径为本地相对路径
 * @param {Object} options - 用户选项
 * @param {Object} urlMapping - 原始URL → 本地文件名的映射
 * @returns {string} 处理后的完整 HTML 字符串
 */
function generateSnapshot(options, urlMapping) {
  // 克隆整个文档
  const clone = document.documentElement.cloneNode(true);

  // 如果不保留内联样式，移除 <style> 标签
  if (!options.keepInlineStyles) {
    clone.querySelectorAll('style').forEach((s) => s.remove());
  }

  // ---------- 重写嵌入 JSON 中的媒体路径 ----------
  // 必须在移除 <script> 之前处理，否则 JSON 数据会丢失
  // 将 <script> 中的媒体 URL 替换为本地路径，同时将 script type 改为 application/json
  // 这样离线查看时数据保留但不会执行
  if (options.downloadAudio || options.downloadVideos) {
    clone.querySelectorAll('script').forEach((script) => {
      const text = script.textContent;
      if (!text || !text.includes('http')) return;
      // 保留 application/ld+json 和 application/json 类型
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
        // 改为 JSON 类型，防止执行但保留数据
        script.type = 'application/json';
      }
    });
  }

  // 移除 <script> 标签（避免执行风险）
  // 保留 type="application/ld+json"、"application/json" 等非执行脚本
  clone.querySelectorAll('script').forEach((s) => {
    if (s.type && s.type !== 'text/javascript' && s.type !== 'module') return;
    s.remove();
  });

  // ---------- 重写图片路径 ----------
  if (options.downloadImages) {
    clone.querySelectorAll('img').forEach((img) => {
      const src = img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('data-original');
      if (src && urlMapping[src]) {
        img.setAttribute('src', './media/' + urlMapping[src]);
      }
      // 处理 srcset
      const srcset = img.getAttribute('srcset');
      if (srcset) {
        const newSrcset = srcset.replace(/([^,\s]+)(\s+[\d.]+[wx])?/g, (match, url, descriptor) => {
          if (urlMapping[url]) {
            return './media/' + urlMapping[url] + (descriptor || '');
          }
          return match;
        });
        img.setAttribute('srcset', newSrcset);
      }
      // 移除懒加载属性，确保离线显示
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

  // ---------- 注入基础样式，确保页面可读 ----------
  const baseStyle = document.createElement('style');
  baseStyle.textContent = `
    /* 离线保存标记 */
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

  // 设置 <base> 为空，避免相对路径问题
  const baseTag = clone.querySelector('base');
  if (baseTag) baseTag.remove();

  // 构建完整 HTML
  const html = '<!DOCTYPE html>\n' + clone.outerHTML;
  return html;
}

// ============================================================
// 监听来自 background 的消息
// ============================================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'collectResources') {
    // 第一步：收集媒体资源
    const result = collectMediaResources(message.options);
    sendResponse(result);
    return true;
  }

  if (message.action === 'generateSnapshot') {
    // 第二步：根据 URL 映射生成快照
    const html = generateSnapshot(message.options, message.urlMapping);
    sendResponse({ html });
    return true;
  }
});
