/**
 * popup.js - 弹出界面逻辑
 * 负责展示页面信息、用户选项、进度反馈
 */

// ============================================================
// DOM 元素引用
// ============================================================
const pageTitle = document.getElementById('pageTitle');
const pageUrl = document.getElementById('pageUrl');
const saveBtn = document.getElementById('saveBtn');
const progressArea = document.getElementById('progressArea');
const progressFill = document.getElementById('progressFill');
const progressPercent = document.getElementById('progressPercent');
const statusText = document.getElementById('statusText');
const statsSuccess = document.getElementById('statsSuccess');
const statsSkipped = document.getElementById('statsSkipped');
const statsFailed = document.getElementById('statsFailed');
const optImages = document.getElementById('optImages');
const optVideos = document.getElementById('optVideos');
const optAudio = document.getElementById('optAudio');
const optInlineStyles = document.getElementById('optInlineStyles');
const browserSettingTip = document.getElementById('browserSettingTip');
const openDownloadSettings = document.getElementById('openDownloadSettings');

// 统计计数
let successCount = 0;
let skippedCount = 0;
let failedCount = 0;

// ============================================================
// 检测浏览器"下载前询问"设置
// 方案：发起一个极小的测试下载（1x1 transparent PNG），
// 如果下载被中断或超时，说明浏览器可能在弹出保存对话框。
// 如果下载正常完成，说明没有开启该设置，隐藏提示。
// ============================================================

const DOWNLOAD_ROOT_PATH = 'WebPageSaver';

(async function checkBrowserDownloadSetting() {
  try {
    // 1x1 transparent PNG (最小有效图片，约68字节)
    const testUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQABNjN9GQAAAABJRUEFTkSuQmCC';
    const testPath = DOWNLOAD_ROOT_PATH + '/_test.tmp';

    const downloadId = await chrome.downloads.download({
      url: testUrl,
      filename: testPath,
      saveAs: false,
      conflictAction: 'overwrite',
    });

    // 等待下载结果，2秒超时
    await new Promise((resolve) => {
      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          browserSettingTip.style.display = 'block'; // 超时→可能弹窗阻塞
          cleanupTest(downloadId);
          resolve();
        }
      }, 2000);

      chrome.downloads.onChanged.addListener(function listener(delta) {
        if (delta.id !== downloadId) return;
        if (delta.state) {
          chrome.downloads.onChanged.removeListener(listener);
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            if (delta.state.current === 'interrupted') {
              browserSettingTip.style.display = 'block'; // 中断→可能弹窗取消
            }
            // 正常完成 → 不显示提示
            cleanupTest(downloadId);
            resolve();
          }
        }
      });
    });
  } catch {
    // 测试下载失败，保守起见显示提示
    browserSettingTip.style.display = 'block';
  }
})();

function cleanupTest(downloadId) {
  chrome.downloads.removeFile(downloadId).catch(() => {});
  chrome.downloads.erase({ id: downloadId }).catch(() => {});
}

// 点击"关闭该设置"链接，打开 Chrome 下载设置页面
openDownloadSettings.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: 'chrome://settings/downloads' });
  browserSettingTip.style.display = 'none';
});

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

  // 重置状态
  saveBtn.disabled = true;
  progressArea.style.display = 'block';
  statusText.textContent = '正在分析页面...';
  progressFill.style.width = '0%';
  progressPercent.textContent = '0%';
  statsSuccess.textContent = '';
  statsSkipped.textContent = '';
  statsFailed.textContent = '';
  successCount = 0;
  skippedCount = 0;
  failedCount = 0;

  const options = {
    downloadImages: optImages.checked,
    downloadVideos: optVideos.checked,
    downloadAudio: optAudio.checked,
    keepInlineStyles: optInlineStyles.checked,
  };

  chrome.runtime.sendMessage(
    {
      action: 'savePage',
      tabId: tab.id,
      options,
    },
    (response) => {
      if (chrome.runtime.lastError) {
        statusText.textContent = '❌ 启动失败: ' + chrome.runtime.lastError.message;
        saveBtn.disabled = false;
      }
    }
  );
});

// ============================================================
// 监听来自 background 的进度消息
// ============================================================
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'progress') {
    const { current, total, status } = message;
    const percent = total > 0 ? Math.round((current / total) * 100) : 0;
    progressFill.style.width = percent + '%';
    progressPercent.textContent = percent + '%';
    if (status) statusText.textContent = status;
  }

  if (message.action === 'complete') {
    const stats = message.stats || {};
    successCount = stats.success || 0;
    skippedCount = stats.skipped || 0;
    failedCount = stats.failed || 0;

    statusText.textContent = '✅ 保存完成！';
    progressFill.style.width = '100%';
    progressPercent.textContent = '100%';

    // 显示统计
    statsSuccess.textContent = `✅ ${successCount}`;
    if (skippedCount > 0) statsSkipped.textContent = `⏭️ ${skippedCount}`;
    if (failedCount > 0) statsFailed.textContent = `❌ ${failedCount}`;

    saveBtn.disabled = false;
    saveBtn.textContent = '再次保存';
  }

  if (message.action === 'error') {
    statusText.textContent = '❌ ' + (message.error || '保存失败');
    progressFill.style.width = '0%';
    saveBtn.disabled = false;
  }
});
