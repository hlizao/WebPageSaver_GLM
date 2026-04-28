/**
 * popup.js - 弹出界面逻辑
 * 负责展示页面信息、用户确认、进度显示
 */

// ============================================================
// DOM 元素引用
// ============================================================
const pageTitle = document.getElementById('pageTitle');
const pageUrl = document.getElementById('pageUrl');
const saveBtn = document.getElementById('saveBtn');
const progressArea = document.getElementById('progressArea');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const statusText = document.getElementById('statusText');
const optImages = document.getElementById('optImages');
const optVideos = document.getElementById('optVideos');
const optInlineStyles = document.getElementById('optInlineStyles');

// ============================================================
// 初始化：获取当前标签页信息
// ============================================================
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (tabs[0]) {
    pageTitle.textContent = tabs[0].title || '未知页面';
    pageUrl.textContent = tabs[0].url || '-';
  }
});

// ============================================================
// 保存按钮点击事件
// ============================================================
saveBtn.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;

  // 禁用按钮，显示进度区域
  saveBtn.disabled = true;
  progressArea.style.display = 'block';
  statusText.textContent = '正在分析页面...';

  // 收集用户选项
  const options = {
    downloadImages: optImages.checked,
    downloadVideos: optVideos.checked,
    keepInlineStyles: optInlineStyles.checked,
  };

  // 向 background 发送保存请求
  chrome.runtime.sendMessage(
    {
      action: 'savePage',
      tabId: tab.id,
      options: options,
    },
    (response) => {
      if (chrome.runtime.lastError) {
        statusText.textContent = '❌ 启动失败: ' + chrome.runtime.lastError.message;
        saveBtn.disabled = false;
        return;
      }
      // 保存任务已启动，后续进度通过消息更新
    }
  );
});

// ============================================================
// 监听来自 background 的进度消息
// ============================================================
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'progress') {
    // 更新进度条和文字
    const { current, total, status } = message;
    const percent = total > 0 ? Math.round((current / total) * 100) : 0;
    progressFill.style.width = percent + '%';
    progressText.textContent = `${current} / ${total}`;
    if (status) statusText.textContent = status;
  }

  if (message.action === 'complete') {
    statusText.textContent = '✅ 保存完成！';
    progressFill.style.width = '100%';
    progressText.textContent = '全部完成';
    saveBtn.disabled = false;
    saveBtn.textContent = '再次保存';
  }

  if (message.action === 'error') {
    statusText.textContent = '❌ ' + (message.error || '保存失败');
    saveBtn.disabled = false;
  }
});
