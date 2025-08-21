// Global variables
let altKeyTimeout = null; // 添加定时器ID变量
let longPressTimeout = null; // 添加长按定时器
let isLongPressing = false; // 添加长按状态标记
let activePreviewUrls = []; // 修改为数组，存储所有活动的预览URL
let activePreviews = new Map(); // 添加Map来存储预览窗口的引用
let currentLanguage = 'zh_CN'; // 当前语言设置
let isCurrentUserVip = true;
let longPressLoadingIndicator = null; // Add this line
let currentZIndex = 999999; // 添加z-index计数器
const BASE_ZINDEX = 999990; // 基础z-index值
const OVERLAY_ZINDEX = 999995; // 遮罩层z-index值
const ACTIVE_ZINDEX = 999999; // 活动窗口z-index值

// 添加悬停防抖变量
let currentHoveredLink = null;
let hoverDebounceTimeout = null;

// Shadow DOM variables
let shadowHost = null;
let shadowRoot = null;

// Shadow DOM management functions
function initShadowDOM() {
  if (shadowHost && shadowRoot) {
    return shadowRoot; // Already initialized
  }
  
  // Create shadow host element
  shadowHost = document.createElement('div');
  shadowHost.id = 'notab-shadow-host';
  shadowHost.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 0;
    height: 0;
    pointer-events: none;
    z-index: ${BASE_ZINDEX};
    overflow: visible;
  `;
  
  // Create shadow root
  shadowRoot = shadowHost.attachShadow({ mode: 'open' }); // Changed to 'open' for better compatibility
  
  // Add to document body
  document.body.appendChild(shadowHost);
  
  return shadowRoot;
}

function getShadowRoot() {
  if (!shadowRoot) {
    return initShadowDOM();
  }
  return shadowRoot;
}

function appendToShadowDOM(element) {
  const root = getShadowRoot();
  // Enable pointer events for the specific element
  element.style.pointerEvents = 'auto';
  // Ensure the element has proper positioning
  if (!element.style.position || element.style.position === 'static') {
    element.style.position = 'fixed';
  }
  root.appendChild(element);
}

function removeFromShadowDOM(element) {
  if (shadowRoot && element && element.parentNode === shadowRoot) {
    shadowRoot.removeChild(element);
  }
}

function addStylesToShadowDOM(styleElement) {
  const root = getShadowRoot();
  root.appendChild(styleElement);
}

// 拖拽方向检测相关变量
let dragStartX = 0;
let dragStartY = 0;
let isDragging = false;

// Add link summary cache
let linkSummaryCache = {};

// Global link preview settings
let linkPreviewSettings = {
  triggerMode: 'alt_hover', // 'alt_hover', 'alt_click', or 'long_press'
  longPressDelay: 500, // 长按触发延迟（毫秒）
  altHoverDelay: 200, // Alt+悬停触发延迟（毫秒）
  hoverDelay: 500, // 悬停触发延迟（毫秒）
  previewSize: 'medium', // 预览框大小，可选值：'small', 'medium', 'large', 'last'
  previewPosition: 'cursor', // 预览框位置，可选值：'cursor', 'left', 'center', 'right', 'last'
  previewTheme: 'light', // Add this line: 'light', 'dark', 'gray'
  overlayOpacity: 50, // 添加背景遮罩透明度设置，默认50%
  blacklistSites: [], // Add this line: Blacklist sites
  customTriggerKey: 'alt' // 自定义触发键：'alt', 'cmd', 'ctrl'
};

// 添加上次预览框位置和大小的存储
let lastPreviewState = {
  width: null,
  height: null,
  left: null,
  top: null,
  lastUsedPreset: 'medium' // 记录最后使用的预设大小
};

// 加载上次的预览状态
function loadLastPreviewState() {
  chrome.storage.local.get(['lastPreviewState'], function (result) {
    if (result.lastPreviewState) {
      lastPreviewState = result.lastPreviewState;
    }
  });
}

// 保存预览状态 - 添加防抖优化
let saveStateTimeout = null;
function saveLastPreviewState() {
  // 清除之前的定时器
  if (saveStateTimeout) {
    clearTimeout(saveStateTimeout);
  }
  
  // 延迟保存，避免频繁写入存储
  saveStateTimeout = setTimeout(() => {
    chrome.storage.local.set({ lastPreviewState });
    saveStateTimeout = null;
  }, 300); // 300ms 延迟
}

// 计算预览框位置
function calculatePreviewPosition(event, tooltipWidth, tooltipHeight) {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  let left, top;

  switch (linkPreviewSettings.previewPosition) {
    case 'left':
      left = 20;
      top = (viewportHeight - tooltipHeight) / 2;
      break;
    case 'right':
      left = viewportWidth - tooltipWidth - 20;
      top = (viewportHeight - tooltipHeight) / 2;
      break;
    case 'center':
      left = (viewportWidth - tooltipWidth) / 2;
      top = (viewportHeight - tooltipHeight) / 2;
      break;
    case 'last':
      if (lastPreviewState.left !== null && lastPreviewState.top !== null) {
        left = lastPreviewState.left;
        top = lastPreviewState.top;
      } else {
        // 如果没有上次位置记录，使用中间位置
        left = (viewportWidth - tooltipWidth) / 2;
        top = (viewportHeight - tooltipHeight) / 2;
      }
      break;
    default: // cursor
      left = event ? event.clientX - 20 : (viewportWidth - tooltipWidth) / 2;
      top = event ? event.clientY - 20 : (viewportHeight - tooltipHeight) / 2;
  }

  // 确保预览框不会超出视口
  left = Math.max(20, Math.min(left, viewportWidth - tooltipWidth - 20));
  top = Math.max(20, Math.min(top, viewportHeight - tooltipHeight - 20));

  return { left, top };
}

// 获取预览框大小
function getPreviewSize() {
  let tooltipWidth, tooltipHeight;

  if (linkPreviewSettings.previewSize === 'last') {
    // 如果选择了"上次大小"，但没有手动调整过大小，使用最后的预设大小
    if (lastPreviewState.width === null || lastPreviewState.height === null) {
      return getPresetSize(lastPreviewState.lastUsedPreset);
    }
    return {
      tooltipWidth: lastPreviewState.width,
      tooltipHeight: lastPreviewState.height
    };
  } else {
    // 使用预设大小时，更新最后使用的预设
    lastPreviewState.lastUsedPreset = linkPreviewSettings.previewSize;
    return getPresetSize(linkPreviewSettings.previewSize);
  }
}

// 获取预设大小
function getPresetSize(preset) {
  switch (preset) {
    case 'small':
      return { tooltipWidth: 500, tooltipHeight: 600 };
    case 'large':
      return { tooltipWidth: 900, tooltipHeight: 1000 };
    case 'medium':
    default:
      return { tooltipWidth: 700, tooltipHeight: 800 };
  }
}

// 全局选中文本搜索设置
let textSearchSettings = {
  enabled: true,
  searchEngine: 'google',
  customSearchUrl: '',
  dragTextAction: 'disabled', // 默认禁用拖拽文字动作
  dragUrlAutoOpen: true, // 添加自动打开链接功能
  dragLeftAction: 'translate', // 左拖动作：'translate' 或 'search'
  dragRightAction: 'search' // 右拖动作：'translate' 或 'search'
};

// 搜索引擎URL模板
const searchEngineUrls = {
  google: 'https://www.google.com/search?q=%s',
  bing: 'https://www.bing.com/search?q=%s',
  baidu: 'https://www.baidu.com/s?wd=%s'
};

function makeHeaders() {
  const headers = {
    'Content-Type': 'application/json'
  };
  return headers;
}

// Initialize the extension
async function init() {
  // console.log('[NoTab] 初始化...');

  // 初始化 Shadow DOM
  initShadowDOM();

  // 加载预览设置
  await new Promise(resolve => {
    chrome.storage.local.get(['linkPreviewSettings'], function (result) {
      if (result.linkPreviewSettings) {
        linkPreviewSettings = {
          ...linkPreviewSettings,
          ...result.linkPreviewSettings
        };
        
        // 如果有自定义主题颜色，应用自定义主题样式
        if (linkPreviewSettings.previewTheme === 'custom' && linkPreviewSettings.customThemeColors) {
          updateCustomThemeStyle(linkPreviewSettings.customThemeColors);
        }
      }
      resolve();
    });
  });

  // 检查当前网站是否在黑名单中
  if (isCurrentSiteBlacklisted()) {
    // console.log('[NoTab] 当前网站在黑名单中，不启用链接预览');
    return; // 直接退出初始化
  }

  // 设置事件监听器
  setupEventListeners();

  // 添加链接预览样式 - 更新样式规则
  const linkTooltipStyle = document.createElement('style');
  linkTooltipStyle.textContent = `
    .NoTab-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0, 0, 0, 0);
      z-index: 999998;
      pointer-events: none;
      transition: background-color 0.2s ease;
    }

    .NoTab-overlay-visible {
      background-color: rgba(0, 0, 0, calc(var(--overlay-opacity, 0.5)));
      pointer-events: auto;
    }

    .NoTab-link-tooltip {
      position: fixed;
      z-index: 999999;
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
      opacity: 0;
      transform: translateY(10px);
      transition: opacity 0.2s ease, transform 0.2s ease;
      overflow: hidden;
      max-width: 90vw;
      max-height: 90vh;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      display: flex;
      flex-direction: column;
      /* 性能优化：启用硬件加速 */
      will-change: auto;
      backface-visibility: hidden;
      -webkit-backface-visibility: hidden;
    }

    /* 拖拽时的样式优化 */
    .NoTab-link-tooltip.dragging {
      transition: none;
      box-shadow: 0 8px 25px rgba(0, 0, 0, 0.25);
    }

    .NoTab-link-tooltip.dragging iframe {
      pointer-events: none;
    }

    /* 调整大小时的样式优化 */
    .NoTab-link-tooltip.resizing {
      transition: none;
    }

    .NoTab-link-tooltip.resizing iframe {
      pointer-events: none;
    }

    .NoTab-link-tooltip-visible {
      opacity: 1;
      transform: translateY(0);
    }

    .NoTab-link-tooltip-content {
      display: flex;
      flex-direction: column;
      overflow: hidden;
      height: 100%;
      border-radius: 12px; /* Apply border-radius here */
      background: #fff;
    }

    /* Updated Header Styles */
    .NoTab-link-tooltip-header {
      display: flex;
      align-items: center;
      justify-content: space-between; /* 确保元素之间分布均匀 */
      padding: 6px 8px 6px 12px;
      background: #f5f5f5;
      border-bottom: 1px solid #e0e0e0;
      cursor: move;
      user-select: none;
      height: 40px;
      gap: 8px; /* 增加元素间距 */
      flex-shrink: 0;
    }

    /* New Link Group Styles */
    .NoTab-link-tooltip-link-group {
      display: flex;
      align-items: center;
      gap: 6px;
      flex: 1; /* 允许占据更多空间 */
      max-width: 50%; /* 设置最大宽度，限制地址栏长度 */
      min-width: 0; /* 允许压缩 */
      border: 1px solid var(--tooltip-link-border);
      border-radius: 16px;
      padding: 3px 5px 3px 3px;
      background-color: var(--tooltip-link-bg);
      transition: border-color 0.2s;
      overflow: hidden; /* 确保内容不会溢出 */
    }
    .NoTab-link-tooltip-link-group:hover {
       border-color: var(--tooltip-link-hover-border);
    }


    /* Updated Title Styles */
    .NoTab-link-tooltip-link-group .NoTab-link-tooltip-title { /* Increased specificity */
      font-size: 13px;
      font-weight: normal;
      color: var(--tooltip-header-text); /* Use variable */
      white-space: nowrap; /* 强制单行 */
      overflow: hidden;
      margin-left: 10px;
      text-overflow: ellipsis; /* 超出部分显示省略号 */
      text-decoration: none; /* Remove underline from link */
      cursor: pointer; /* Indicate it's clickable */
      flex: 1; /* Allow title to take space */
      min-width: 0; /* Prevent overflow */
      line-height: 1.4; /* Adjust line height */
      display: block; /* 确保ellipsis生效 */
      width: 100%; /* 确保ellipsis生效 */
    }
    .NoTab-link-tooltip-link-group .NoTab-link-tooltip-title:hover { /* Increased specificity */
       color: #007bff; /* Change color on hover */
    }
    .NoTab-link-tooltip-link-group .NoTab-link-tooltip-title:visited { /* Increased specificity */
      color: var(--tooltip-header-text); /* Prevent visited link color change */
    }

    /* Updated Actions Styles */
    .NoTab-link-tooltip-actions {
      display: flex;
      gap: 4px;
      align-items: center;
      flex-shrink: 0; /* 防止被压缩 */
    }

    /* General Action Button Styles */
    .NoTab-link-tooltip-action {
      background: none;
      border: none;
      /* font-size: 16px; /* Slightly smaller icons */ */ /* Removed font-size */
      color: #777; /* Default icon color */
      cursor: pointer;
      padding: 0; /* Remove default padding */
      line-height: 1;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px; /* Fixed width */
      height: 28px; /* Fixed height */
      border-radius: 6px; /* Rounded corners */
      position: relative;
      /* Add background properties for icons */
      background-color: #555; /* Darker default icon color */
      mask-repeat: no-repeat;
      mask-position: center center;
      mask-size: 16px 16px; /* Control icon size */
      -webkit-mask-repeat: no-repeat;
      -webkit-mask-position: center center;
      -webkit-mask-size: 16px 16px;
    }

    .NoTab-link-tooltip-action:hover {
      background-color: #111; /* Darker icon color on hover */
      color: #333; /* Darker icon color on hover */
    }

    .NoTab-link-tooltip-action.active {
      color: #1976d2; /* Use color for the icon */
      background-color: #007bff; /* Brighter blue for active pin */
    }

    .NoTab-link-tooltip-action.disabled {
      background-color: #aaa;
      cursor: not-allowed;
      opacity: 0.5;
    }

    /* Specific button styles with SVG masks */
    .NoTab-link-tooltip-pin {
      mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1024 1024' fill='none' stroke='currentColor' stroke-width='50'%3E%3Cpath d='M629.6 843l41.9-219 135.8-135.8 15.8 15.8c16.2 16.2 42.6 16.2 58.8 0 16.2-16.2 16.2-42.6 0-58.8L578.8 142c-16.2-16.2-42.6-16.2-58.8 0-16.2 16.2-16.2 42.6 0 58.8l15.8 15.8L400 352.5l-219 41.9c-3.1 0.6-6 2.1-8.3 4.4l-21.6 21.6c-12.5 12.5-12.5 32.8 0 45.3l174.2 174.2L142 823.1c-16.2 16.2-16.2 42.6 0 58.8 16.2 16.2 42.6 16.2 58.8 0l183.3-183.3 174.2 174.2c12.5 12.5 32.8 12.5 45.3 0l21.6-21.6c2.3-2.2 3.8-5 4.4-8.2z'%3E%3C/path%3E%3C/svg%3E");
      -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1024 1024' fill='none' stroke='currentColor' stroke-width='50'%3E%3Cpath d='M629.6 843l41.9-219 135.8-135.8 15.8 15.8c16.2 16.2 42.6 16.2 58.8 0 16.2-16.2 16.2-42.6 0-58.8L578.8 142c-16.2-16.2-42.6-16.2-58.8 0-16.2 16.2-16.2 42.6 0 58.8l15.8 15.8L400 352.5l-219 41.9c-3.1 0.6-6 2.1-8.3 4.4l-21.6 21.6c-12.5 12.5-12.5 32.8 0 45.3l174.2 174.2L142 823.1c-16.2 16.2-16.2 42.6 0 58.8 16.2 16.2 42.6 16.2 58.8 0l183.3-183.3 174.2 174.2c12.5 12.5 32.8 12.5 45.3 0l21.6-21.6c2.3-2.2 3.8-5 4.4-8.2z'%3E%3C/path%3E%3C/svg%3E");
    }
    .NoTab-link-tooltip-pin.active {
      mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1024 1024' fill='currentColor'%3E%3Cpath d='M629.6 843l41.9-219 135.8-135.8 15.8 15.8c16.2 16.2 42.6 16.2 58.8 0 16.2-16.2 16.2-42.6 0-58.8L578.8 142c-16.2-16.2-42.6-16.2-58.8 0-16.2 16.2-16.2 42.6 0 58.8l15.8 15.8L400 352.5l-219 41.9c-3.1 0.6-6 2.1-8.3 4.4l-21.6 21.6c-12.5 12.5-12.5 32.8 0 45.3l174.2 174.2L142 823.1c-16.2 16.2-16.2 42.6 0 58.8 16.2 16.2 42.6 16.2 58.8 0l183.3-183.3 174.2 174.2c12.5 12.5 32.8 12.5 45.3 0l21.6-21.6c2.3-2.2 3.8-5 4.4-8.2z'%3E%3C/path%3E%3C/svg%3E");
      -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1024 1024' fill='currentColor'%3E%3Cpath d='M629.6 843l41.9-219 135.8-135.8 15.8 15.8c16.2 16.2 42.6 16.2 58.8 0 16.2-16.2 16.2-42.6 0-58.8L578.8 142c-16.2-16.2-42.6-16.2-58.8 0-16.2 16.2-16.2 42.6 0 58.8l15.8 15.8L400 352.5l-219 41.9c-3.1 0.6-6 2.1-8.3 4.4l-21.6 21.6c-12.5 12.5-12.5 32.8 0 45.3l174.2 174.2L142 823.1c-16.2 16.2-16.2 42.6 0 58.8 16.2 16.2 42.6 16.2 58.8 0l183.3-183.3 174.2 174.2c12.5 12.5 32.8 12.5 45.3 0l21.6-21.6c2.3-2.2 3.8-5 4.4-8.2z'%3E%3C/path%3E%3C/svg%3E");
      /* background-color: #007bff; /* Brighter blue for active pin */ */ /* Controlled by variable now */
    }

    .NoTab-link-tooltip-refresh {
      mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='23 4 23 10 17 10'%3E%3C/polyline%3E%3Cpath d='M20.49 15a9 9 0 1 1-2.12-9.36L23 10'%3E%3C/path%3E%3C/svg%3E");
      -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='23 4 23 10 17 10'%3E%3C/polyline%3E%3Cpath d='M20.49 15a9 9 0 1 1-2.12-9.36L23 10'%3E%3C/path%3E%3C/svg%3E");
    }

    .NoTab-link-tooltip-open {
      mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6'%3E%3C/path%3E%3Cpolyline points='15 3 21 3 21 9'%3E%3C/polyline%3E%3Cline x1='10' y1='14' x2='21' y2='3'%3E%3C/line%3E%3C/svg%3E");
      -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6'%3E%3C/path%3E%3Cpolyline points='15 3 21 3 21 9'%3E%3C/polyline%3E%3Cline x1='10' y1='14' x2='21' y2='3'%3E%3C/line%3E%3C/svg%3E");
    }

    .NoTab-link-tooltip-close {
      /* font-size: 20px; /* Larger close icon */ */ /* Removed font-size */
      /* font-weight: 300; */ /* Removed font-weight */
      mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cline x1='18' y1='6' x2='6' y2='18'%3E%3C/line%3E%3Cline x1='6' y1='6' x2='18' y2='18'%3E%3C/line%3E%3C/svg%3E"); /* Slightly thicker stroke */
      -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cline x1='18' y1='6' x2='6' y2='18'%3E%3C/line%3E%3Cline x1='6' y1='6' x2='18' y2='18'%3E%3C/line%3E%3C/svg%3E");
    }

    /* Tooltip for Action Buttons */
    .NoTab-link-tooltip-action::after {
      content: attr(title);
      position: absolute;
      bottom: 110%; /* Position above the button */
      left: 50%;
      transform: translateX(-50%);
      padding: 4px 8px;
      background: rgba(0, 0, 0, 0.75);
      color: white;
      font-size: 11px; /* Smaller font size */
      border-radius: 4px;
      white-space: nowrap;
      opacity: 0;
      visibility: hidden;
      transition: opacity 0.2s 0.1s, visibility 0.2s 0.1s; /* Added delay */
      pointer-events: none;
    }

    .NoTab-link-tooltip-action:hover::after {
      opacity: 1;
      visibility: visible;
      /* bottom: -25px; Adjusted position if needed */
    }


    .NoTab-link-tooltip-body {
      flex: 1; /* Allow body to take remaining space */
      display: flex;
      flex-direction: column;
      height: 100%; /* Ensure body fills available height */
      width: 100%;
      background: #fff;
      min-height: 0; /* Prevent body from overflowing */
    }

    .NoTab-link-tooltip-summary {
      padding: 12px 16px;
      font-size: 13px;
      line-height: 1.6;
      color: #333;
      border-bottom: 1px solid #e0e0e0;
      max-height: 150px;
      overflow-y: auto;
      background-color: #fafafa;
      flex-shrink: 0; /* Prevent summary from shrinking */
    }

    .NoTab-link-tooltip-iframe-container {
      flex: 1;
      position: relative;
      padding: 0 1px 1px 1px;
      min-height: 0;
      border-radius: 0 0 12px 12px;
    }
    
    .NoTab-link-tooltip-iframe {
      width: 100%;
      height: 100%;
      border: none;
      background: #fff;
    }

    .NoTab-link-tooltip-video-container { /* 新增视频播放器容器样式 */
      flex: 1;
      position: relative;
      background: var(--tooltip-bg); /* 使用变量 */
      min-height: 0;
      border-radius: 0 0 12px 12px;
      overflow: hidden; /* 隐藏iframe边框带来的额外空间 */
      display: none; /* 默认隐藏 */
    }

    .NoTab-link-tooltip-video-iframe { /* 新增视频播放器iframe样式 */
      width: 100%;
      height: 100%;
      border: none;
      background: #000; /* 视频背景通常为黑色 */
    }

    .NoTab-link-tooltip-loading {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: var(--tooltip-loading-bg);
      border-radius: 0 0 12px 12px;
      backdrop-filter: blur(4px);
      z-index: 10; /* 增加z-index确保加载动画显示在最上层 */
      opacity: 1; /* 确保完全可见 */
      visibility: visible; /* 确保可见 */
    }

    .loading-spinner {
      width: 40px; /* 增加spinner大小使其更明显 */
      height: 40px;
      border: 3px solid var(--tooltip-border); /* 增加边框宽度 */
      border-top: 3px solid var(--tooltip-action-active-bg);
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin-bottom: 12px; /* 增加底部间距 */
    }

    .loading-spinner + p {
      font-size: 14px; /* 增加文字大小 */
      color: var(--tooltip-loading-text);
      margin: 0;
      font-weight: 500; /* 增加字体粗细 */
    }

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    
    .NoTab-link-tooltip-resize-handle {
      position: absolute;
      width: 16px;
      height: 16px;
      transition: background 0.2s;
      z-index: 2; /* Ensure handle is above iframe */
    }

    /* 右下角调整大小句柄 */
    .NoTab-resize-se {
      right: 0;
      bottom: 0;
      cursor: nwse-resize;
      background: transparent;
      /* 移除所有边框样式，保持透明 */
    }

    .NoTab-resize-se:hover {
      /* 悬停时也保持透明，只有光标变化 */
    }

    .NoTab-resize-se:active {
      /* 激活时也保持透明 */
    }

    /* 左下角调整大小句柄 */
    .NoTab-resize-sw {
      left: 0;
      bottom: 0;
      cursor: nesw-resize;
      background: transparent;
      /* 移除所有边框样式，保持透明 */
    }

    .NoTab-resize-sw:hover {
      /* 悬停时也保持透明，只有光标变化 */
    }

    .NoTab-resize-sw:active {
      /* 激活时也保持透明 */
    }

    .NoTab-link-tooltip-progress {
      position: relative;
      top: 0;
      left: 0;
      width: 100%;
      height: 3px;
      background: var(--tooltip-border);
      overflow: hidden;
      z-index: 1;
      opacity: 0.3;
      transition: opacity 0.2s ease;
    }

    .NoTab-link-tooltip-progress.notab-loading {
      opacity: 1;
    }

    .NoTab-link-tooltip-progress.notab-loading::after {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      width: 50%;
      height: 100%;
      background: #007acc;
      animation: progress 1.5s ease-in-out infinite;
    }

    @keyframes progress {
      0% {
        left: -50%;
      }
      100% {
        left: 100%;
      }
    }

    .NoTab-link-tooltip-body {
      display: flex;
      flex-direction: column;
      height: calc(100% - 42px); /* 减去header高度 */
    }

    .NoTab-link-tooltip-summary {
      padding: 12px 16px;
      font-size: 13px;
      line-height: 1.6;
      color: #333;
      border-bottom: 1px solid #e0e0e0;
      max-height: 120px; /* 减小摘要区域高度 */
      overflow-y: auto;
      background-color: #fafafa;
      flex-shrink: 0;
    }

    .NoTab-link-tooltip-iframe-container {
      flex: 1;
      position: relative;
      padding: 0 1px 1px 1px;
      min-height: 0;
      border-radius: 0 0 12px 12px;
    }

    /* 新增：剩余次数样式 */
    .NoTab-remaining-previews {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 12px;
      color: var(--tooltip-remaining-previews-text); /* Use variable */
      background-color: var(--tooltip-remaining-previews-bg); /* Use variable */
      padding: 3px 8px;
      border-radius: 12px;
      cursor: pointer;
      transition: background-color 0.2s, color 0.2s;
      flex-shrink: 0; /* 防止被压缩 */
      white-space: nowrap; /* 防止换行 */
      margin-right: 6px; /* 添加右侧间距 */
    }
    .NoTab-remaining-previews:hover {
      background-color: var(--tooltip-remaining-previews-hover-bg); /* Use variable */
      color: var(--tooltip-remaining-previews-hover-text); /* Use variable */
    }
    .NoTab-preview-icon {
      font-size: 14px; /* 图标大小 */
      line-height: 1;
    }

    .NoTab-long-press-loader {
      position: fixed;
      width: 36px; /* slightly larger than spinner */
      height: 36px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000000; /* Ensure it's on top */
      pointer-events: none !important; /* Don't interfere with mouse events */
      user-select: none !important; /* Cannot be selected */
      -webkit-user-select: none !important;
      -moz-user-select: none !important;
      -ms-user-select: none !important;
      box-shadow: 0 0 8px rgba(0, 0, 0, 0.2);
      transform: translate(-50%, -50%); /* Center the loader on the cursor */
    }
    /* Reuse existing spinner style */
    .NoTab-long-press-loader .loading-spinner {
       margin: 0; /* Reset margin if needed */
       width: 24px; /* Smaller spinner */
       height: 24px;
       border-width: 2px;
       pointer-events: none !important; /* Ensure spinner also doesn't interfere */
    }

    /* Define color variables for themes */
    .NoTab-link-tooltip.theme-light {
      --tooltip-bg: #ffffff;
      --tooltip-text: #333333;
      --tooltip-header-bg: #f5f5f5;
      --tooltip-header-text: #333333;
      --tooltip-border: #e0e0e0;
      --tooltip-link-bg: #ffffff;
      --tooltip-link-border: #cccccc;
      --tooltip-link-hover-border: #aaaaaa;
      --tooltip-action-bg: #555555;
      --tooltip-action-hover-bg: #111111;
      --tooltip-action-active-bg: #007bff;
      --tooltip-action-disabled-bg: #aaaaaa;
      --tooltip-summary-bg: #fafafa;
      --tooltip-summary-text: #333333;
      --tooltip-loading-bg: rgba(255, 255, 255, 0.95);
      --tooltip-loading-text: #666666;
      --tooltip-resize-handle-border: rgba(0, 0, 0, 0.1);
      --tooltip-resize-handle-hover-border: rgba(0, 0, 0, 0.2);
      --tooltip-remaining-previews-bg: #f0f0f0;
      --tooltip-remaining-previews-text: #333333;
      --tooltip-remaining-previews-hover-bg: #e0e0e0;
      --tooltip-remaining-previews-hover-text: #111111;
    }
    
    .NoTab-link-tooltip.theme-dark {
      --tooltip-bg:rgb(60, 60, 60);
      --tooltip-text: #e0e0e0;
      --tooltip-header-bg:rgb(48, 48, 48);
      --tooltip-header-text: #e0e0e0;
      --tooltip-border: #444444;
      --tooltip-link-bg: #3c3c3c;
      --tooltip-link-border: #555555;
      --tooltip-link-hover-border: #777777;
      --tooltip-action-bg: #cccccc; /* Light icons on dark bg */
      --tooltip-action-hover-bg: #eeeeee;
      --tooltip-action-active-bg: #03699dff; /* Brighter blue */
      --tooltip-action-disabled-bg: #666666;
      --tooltip-summary-bg: #252525;
      --tooltip-summary-text: #cccccc;
      --tooltip-loading-bg: rgba(45, 45, 45, 0.95);
      --tooltip-loading-text: #cccccc;
      --tooltip-resize-handle-border: rgba(255, 255, 255, 0.1);
      --tooltip-resize-handle-hover-border: rgba(255, 255, 255, 0.2);
      --tooltip-remaining-previews-bg: #444;
      --tooltip-remaining-previews-text: #ccc;
      --tooltip-remaining-previews-hover-bg: #555;
      --tooltip-remaining-previews-hover-text: #eee;
    }

    .NoTab-link-tooltip.theme-gray {
      --tooltip-bg: #f0f0f0;
      --tooltip-text: #333333;
      --tooltip-header-bg: #e0e0e0;
      --tooltip-header-text: #333333;
      --tooltip-border: #cccccc;
      --tooltip-link-bg: #ffffff;
      --tooltip-link-border: #bbbbbb;
      --tooltip-link-hover-border: #999999;
      --tooltip-action-bg: #666666;
      --tooltip-action-hover-bg: #222222;
      --tooltip-action-active-bg: #007bff;
      --tooltip-action-disabled-bg: #aaaaaa;
      --tooltip-summary-bg: #e5e5e5;
      --tooltip-summary-text: #333333;
      --tooltip-loading-bg: rgba(240, 240, 240, 0.95);
      --tooltip-loading-text: #555555;
      --tooltip-resize-handle-border: rgba(0, 0, 0, 0.1);
      --tooltip-resize-handle-hover-border: rgba(0, 0, 0, 0.2);
      --tooltip-remaining-previews-bg: #ccc;
      --tooltip-remaining-previews-text: #555;
      --tooltip-remaining-previews-hover-bg: #bbb;
      --tooltip-remaining-previews-hover-text: #333;
    }
    
    /* 蓝色主题 */
    .NoTab-link-tooltip.theme-blue {
      --tooltip-bg: #ebf8ff;
      --tooltip-text: #2b6cb0;
      --tooltip-header-bg: #bee3f8;
      --tooltip-header-text: #2c5282;
      --tooltip-border: #90cdf4;
      --tooltip-link-bg: #ffffff;
      --tooltip-link-border: #90cdf4;
      --tooltip-link-hover-border: #63b3ed;
      --tooltip-action-bg: #4299e1;
      --tooltip-action-hover-bg: #2b6cb0;
      --tooltip-action-active-bg: #2b6cb0;
      --tooltip-action-disabled-bg: #a0aec0;
      --tooltip-summary-bg: #e2f0fd;
      --tooltip-summary-text: #2b6cb0;
      --tooltip-loading-bg: rgba(235, 248, 255, 0.95);
      --tooltip-loading-text: #2b6cb0;
      --tooltip-resize-handle-border: rgba(43, 108, 176, 0.2);
      --tooltip-resize-handle-hover-border: rgba(43, 108, 176, 0.4);
      --tooltip-remaining-previews-bg: #bee3f8;
      --tooltip-remaining-previews-text: #2b6cb0;
      --tooltip-remaining-previews-hover-bg: #90cdf4;
      --tooltip-remaining-previews-hover-text: #2c5282;
    }
    
    /* 绿色主题 */
    .NoTab-link-tooltip.theme-green {
      --tooltip-bg: #f0fff4;
      --tooltip-text: #276749;
      --tooltip-header-bg: #c6f6d5;
      --tooltip-header-text: #22543d;
      --tooltip-border: #9ae6b4;
      --tooltip-link-bg: #ffffff;
      --tooltip-link-border: #9ae6b4;
      --tooltip-link-hover-border: #68d391;
      --tooltip-action-bg: #48bb78;
      --tooltip-action-hover-bg: #276749;
      --tooltip-action-active-bg: #276749;
      --tooltip-action-disabled-bg: #a0aec0;
      --tooltip-summary-bg: #e2f9eb;
      --tooltip-summary-text: #276749;
      --tooltip-loading-bg: rgba(240, 255, 244, 0.95);
      --tooltip-loading-text: #276749;
      --tooltip-resize-handle-border: rgba(39, 103, 73, 0.2);
      --tooltip-resize-handle-hover-border: rgba(39, 103, 73, 0.4);
      --tooltip-remaining-previews-bg: #c6f6d5;
      --tooltip-remaining-previews-text: #276749;
      --tooltip-remaining-previews-hover-bg: #9ae6b4;
      --tooltip-remaining-previews-hover-text: #22543d;
    }
    
    /* 紫色主题 */
    .NoTab-link-tooltip.theme-purple {
      --tooltip-bg: #faf5ff;
      --tooltip-text: #553c9a;
      --tooltip-header-bg: #e9d8fd;
      --tooltip-header-text: #44337a;
      --tooltip-border: #d6bcfa;
      --tooltip-link-bg: #ffffff;
      --tooltip-link-border: #d6bcfa;
      --tooltip-link-hover-border: #b794f4;
      --tooltip-action-bg: #805ad5;
      --tooltip-action-hover-bg: #553c9a;
      --tooltip-action-active-bg: #553c9a;
      --tooltip-action-disabled-bg: #a0aec0;
      --tooltip-summary-bg: #f3e8ff;
      --tooltip-summary-text: #553c9a;
      --tooltip-loading-bg: rgba(250, 245, 255, 0.95);
      --tooltip-loading-text: #553c9a;
      --tooltip-resize-handle-border: rgba(85, 60, 154, 0.2);
      --tooltip-resize-handle-hover-border: rgba(85, 60, 154, 0.4);
      --tooltip-remaining-previews-bg: #e9d8fd;
      --tooltip-remaining-previews-text: #553c9a;
      --tooltip-remaining-previews-hover-bg: #d6bcfa;
      --tooltip-remaining-previews-hover-text: #44337a;
    }
    
    /* 粉色主题 */
    .NoTab-link-tooltip.theme-pink {
      --tooltip-bg: #fff5f7;
      --tooltip-text: #b83280;
      --tooltip-header-bg: #fed7e2;
      --tooltip-header-text: #97266d;
      --tooltip-border: #fbb6ce;
      --tooltip-link-bg: #ffffff;
      --tooltip-link-border: #fbb6ce;
      --tooltip-link-hover-border: #f687b3;
      --tooltip-action-bg: #ed64a6;
      --tooltip-action-hover-bg: #b83280;
      --tooltip-action-active-bg: #b83280;
      --tooltip-action-disabled-bg: #a0aec0;
      --tooltip-summary-bg: #fff0f5;
      --tooltip-summary-text: #b83280;
      --tooltip-loading-bg: rgba(255, 245, 247, 0.95);
      --tooltip-loading-text: #b83280;
      --tooltip-resize-handle-border: rgba(184, 50, 128, 0.2);
      --tooltip-resize-handle-hover-border: rgba(184, 50, 128, 0.4);
      --tooltip-remaining-previews-bg: #fed7e2;
      --tooltip-remaining-previews-text: #b83280;
      --tooltip-remaining-previews-hover-bg: #fbb6ce;
      --tooltip-remaining-previews-hover-text: #97266d;
    }

    /* 自定义主题 - 基础定义，具体颜色由JS动态设置 */
    .NoTab-link-tooltip.theme-custom {
      /* 变量将由JS动态设置 */
      --tooltip-bg: #ffffff;
      --tooltip-text: #333333;
      --tooltip-header-bg: #f5f5f5;
      --tooltip-header-text: #333333;
      --tooltip-border: #e0e0e0;
      --tooltip-link-bg: #ffffff;
      --tooltip-link-border: #cccccc;
      --tooltip-link-hover-border: #aaaaaa;
      --tooltip-action-bg: #555555;
      --tooltip-action-hover-bg: #111111;
      --tooltip-action-active-bg: #0556adff;
      --tooltip-action-disabled-bg: #aaaaaa;
      --tooltip-summary-bg: #fafafa;
      --tooltip-summary-text: #333333;
      --tooltip-loading-bg: rgba(255, 255, 255, 0.95);
      --tooltip-loading-text: #666666;
      --tooltip-resize-handle-border: rgba(0, 0, 0, 0.1);
      --tooltip-resize-handle-hover-border: rgba(0, 0, 0, 0.2);
      --tooltip-remaining-previews-bg: #f0f0f0;
      --tooltip-remaining-previews-text: #333333;
      --tooltip-remaining-previews-hover-bg: #e0e0e0;
      --tooltip-remaining-previews-hover-text: #111111;
    }

    /* Update existing styles to use variables */
    .NoTab-link-tooltip {
      /* ... */
      background: var(--tooltip-bg);
      /* ... */
    }

    .NoTab-link-tooltip-visible {
      opacity: 1;
      transform: translateY(0);
    }

    .NoTab-link-tooltip-content {
      display: flex;
      flex-direction: column;
      overflow: hidden;
      height: 100%;
      border-radius: 12px; /* Apply border-radius here */
      background: var(--tooltip-bg); /* Use variable */
    }

    /* Updated Header Styles */
    .NoTab-link-tooltip-header {
      /* ... */
      background: var(--tooltip-header-bg);
      border-bottom: 1px solid var(--tooltip-border);
      /* ... */
    }

    /* New Link Group Styles */
    .NoTab-link-tooltip-link-group {
      /* ... */
      border: 1px solid var(--tooltip-link-border);
      background-color: var(--tooltip-link-bg);
      /* ... */
    }
    .NoTab-link-tooltip-link-group:hover {
       border-color: var(--tooltip-link-hover-border);
    }


    /* Updated Title Styles */
    .NoTab-link-tooltip-link-group .NoTab-link-tooltip-title { /* Increased specificity */
      font-size: 13px;
      font-weight: normal;
      color: var(--tooltip-header-text); /* Use variable */
      white-space: nowrap; /* 强制单行 */
      overflow: hidden;
      margin-left: 10px;
      text-overflow: ellipsis; /* 超出部分显示省略号 */
      text-decoration: none; /* Remove underline from link */
      cursor: pointer; /* Indicate it's clickable */
      flex: 1; /* Allow title to take space */
      min-width: 0; /* Prevent overflow */
      line-height: 1.4; /* Adjust line height */
      display: block; /* 确保ellipsis生效 */
      width: 100%; /* 确保ellipsis生效 */
    }
    .NoTab-link-tooltip-link-group .NoTab-link-tooltip-title:hover { /* Increased specificity */
       color: #007bff; /* Change color on hover */
    }
    .NoTab-link-tooltip-link-group .NoTab-link-tooltip-title:visited { /* Increased specificity */
      color: var(--tooltip-header-text); /* Prevent visited link color change */
    }

    /* Updated Actions Styles */
    .NoTab-link-tooltip-actions {
      /* ... */
    }

    /* General Action Button Styles */
    .NoTab-link-tooltip-action {
      /* ... */
      background-color: var(--tooltip-action-bg); /* Use variable */
      /* ... */
    }

    .NoTab-link-tooltip-action:hover {
      background-color: var(--tooltip-action-hover-bg); /* Use variable */
      /* color: #333; /* Darker icon color on hover */ */ /* Removed color */
    }

    .NoTab-link-tooltip-action.active {
      /* color: #1976d2; /* Use color for the icon */ */ /* Removed color */
      background-color: var(--tooltip-action-active-bg); /* Use variable */
    }

    .NoTab-link-tooltip-action.disabled {
      background-color: var(--tooltip-action-disabled-bg); /* Use variable */
      cursor: not-allowed;
      opacity: 0.5;
    }

    /* Specific button styles with SVG masks */
    /* Keep mask definitions as they are color-independent */
    .NoTab-link-tooltip-pin {
      mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1024 1024' fill='none' stroke='currentColor' stroke-width='50'%3E%3Cpath d='M629.6 843l41.9-219 135.8-135.8 15.8 15.8c16.2 16.2 42.6 16.2 58.8 0 16.2-16.2 16.2-42.6 0-58.8L578.8 142c-16.2-16.2-42.6-16.2-58.8 0-16.2 16.2-16.2 42.6 0 58.8l15.8 15.8L400 352.5l-219 41.9c-3.1 0.6-6 2.1-8.3 4.4l-21.6 21.6c-12.5 12.5-12.5 32.8 0 45.3l174.2 174.2L142 823.1c-16.2 16.2-16.2 42.6 0 58.8 16.2 16.2 42.6 16.2 58.8 0l183.3-183.3 174.2 174.2c12.5 12.5 32.8 12.5 45.3 0l21.6-21.6c2.3-2.2 3.8-5 4.4-8.2z'%3E%3C/path%3E%3C/svg%3E");
      -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1024 1024' fill='none' stroke='currentColor' stroke-width='50'%3E%3Cpath d='M629.6 843l41.9-219 135.8-135.8 15.8 15.8c16.2 16.2 42.6 16.2 58.8 0 16.2-16.2 16.2-42.6 0-58.8L578.8 142c-16.2-16.2-42.6-16.2-58.8 0-16.2 16.2-16.2 42.6 0 58.8l15.8 15.8L400 352.5l-219 41.9c-3.1 0.6-6 2.1-8.3 4.4l-21.6 21.6c-12.5 12.5-12.5 32.8 0 45.3l174.2 174.2L142 823.1c-16.2 16.2-16.2 42.6 0 58.8 16.2 16.2 42.6 16.2 58.8 0l183.3-183.3 174.2 174.2c12.5 12.5 32.8 12.5 45.3 0l21.6-21.6c2.3-2.2 3.8-5 4.4-8.2z'%3E%3C/path%3E%3C/svg%3E");
    }
    .NoTab-link-tooltip-pin.active {
      mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1024 1024' fill='currentColor'%3E%3Cpath d='M629.6 843l41.9-219 135.8-135.8 15.8 15.8c16.2 16.2 42.6 16.2 58.8 0 16.2-16.2 16.2-42.6 0-58.8L578.8 142c-16.2-16.2-42.6-16.2-58.8 0-16.2 16.2-16.2 42.6 0 58.8l15.8 15.8L400 352.5l-219 41.9c-3.1 0.6-6 2.1-8.3 4.4l-21.6 21.6c-12.5 12.5-12.5 32.8 0 45.3l174.2 174.2L142 823.1c-16.2 16.2-16.2 42.6 0 58.8 16.2 16.2 42.6 16.2 58.8 0l183.3-183.3 174.2 174.2c12.5 12.5 32.8 12.5 45.3 0l21.6-21.6c2.3-2.2 3.8-5 4.4-8.2z'%3E%3C/path%3E%3C/svg%3E");
      -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1024 1024' fill='currentColor'%3E%3Cpath d='M629.6 843l41.9-219 135.8-135.8 15.8 15.8c16.2 16.2 42.6 16.2 58.8 0 16.2-16.2 16.2-42.6 0-58.8L578.8 142c-16.2-16.2-42.6-16.2-58.8 0-16.2 16.2-16.2 42.6 0 58.8l15.8 15.8L400 352.5l-219 41.9c-3.1 0.6-6 2.1-8.3 4.4l-21.6 21.6c-12.5 12.5-12.5 32.8 0 45.3l174.2 174.2L142 823.1c-16.2 16.2-16.2 42.6 0 58.8 16.2 16.2 42.6 16.2 58.8 0l183.3-183.3 174.2 174.2c12.5 12.5 32.8 12.5 45.3 0l21.6-21.6c2.3-2.2 3.8-5 4.4-8.2z'%3E%3C/path%3E%3C/svg%3E");
      /* background-color: #007bff; /* Brighter blue for active pin */ */ /* Controlled by variable now */
    }

    .NoTab-link-tooltip-refresh {
      mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='23 4 23 10 17 10'%3E%3C/polyline%3E%3Cpath d='M20.49 15a9 9 0 1 1-2.12-9.36L23 10'%3E%3C/path%3E%3C/svg%3E");
      -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='23 4 23 10 17 10'%3E%3C/polyline%3E%3Cpath d='M20.49 15a9 9 0 1 1-2.12-9.36L23 10'%3E%3C/path%3E%3C/svg%3E");
    }

    .NoTab-link-tooltip-open {
      mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6'%3E%3C/path%3E%3Cpolyline points='15 3 21 3 21 9'%3E%3C/polyline%3E%3Cline x1='10' y1='14' x2='21' y2='3'%3E%3C/line%3E%3C/svg%3E");
      -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6'%3E%3C/path%3E%3Cpolyline points='15 3 21 3 21 9'%3E%3C/polyline%3E%3Cline x1='10' y1='14' x2='21' y2='3'%3E%3C/line%3E%3C/svg%3E");
    }

    .NoTab-link-tooltip-close {
      /* font-size: 20px; /* Larger close icon */ */ /* Removed font-size */
      /* font-weight: 300; */ /* Removed font-weight */
      mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cline x1='18' y1='6' x2='6' y2='18'%3E%3C/line%3E%3Cline x1='6' y1='6' x2='18' y2='18'%3E%3C/line%3E%3C/svg%3E"); /* Slightly thicker stroke */
      -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cline x1='18' y1='6' x2='6' y2='18'%3E%3C/line%3E%3Cline x1='6' y1='6' x2='18' y2='18'%3E%3C/line%3E%3C/svg%3E");
    }

    /* Tooltip for Action Buttons */
    .NoTab-link-tooltip-action::after {
      content: attr(title);
      position: absolute;
      bottom: 110%; /* Position above the button */
      left: 50%;
      transform: translateX(-50%);
      padding: 4px 8px;
      background: rgba(0, 0, 0, 0.75);
      color: white;
      font-size: 11px; /* Smaller font size */
      border-radius: 4px;
      white-space: nowrap;
      opacity: 0;
      visibility: hidden;
      transition: opacity 0.2s 0.1s, visibility 0.2s 0.1s; /* Added delay */
      pointer-events: none;
    }

    .NoTab-link-tooltip-action:hover::after {
      opacity: 1;
      visibility: visible;
      /* bottom: -25px; Adjusted position if needed */
    }


    .NoTab-link-tooltip-body {
      flex: 1; /* Allow body to take remaining space */
      display: flex;
      flex-direction: column;
      height: 100%; /* Ensure body fills available height */
      width: 100%;
      background: var(--tooltip-bg); /* Use variable */
      min-height: 0; /* Prevent body from overflowing */
    }

    .NoTab-link-tooltip-summary {
      padding: 12px 16px;
      font-size: 13px;
      line-height: 1.6;
      color: var(--tooltip-summary-text); /* Use variable */
      border-bottom: 1px solid var(--tooltip-border); /* Use variable */
      max-height: 150px;
      overflow-y: auto;
      background-color: var(--tooltip-summary-bg); /* Use variable */
      flex-shrink: 0; /* Prevent summary from shrinking */
    }

    .NoTab-link-tooltip-iframe-container {
      flex: 1;
      position: relative;
      padding: 0 1px 1px 1px;
      min-height: 0;
      border-radius: 0 0 12px 12px;
    }
    
    .NoTab-link-tooltip-iframe {
      width: 100%;
      height: 100%;
      border: none;
      background: var(--tooltip-bg); /* Use variable */
    }

    .NoTab-link-tooltip-video-container { /* 新增视频播放器容器样式 */
      flex: 1;
      position: relative;
      background: var(--tooltip-bg); /* 使用变量 */
      min-height: 0;
      border-radius: 0 0 12px 12px;
      overflow: hidden; /* 隐藏iframe边框带来的额外空间 */
      display: none; /* 默认隐藏 */
    }

    .NoTab-link-tooltip-video-iframe { /* 新增视频播放器iframe样式 */
      width: 100%;
      height: 100%;
      border: none;
      background: #000; /* 视频背景通常为黑色 */
    }

    .loading-spinner {
      width: 32px;
      height: 32px;
      border: 2px solid #f3f3f3;
      border-top: 2px solid #3498db;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin-bottom: 8px;
    }

    .loading-spinner + p {
      font-size: 13px;
      color: var(--tooltip-loading-text); /* Use variable */
      margin: 0;
    }

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    
    .NoTab-link-tooltip-resize-handle {
      position: absolute;
      right: 0;
      bottom: 0;
      width: 16px;
      height: 16px;
      cursor: nwse-resize;
      border-radius: 0 0 12px 0;
      transition: background 0.2s;
      z-index: 2; /* Ensure handle is above iframe */
      border-bottom: 16px solid var(--tooltip-resize-handle-border);
      border-left: 16px solid transparent;
    }

    .NoTab-link-tooltip-resize-handle:hover {
      border-bottom-color: var(--tooltip-resize-handle-hover-border);
    }

    .NoTab-link-tooltip-progress {
      position: relative;
      top: 0;
      left: 0;
      width: 100%;
      height: 3px;
      background: var(--tooltip-border);
      overflow: hidden;
      z-index: 1;
      opacity: 0.3;
      transition: opacity 0.2s ease;
    }

    .NoTab-link-tooltip-progress.notab-loading {
      opacity: 1;
    }

    .NoTab-link-tooltip-progress.notab-loading::after {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      width: 50%;
      height: 100%;
      background: linear-gradient(90deg, transparent, var(--tooltip-action-active-bg), transparent);
      animation: progress 2s ease-in-out infinite;
    }

    @keyframes progress {
      0% {
        left: -50%;
      }
      100% {
        left: 100%;
      }
    }

    .NoTab-link-tooltip-body {
      display: flex;
      flex-direction: column;
      height: calc(100% - 42px); /* 减去header高度 */
    }

    .NoTab-link-tooltip-summary {
      padding: 12px 16px;
      font-size: 13px;
      line-height: 1.6;
      color: #333;
      border-bottom: 1px solid #e0e0e0;
      max-height: 120px; /* 减小摘要区域高度 */
      overflow-y: auto;
      background-color: #fafafa;
      flex-shrink: 0;
    }

    .NoTab-link-tooltip-iframe-container {
      flex: 1;
      position: relative;
      padding: 0 1px 1px 1px;
      min-height: 0;
      border-radius: 0 0 12px 12px;
    }

    /* 新增：剩余次数样式 */
    .NoTab-remaining-previews {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 12px;
      color: var(--tooltip-remaining-previews-text); /* Use variable */
      background-color: var(--tooltip-remaining-previews-bg); /* Use variable */
      padding: 3px 8px;
      border-radius: 12px;
      cursor: pointer;
      transition: background-color 0.2s, color 0.2s;
      flex-shrink: 0; /* 防止被压缩 */
      white-space: nowrap; /* 防止换行 */
      margin-right: 6px; /* 添加右侧间距 */
    }
    .NoTab-remaining-previews:hover {
      background-color: var(--tooltip-remaining-previews-hover-bg); /* Use variable */
      color: var(--tooltip-remaining-previews-hover-text); /* Use variable */
    }
    .NoTab-preview-icon {
      font-size: 14px; /* 图标大小 */
      line-height: 1;
    }

    .NoTab-long-press-loader {
      position: fixed;
      width: 36px; /* slightly larger than spinner */
      height: 36px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000000; /* Ensure it's on top */
      pointer-events: none !important; /* Don't interfere with mouse events */
      user-select: none !important; /* Cannot be selected */
      -webkit-user-select: none !important;
      -moz-user-select: none !important;
      -ms-user-select: none !important;
      box-shadow: 0 0 8px rgba(0, 0, 0, 0.2);
      transform: translate(-50%, -50%); /* Center the loader on the cursor */
    }
    /* Reuse existing spinner style */
    .NoTab-long-press-loader .loading-spinner {
       margin: 0; /* Reset margin if needed */
       width: 24px; /* Smaller spinner */
       height: 24px;
       border-width: 2px;
       pointer-events: none !important; /* Ensure spinner also doesn't interfere */
    }

    .NoTab-link-tooltip-video-mode { /* 新增视频模式按钮样式 */
      mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M10.66 5H5.34A3.34 3.34 0 0 0 2 8.34v7.32A3.34 3.34 0 0 0 5.34 19h13.32A3.34 3.34 0 0 0 22 15.66V8.34A3.34 3.34 0 0 0 18.66 5m-8 0h2.68'%3E%3C/path%3E%3Cpath d='M10 15l5-3-5-3v6z'%3E%3C/path%3E%3C/svg%3E");
      -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M10.66 5H5.34A3.34 3.34 0 0 0 2 8.34v7.32A3.34 3.34 0 0 0 5.34 19h13.32A3.34 3.34 0 0 0 22 15.66V8.34A3.34 3.34 0 0 0 18.66 5m-8 0h2.68'%3E%3C/path%3E%3Cpath d='M10 15l5-3-5-3v6z'%3E%3C/path%3E%3C/svg%3E");
    }
  `;
  // 将样式添加到 Shadow DOM 而不是 document.head
  addStylesToShadowDOM(linkTooltipStyle);

  // 加载链接预览设置
  loadLinkPreviewSettings();

  // 加载选中文本搜索设置
  loadTextSearchSettings();

  // 在init函数中添加加载上次预览状态
  await loadLastPreviewState();

  // 添加样式到 Shadow DOM
  const style = document.createElement('style');
  style.id = 'NoTab-style';
  style.textContent = getStyles();
  addStylesToShadowDOM(style);
  
  // 添加自定义主题样式元素到 Shadow DOM
  const customThemeStyle = document.createElement('style');
  customThemeStyle.id = 'NoTab-custom-theme-style';
  addStylesToShadowDOM(customThemeStyle);

  // console.log('[NoTab] 初始化完成');
}

// Load link preview settings from storage
function loadLinkPreviewSettings() {
  chrome.storage.local.get(['linkPreviewSettings', 'user_info'], function(result) {
    if (result.linkPreviewSettings) {
      linkPreviewSettings = result.linkPreviewSettings;
      
      // 确保延时值在有效范围内（200ms-10s）
      if (linkPreviewSettings.longPressDelay < 200) linkPreviewSettings.longPressDelay = 200;
      if (linkPreviewSettings.longPressDelay > 10000) linkPreviewSettings.longPressDelay = 10000;
      if (linkPreviewSettings.altHoverDelay < 200) linkPreviewSettings.altHoverDelay = 200;
      if (linkPreviewSettings.altHoverDelay > 10000) linkPreviewSettings.altHoverDelay = 10000;
      if (linkPreviewSettings.hoverDelay < 200) linkPreviewSettings.hoverDelay = 200;
      if (linkPreviewSettings.hoverDelay > 10000) linkPreviewSettings.hoverDelay = 10000;
      
      if (linkPreviewSettings.previewTheme === 'custom' && linkPreviewSettings.customThemeColors) {
        // 应用自定义主题颜色
        updateCustomThemeStyle(linkPreviewSettings.customThemeColors);
      }
    }
  });
}

// 加载选中文本搜索设置
function loadTextSearchSettings() {
  chrome.storage.local.get(['textSearchSettings'], function (result) {
    if (result.textSearchSettings) {
      textSearchSettings = {
        ...textSearchSettings,
        ...result.textSearchSettings
      };
    }
  });
}

// Set up event listeners
function setupEventListeners() {
  // Listen for messages from popup
  chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    // console.log('[NoTab] 收到消息:', request);

    if (request.action === 'updateLinkPreviewSettings') {
      // 处理链接预览设置更新
      if (request.settings) {
        // console.log('[NoTab] 接收到链接预览设置更新:', request.settings);
        linkPreviewSettings = request.settings;
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, message: '未提供设置数据' });
      }
    } else if (request.action === 'updateTextSearchSettings') {
      // 处理选中文本搜索设置更新
      if (request.settings) {
        // console.log('[NoTab] 接收到选中文本搜索设置更新:', request.settings);
        textSearchSettings = request.settings;
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, message: '未提供设置数据' });
      }
    } else if (request.action === 'searchSelectedText') {
      // 处理右键菜单搜索
      const selectedText = request.selectedText || window.getSelection().toString().trim();
      if (selectedText && selectedText.length > 0) {
        searchSelectedText(selectedText);
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, message: '没有选中文本' });
      }
      return true;
    } else if (request.action === 'updateLinkPreviewSettings') {
      // 更新设置
      linkPreviewSettings = request.settings;
      
      // 如果有自定义主题颜色，更新自定义主题样式
      if (linkPreviewSettings.previewTheme === 'custom' && linkPreviewSettings.customThemeColors) {
        updateCustomThemeStyle(linkPreviewSettings.customThemeColors);
      }
      
      sendResponse({ success: true });

    } else if (request.action === 'updateCustomTheme') {
      // 更新自定义主题颜色
      updateCustomThemeStyle(request.colors);
      sendResponse({ success: true });
    }

    return true; // 保持消息通道开放以支持异步响应
  });

  // Set up link hover listeners
  setupLinkHoverListeners();

  // 设置文本选择监听器
  setupTextSelectionListeners();

  // 添加 Esc 键关闭预览窗口的监听器
  document.removeEventListener('keydown', handleDocumentKeyDownForClose);
  document.addEventListener('keydown', handleDocumentKeyDownForClose);

  // 添加监听来自 iframe 的消息 (仅在顶层窗口添加)
  if (!isInIframe) {
    window.addEventListener('message', handleIframeMessages);
  }
}

// Set up link hover listeners
function setupLinkHoverListeners() {
  // 使用事件委托，在文档级别监听鼠标事件
  document.removeEventListener('mouseover', handleDocumentMouseOver);
  document.removeEventListener('mouseout', handleDocumentMouseOut);
  document.removeEventListener('mousedown', handleDocumentMouseDown);
  document.removeEventListener('mouseup', handleDocumentMouseUp);
  document.removeEventListener('mousemove', handleDocumentMouseMove);
  document.removeEventListener('click', handleDocumentClick);
  document.removeEventListener('click', handleDocumentClick, true); // 移除捕获阶段的监听
  document.removeEventListener('dragend', handleDocumentDragEnd);
  // 不再需要移除handleTextDragEnd事件监听器

  document.addEventListener('mouseover', handleDocumentMouseOver);
  document.addEventListener('mouseout', handleDocumentMouseOut);
  document.addEventListener('mousedown', handleDocumentMouseDown);
  document.addEventListener('mouseup', handleDocumentMouseUp);
  document.addEventListener('mousemove', handleDocumentMouseMove);
  // 使用捕获阶段(true)监听click事件，确保在浏览器默认行为之前执行
  document.addEventListener('click', handleDocumentClick, true);
  document.addEventListener('dragend', handleDocumentDragEnd);

  // 链接和文本拖拽事件处理已经合并到handleDocumentDragEnd中

  // Alt键监听保持不变
  document.removeEventListener('keydown', trackAltKeyDown);
  document.removeEventListener('keyup', trackAltKeyUp);
  document.addEventListener('keydown', trackAltKeyDown);
  document.addEventListener('keyup', trackAltKeyUp);
  document.addEventListener('visibilitychange', () => {
    isAltPressed = false;
    clearLinkPreviewTimeouts();
    if (document.hidden) {
      // console.log('用户切换到其他标签页或应用');
    } else {
      // console.log('用户回到本页面');
    }
  });
}

// 文档级事件处理函数
function handleDocumentMouseOver(event) {
  const link = event.target.closest('a');
  if (link && link.href) {
    if (linkPreviewSettings.triggerMode === 'hover') {
      // 清除之前的防抖超时
      if (hoverDebounceTimeout) {
        clearTimeout(hoverDebounceTimeout);
        hoverDebounceTimeout = null;
        // console.log('[NoTab] 清除了之前的防抖超时');
      }
      
      // 如果有不同的链接正在处理，先清除
      if (currentHoveredLink && currentHoveredLink !== link.href) {
        clearLinkPreviewTimeouts();
      }
      
      // 记录当前悬停的链接
      currentHoveredLink = link.href;
      
      // 创建loading指示器
      removeLongPressLoader();
      longPressLoadingIndicator = document.createElement('div');
      longPressLoadingIndicator.className = 'NoTab-long-press-loader';
      const spinner = document.createElement('div');
      spinner.className = 'loading-spinner';
      longPressLoadingIndicator.appendChild(spinner);
      
      // 将loading指示器放在鼠标中心位置
      longPressLoadingIndicator.style.left = `${event.clientX}px`;
      longPressLoadingIndicator.style.top = `${event.clientY}px`;
      
      appendToShadowDOM(longPressLoadingIndicator);

      // 设置延迟显示预览
      longPressTimeout = setTimeout(() => {
        showLinkSummary(event, link);
      }, linkPreviewSettings.hoverDelay || 500); // 使用配置的延迟时间，默认500ms
    } else if (linkPreviewSettings.triggerMode === 'alt_hover') {
      // Alt+悬停模式
      handleLinkHover(event);
    }
    // 对于长按模式和Alt+点击模式，不在mouseover时处理
  }
}

function handleDocumentMouseOut(event) {
  const link = event.target.closest('a');
  if (link && link.href) {
    if (linkPreviewSettings.triggerMode === 'hover') {
      // 只处理当前悬停的链接
      if (currentHoveredLink !== link.href) {
        return;
      }
      
      // 使用防抖来避免频繁的进入和离开
      hoverDebounceTimeout = setTimeout(() => {
        // 多重检查确保鼠标真的离开了链接区域
        let currentMouseElement = null;
        try {
          currentMouseElement = document.elementFromPoint(event.clientX, event.clientY);
        } catch (e) {
          // console.log('[NoTab] elementFromPoint 出错，直接清除');
          clearLinkPreviewTimeouts();
          currentHoveredLink = null;
          return;
        }
        
        // 检查鼠标位置的元素
        const currentLink = currentMouseElement?.closest('a');
        
        // 如果鼠标位置的元素是我们的 Shadow DOM 内容，则进一步检查
        if (shadowHost && shadowHost.contains(currentMouseElement)) {
          // console.log('[NoTab] 鼠标在 Shadow DOM 内，检查原始链接位置');
          // 检查原始链接的边界框，看鼠标是否仍在链接区域内
          const linkRect = link.getBoundingClientRect();
          const mouseX = event.clientX;
          const mouseY = event.clientY;
          
          if (mouseX >= linkRect.left && mouseX <= linkRect.right && 
              mouseY >= linkRect.top && mouseY <= linkRect.bottom) {
            // console.log('[NoTab] 鼠标仍在链接边界内，不清除');
            return;
          }
        }
        
        if (!currentLink || currentLink.href !== link.href) {
          // console.log('[NoTab] 悬停模式 - 确认离开，清除超时');
          clearLinkPreviewTimeouts();
          currentHoveredLink = null;
        }
      }, 150); // 增加防抖延迟到150ms，给更多时间稳定
      
    } else if (linkPreviewSettings.triggerMode === 'alt_hover') {
      // console.log('[NoTab] Alt+悬停模式 - 处理离开');
      handleLinkLeave(event);
    }
    // 对于长按模式，不在mouseout时处理
  }
}

// 添加全局变量以存储当前长按的链接
let currentPressedLink = null;

// 修改 handleDocumentMouseDown 函数
function handleDocumentMouseDown(event) {
  // 记录拖拽开始位置
  dragStartX = event.clientX;
  dragStartY = event.clientY;
  isDragging = false;
  
  const link = event.target.closest('a');
  if (link && link.href) {
    // 如果是悬停模式且当前有悬停超时在运行，取消悬停预览，走正常点击逻辑
    if (linkPreviewSettings.triggerMode === 'hover' && 
        currentHoveredLink === link.href && 
        longPressTimeout) {
      // console.log('[NoTab] 悬停期间检测到点击，取消悬停预览，执行正常点击');
      clearLinkPreviewTimeouts();
      currentHoveredLink = null;
      // 不调用 handleLinkMouseDown，让点击事件正常进行
      return;
    }
    
    // 存储当前按下的链接引用
    currentPressedLink = link;
    handleLinkMouseDown(event);
  }
}

// 修改 handleDocumentMouseUp 函数
function handleDocumentMouseUp(event) {
  // 使用保存的链接引用而不是尝试从当前事件获取
  // console.log('[NoTab] 检测到鼠标放开:', currentPressedLink);

  // 如果存在保存的链接引用
  if (currentPressedLink && currentPressedLink.href) {
    // 如果在长按模式下
    if (linkPreviewSettings.triggerMode === 'long_press') {
      // 如果正在长按中，说明已经触发了预览，需要阻止点击事件
      if (isLongPressing) {
        // 不在这里重置isLongPressing，让长按超时函数处理
        clearLinkPreviewTimeouts();
      } else {
        // 如果没有触发长按（时间不够），清除定时器
        clearLinkPreviewTimeouts();
      }
    }
  }

  // 处理完后重置链接引用
  currentPressedLink = null;
}

function handleDocumentMouseMove(event) {
  // 检测是否开始拖拽
  if (!isDragging) {
    const deltaX = Math.abs(event.clientX - dragStartX);
    const deltaY = Math.abs(event.clientY - dragStartY);
    
    // 如果移动距离超过阈值，认为开始拖拽
    if (deltaX > 5 || deltaY > 5) {
      isDragging = true;
    }
  }
  
  const link = event.target.closest('a');
  if (link && link.href) {
    checkAltKeyOnHover(event);
  }
}

function handleDocumentClick(event) {
  const link = event.target.closest('a');
  if (link && link.href) {
    // 如果是悬停模式，点击时确保清除任何残留的悬停状态
    if (linkPreviewSettings.triggerMode === 'hover') {
      clearLinkPreviewTimeouts();
      currentHoveredLink = null;
    }
    
    handleLinkClick(event);
  }
}

// Clear all link preview related timeouts
function clearLinkPreviewTimeouts() {
  if (altKeyTimeout) {
    clearTimeout(altKeyTimeout);
    altKeyTimeout = null;
  }
  if (longPressTimeout) {
    clearTimeout(longPressTimeout);
    longPressTimeout = null;
  }
  if (hoverDebounceTimeout) {
    clearTimeout(hoverDebounceTimeout);
    hoverDebounceTimeout = null;
  }
  removeLongPressLoader(); // Add this line
}

// Handle link mouse down for long press
function handleLinkMouseDown(event) {
  if (linkPreviewSettings.triggerMode === 'long_press') {
    // 只响应鼠标左键（button为0），过滤掉右键（button为2）和中键（button为1）
    if (event.button !== 0) {
      return;
    }
    
    clearLinkPreviewTimeouts(); // Clear previous state including any loader
    const link = event.target.closest('a');
    // console.log('[NoTab] 检测到鼠标按下:', link);
    if (!link) return;

    // Create and show loading indicator near mouse position with offset
    removeLongPressLoader(); // Ensure no duplicate loaders
    longPressLoadingIndicator = document.createElement('div');
    longPressLoadingIndicator.className = 'NoTab-long-press-loader';
    const spinner = document.createElement('div');
    spinner.className = 'loading-spinner';
    longPressLoadingIndicator.appendChild(spinner);
    
    // 将loading指示器放在鼠标中心位置
    longPressLoadingIndicator.style.left = `${event.clientX}px`;
    longPressLoadingIndicator.style.top = `${event.clientY}px`;
    
    appendToShadowDOM(longPressLoadingIndicator);

    // 不在这里设置 isLongPressing，等到真正触发时再设置
    // isLongPressing = true;

    const preventClick = function (e) {
      e.preventDefault();
      e.stopPropagation();
      document.removeEventListener('click', preventClick, true);
    }

    longPressTimeout = setTimeout(() => {
      isLongPressing = true; // 现在才设置为true
      // The loader will be removed by showLinkSummary
      showLinkSummary(event, link);

      // 添加一次性的捕获阶段事件监听器，阻止后续的click事件，防止点击链接后还是跳转到新页面
      document.addEventListener('click', preventClick, true);

      setTimeout(() => {
        document.removeEventListener('click', preventClick, true);
        isLongPressing = false; // 重置长按状态
      }, 1000);
    }, linkPreviewSettings.longPressDelay);
  }
}

// Handle link click with custom trigger key
function handleLinkClick(event) {
  // console.log('[NoTab] 检测到快捷键+点击链接:', event.target.href, linkPreviewSettings.triggerMode, isAltPressed);
  if (linkPreviewSettings.triggerMode !== 'alt_click') {
    return;
  }

  // 检查配置的触发键是否按下
  const triggerKey = linkPreviewSettings.customTriggerKey || 'alt';
  let isTriggerKeyPressed = false;
  
  switch(triggerKey) {
    case 'alt':
      isTriggerKeyPressed = event.altKey;
      break;
    case 'cmd':
      isTriggerKeyPressed = event.metaKey;
      break;
    case 'ctrl':
      isTriggerKeyPressed = event.ctrlKey;
      break;
  }
  
  if (isTriggerKeyPressed || isAltPressed) {
    // 强制阻止默认行为，防止下载行为触发
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    // console.log('[NoTab] 检测到Alt+点击链接:', event.target.href);
    const link = event.target.closest('a');
    if (!link || !link.href) return;

    // 显示链接预览
    showLinkSummary(event, link);

    // 发送消息到background.js获取链接摘要
    chrome.runtime.sendMessage(
      { action: 'fetchLinkSummary', url: link.href },
      function (response) {
        if (response && response.summary) {
          // 保存到缓存
          linkSummaryCache[link.href] = response.summary;
        }
      }
    );

    // 返回false进一步阻止默认行为
    return false;
  }
}

// Handle link mouse leave
function handleLinkLeave() {
  clearLinkPreviewTimeouts(); // This will clear timeouts and remove the loader
  // 不再自动移除预览框，让用户可以通过关闭按钮手动关闭
}

// Track if Alt key is pressed
let isAltPressed = false;
let altKeyResetTimer = null; // 添加重置定时器

function resetAltKeyState() {
  // console.log('[NoTab] 重置Alt键状态');
  isAltPressed = false;
  if (altKeyResetTimer) {
    clearTimeout(altKeyResetTimer);
    altKeyResetTimer = null;
  }
}

function trackAltKeyDown(event) {
  // 检查是否是配置的触发键
  const triggerKey = linkPreviewSettings.customTriggerKey || 'alt';
  let isTargetKey = false;
  
  switch(triggerKey) {
    case 'alt':
      isTargetKey = event.key === 'Alt';
      break;
    case 'cmd':
      isTargetKey = event.key === 'Meta' || event.key === 'Cmd';
      break;
    case 'ctrl':
      isTargetKey = event.key === 'Control';
      break;
  }
  
  if (isTargetKey) {
    // console.log(`[NoTab] 检测到${triggerKey}键按下`);
    isAltPressed = true;

    // 清除之前的重置定时器（如果存在）
    if (altKeyResetTimer) {
      clearTimeout(altKeyResetTimer);
    }

    // 设置新的重置定时器，2秒后自动重置键状态
    altKeyResetTimer = setTimeout(() => {
      // console.log(`[NoTab] ${triggerKey}键状态超时，自动重置`);
      resetAltKeyState();
    }, 2000);

    // 如果当前有鼠标悬停的链接，显示预览
    const hoveredLink = document.querySelector('a:hover');
    if (hoveredLink && linkPreviewSettings.triggerMode === 'alt_hover') {
      clearLinkPreviewTimeouts();
      // 创建一个包含鼠标当前位置信息的事件对象
      const mousePosition = {
        clientX: hoveredLink.getBoundingClientRect().left,
        clientY: hoveredLink.getBoundingClientRect().bottom
      };

      altKeyTimeout = setTimeout(() => {
        showLinkSummary(mousePosition, hoveredLink);
      }, linkPreviewSettings.altHoverDelay);
    }
  }
}

function trackAltKeyUp(event) {
  // console.log('[NoTab] 检测到快捷键释放');
  const triggerKey = linkPreviewSettings.customTriggerKey || 'alt';
  let isTargetKey = false;
  
  switch(triggerKey) {
    case 'alt':
      isTargetKey = event.key === 'Alt';
      break;
    case 'cmd':
      isTargetKey = event.key === 'Meta' || event.key === 'Cmd';
      break;
    case 'ctrl':
      isTargetKey = event.key === 'Control';
      break;
  }
  
  if (isTargetKey) {
    resetAltKeyState();
  }
}

// 在页面失去焦点或切换时重置 Alt 键状态
document.addEventListener('visibilitychange', () => {
  // console.log('[NoTab] 页面失去焦点或切换');
  resetAltKeyState();
  clearLinkPreviewTimeouts();
  if (document.hidden) {
    // console.log('用户切换到其他标签页或应用');
  } else {
    // console.log('用户回到本页面');
  }
});

// 在用户切换到其他窗口时重置 Alt 键状态
window.addEventListener('focusout', () => {
  // console.log('[NoTab] 用户切换到其他窗口');
  resetAltKeyState();
});

// Check Alt key state during mouse movement over links
function checkAltKeyOnHover(event) {
  const link = event.target.closest('a');
  if (!link || !link.href) return;

  if (linkPreviewSettings.triggerMode === 'alt_hover' && isAltPressed) {
    clearLinkPreviewTimeouts();
    altKeyTimeout = setTimeout(() => {
      showLinkSummary(event, link);
    }, linkPreviewSettings.altHoverDelay);
  }
}

// Handle link hover
function handleLinkHover(event) {
  if (!isAltPressed) return;
  if (linkPreviewSettings.triggerMode !== 'alt_hover') {
    return;
  }

  // console.log('[NoTab] 检测到Alt+鼠标悬停在链接上:', event.target.href);
  const link = event.target.closest('a');
  if (!link || !link.href) return;

  showLinkSummary(event, link);

  // 发送消息到background.js获取链接摘要
  chrome.runtime.sendMessage(
    { action: 'fetchLinkSummary', url: link.href },
    function (response) {
      if (response && response.summary) {
        // 保存到缓存
        linkSummaryCache[link.href] = response.summary;
      }
    }
  );
}

// 检查当前脚本是否在iframe中运行
const isInIframe = window !== window.parent;
let iframeLoadData = {
  url: '',
  success: false
}

// 向父窗口发送消息的辅助函数
function postMessageToParent(action, data) {
  if (!isInIframe) return; // 仅在iframe中发送
  window.parent.postMessage({ source: 'NoTab-iframe', action: action, data: data }, '*'); // 使用 '*'，因为源是可信的扩展上下文
}

function optimizeUrl(link) {
  if (link.href) {
    return link.href.replace('http://mp.weixin.qq.com', 'https://mp.weixin.qq.com');
  }
  return link.href;
}

// Show link summary tooltip
async function showLinkSummary(event, link, errorTip = undefined) {
  // 如果在iframe中，发送消息给父窗口处理
  if (isInIframe) {
    // 尝试获取鼠标位置，如果事件存在
    const positionData = event ? { clientX: event.clientX, clientY: event.clientY } : null;
    postMessageToParent('showLinkSummary', {
      url: link.href, // 发送原始链接
      errorTip: errorTip,
      positionData: positionData // 发送位置信息
    });
    return; // 阻止 iframe 直接显示
  }

  // Remove the long press loader if it exists (e.g., when long press succeeds)
  removeLongPressLoader(); // Add this line

  // 检查用户是否可以预览链接
  const previewStatus = { canPreview: true, remainingCount: Infinity };

  // 创建提示框
  const tooltip = document.createElement('div');
  tooltip.className = `NoTab-link-tooltip theme-${linkPreviewSettings.previewTheme || 'light'}`; // Apply theme class
  tooltip.dataset.linkUrl = link.href;
  tooltip.dataset.isPinned = 'false';
  tooltip.dataset.isInteracting = 'false'; // 初始化交互状态
  tooltip.style.zIndex = ACTIVE_ZINDEX; // 设置初始z-index

  // 创建遮罩层
  const overlay = document.createElement('div');
  overlay.className = 'NoTab-overlay';
  overlay.style.zIndex = OVERLAY_ZINDEX;
  // 设置遮罩透明度CSS变量
  overlay.style.setProperty('--overlay-opacity', linkPreviewSettings.overlayOpacity / 100);
  appendToShadowDOM(overlay);

  // 添加鼠标进入事件，使窗口置顶
  tooltip.addEventListener('mouseenter', () => {
    // 将所有其他预览窗口的z-index降低
    activePreviews.forEach((preview, url) => {
      if (url !== link.href) {
        preview.tooltip.style.zIndex = BASE_ZINDEX + 1; // 其他窗口降低z-index
        preview.overlay.style.display = 'none'; // 隐藏其他窗口的遮罩层
      }
    });

    // 当前窗口置顶
    tooltip.style.zIndex = ACTIVE_ZINDEX;
    // 显示遮罩层：鼠标在弹窗内时都显示遮罩层
    overlay.style.display = 'block';
    overlay.classList.add('NoTab-overlay-visible');
  });

  // 添加鼠标离开事件
  tooltip.addEventListener('mouseleave', () => {
    // 如果正在交互（拖拽或调整大小），不要隐藏遮罩层
    if (tooltip.dataset.isInteracting === 'true') {
      return;
    }
    // 统一逻辑：鼠标离开时隐藏遮罩层，并完全隐藏遮罩层元素以确保不阻止页面交互
    overlay.classList.remove('NoTab-overlay-visible');
    overlay.style.display = 'none';
  });

  // 记录当前预览的URL
  activePreviewUrls.push(link.href);

  // 创建内容容器
  const tooltipContent = document.createElement('div');
  tooltipContent.className = 'NoTab-link-tooltip-content';

  // 解析URL以获取更友好的显示
  let displayUrl = link.href; // 简化URL显示逻辑，可按需添加

  // 新增：视频模式相关变量
  let isVideoMode = false;
  let videoPlayUrl = null;
  const videoButtonTitle = getMessage('videoMode');
  const videoButtonDisabledTitle = getMessage('videoModeUnavailable');

  // 新增：解析视频ID的辅助函数
  function getYoutubeVideoId(url) {
    const regex = /(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    const match = url.match(regex);
    return match ? match[1] : null;
  }

  function getBilibiliVideoId(url) {
    const regex = /bilibili\.com\/(?:video\/|bangumi\/play\/ep|bangumi\/play\/ss)?([aA-zZ0-9]+)/;
    const match = url.match(regex);
    if (match && match[1]) {
        // 进一步检查是否是BV号 (例如 BV1xx411c7N2)
        if (match[1].startsWith('BV') || match[1].startsWith('bv')) return match[1];
        // 可能是av号，但B站现在主要用BV，这里可以根据需要扩展
        // 尝试从查询参数中获取bvid
        try {
            const urlObj = new URL(url);
            const bvid = urlObj.searchParams.get('bvid');
            if (bvid) return bvid;
        } catch (e) { /*无效URL则忽略*/ }
    }
    return null;
  }

  const youtubeId = getYoutubeVideoId(link.href);
  const bilibiliId = getBilibiliVideoId(link.href);

  if (youtubeId) {
    videoPlayUrl = `https://www.youtube.com/embed/${youtubeId}`;
  } else if (bilibiliId) {
    videoPlayUrl = `https://player.bilibili.com/player.html?bvid=${bilibiliId}`;
  }

  // 如果用户可以预览，或者已经是会员，正常显示预览
  if (!errorTip) {
    const handledUrl = optimizeUrl(link);

    // 将 handledUrl 存储到 dataset 中，以便在闭包中稳定访问
    tooltip.dataset.handledUrl = handledUrl;

    // 设置提示框内容 - 正常预览
    tooltipContent.innerHTML = `
      <div class="NoTab-link-tooltip-header" id="drag-handle">
        <div class="NoTab-link-tooltip-link-group">
          <a class="NoTab-link-tooltip-title" href="${link.href}" target="_blank" rel="noopener noreferrer" title="${link.href}">${displayUrl}</a>
        </div>
        <div class="NoTab-link-tooltip-actions">
          <button class="NoTab-link-tooltip-action NoTab-link-tooltip-video-mode ${videoPlayUrl ? '' : 'disabled'}" title="${videoPlayUrl ? videoButtonTitle : videoButtonDisabledTitle}"></button>
          <button class="NoTab-link-tooltip-action NoTab-link-tooltip-pin" title="${getMessage('pinPreview')}"></button>
          <button class="NoTab-link-tooltip-action NoTab-link-tooltip-refresh" title="${getMessage('refresh')}"></button>
          <button class="NoTab-link-tooltip-action NoTab-link-tooltip-open" title="${getMessage('openInNewWindow')}"></button>
          <button class="NoTab-link-tooltip-action NoTab-link-tooltip-close" title="${getMessage('close')}"></button>
        </div>
      </div>
      <div class="NoTab-link-tooltip-progress"></div>
      <div class="NoTab-link-tooltip-body">
        <div class="NoTab-link-tooltip-iframe-container">
          <iframe class="NoTab-link-tooltip-iframe" src="${handledUrl}" sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-downloads allow-orientation-lock allow-pointer-lock allow-presentation allow-modals"></iframe>
        </div>
        <div class="NoTab-link-tooltip-video-container" style="display: none"> <!-- 新增视频容器 -->
          <iframe class="NoTab-link-tooltip-video-iframe" frameborder="0" allowfullscreen referrerpolicy="no-referrer" title="视频播放器" sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-downloads allow-orientation-lock allow-pointer-lock allow-presentation allow-modals"></iframe>
        </div>
      </div>
      <div class="NoTab-link-tooltip-resize-handle NoTab-resize-se"></div>
      <div class="NoTab-link-tooltip-resize-handle NoTab-resize-sw"></div>
    `;
  }

  tooltip.appendChild(tooltipContent);

  // 添加到 Shadow DOM
  appendToShadowDOM(tooltip);

  // 获取预览框大小
  const { tooltipWidth, tooltipHeight } = getPreviewSize();

  // 计算位置
  const { left, top } = calculatePreviewPosition(event, tooltipWidth, tooltipHeight);

  // 设置位置和尺寸
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
  tooltip.style.width = `${tooltipWidth}px`;
  tooltip.style.height = `${tooltipHeight}px`;

  // 添加鼠标进入和离开事件处理
  tooltip.addEventListener('mouseenter', () => {
    // 显示遮罩层：鼠标在弹窗内时都显示遮罩层
    overlay.style.display = 'block';
    overlay.classList.add('NoTab-overlay-visible');
  });

  tooltip.addEventListener('mouseleave', () => {
    // 如果正在交互（拖拽或调整大小），不要隐藏遮罩层
    if (tooltip.dataset.isInteracting === 'true') {
      return;
    }
    // 统一逻辑：鼠标离开时隐藏遮罩层，并完全隐藏遮罩层元素以确保不阻止页面交互
    overlay.classList.remove('NoTab-overlay-visible');
    overlay.style.display = 'none';
  });

  // 显示提示框
  setTimeout(() => {
    // 鼠标悬停时显示遮罩层（无论是否固定）
    if (tooltip.matches(':hover')) {
      overlay.classList.add('NoTab-overlay-visible');
    }
    tooltip.classList.add('NoTab-link-tooltip-visible');
  }, 10);

  // 获取关闭按钮
  const closeBtn = tooltip.querySelector('.NoTab-link-tooltip-close');

  // 关闭按钮点击事件
  closeBtn.addEventListener('click', () => {
    tooltip.classList.remove('NoTab-link-tooltip-visible');
    setTimeout(() => {
      removeFromShadowDOM(tooltip);
      removeFromShadowDOM(overlay); // 移除遮罩层
      activePreviewUrls = activePreviewUrls.filter(url => url !== link.href);
      // 从Map中移除引用
      activePreviews.delete(link.href);
    }, 200);
  });

  // 添加剩余次数元素的点击事件 (如果存在)
  const remainingPreviewsEl = tooltip.querySelector('.NoTab-remaining-previews');
  if (remainingPreviewsEl) {
    remainingPreviewsEl.addEventListener('click', () => {
      window.open('https://notab.pro/#pricing', '_blank');
      // 可选：点击后关闭预览
      // closeBtn.click();
    });
  }

  // 如果可以预览或用户是VIP，绑定其他事件
  if (previewStatus.canPreview || isCurrentUserVip) { // 修改这里
    const openBtn = tooltip.querySelector('.NoTab-link-tooltip-open');
    const refreshBtn = tooltip.querySelector('.NoTab-link-tooltip-refresh');
    const pinBtn = tooltip.querySelector('.NoTab-link-tooltip-pin');
    const iframe = tooltip.querySelector('.NoTab-link-tooltip-iframe');
    const iframeContainer = tooltip.querySelector('.NoTab-link-tooltip-iframe-container');
    const progressBar = tooltip.querySelector('.NoTab-link-tooltip-progress');
    const dragHandle = tooltip.querySelector('#drag-handle');
    const resizeHandleSE = tooltip.querySelector('.NoTab-resize-se'); // 右下角
    const resizeHandleSW = tooltip.querySelector('.NoTab-resize-sw'); // 左下角

    // 新增：视频模式相关元素
    const videoModeBtn = tooltip.querySelector('.NoTab-link-tooltip-video-mode');
    const videoContainer = tooltip.querySelector('.NoTab-link-tooltip-video-container');
    const videoIframe = tooltip.querySelector('.NoTab-link-tooltip-video-iframe');

    // 新增：视频模式状态 (isVideoMode 已在函数开头定义)

    // 显示进度条动画
    progressBar.classList.add('notab-loading');

    // 新增：视频模式切换函数
    function toggleVideoMode() {
      if (!videoModeBtn || videoModeBtn.classList.contains('disabled') || !videoPlayUrl) return;
      isVideoMode = !isVideoMode;

      if (isVideoMode) { // Entering Video Mode

        if (iframe) iframe.src = 'about:blank'; // Stop standard iframe playback

        if (videoIframe && videoIframe.src !== videoPlayUrl) {
          videoIframe.src = videoPlayUrl;
          progressBar.classList.add('notab-loading'); // Show loading for video
        }
      } else { // Exiting Video Mode
        if (videoIframe) videoIframe.src = 'about:blank'; // Stop video iframe playback
        // restore standard iframe
        if (iframe) {
          iframe.src = tooltip.dataset.handledUrl; // Reload original content from dataset
          progressBar.classList.add('notab-loading');
        }
      }

      videoModeBtn.classList.toggle('active', isVideoMode);
      iframeContainer.style.display = !isVideoMode ? 'block' : 'none';
      videoContainer.style.display = isVideoMode ? 'block' : 'none';
    }

    if (videoModeBtn) videoModeBtn.addEventListener('click', toggleVideoMode); // 添加视频模式按钮事件

    openBtn.addEventListener('click', () => {
      window.open(link.href, '_blank');
      closeBtn.click();
    });

    refreshBtn.addEventListener('click', () => {
      progressBar.classList.add('notab-loading');
      iframe.src = iframe.src;
    });

    const loadCallback = () => {
      progressBar.classList.remove('notab-loading');
      
      // 更新地址栏URL - 获取iframe当前的URL
      try {
        if (iframe.contentWindow && iframe.contentWindow.location && iframe.contentWindow.location.href !== 'about:blank') {
          const currentUrl = iframe.contentWindow.location.href;
          const titleElement = tooltip.querySelector('.NoTab-link-tooltip-title');
          if (titleElement && currentUrl !== handledUrl) {
            // 简化URL显示
            let displayUrl = currentUrl;
            try {
              const urlObj = new URL(currentUrl);
              displayUrl = urlObj.hostname + urlObj.pathname;
              if (displayUrl.length > 50) {
                displayUrl = displayUrl.substring(0, 47) + '...';
              }
            } catch (e) {
              // 如果URL解析失败，使用原URL并截断
              if (displayUrl.length > 50) {
                displayUrl = displayUrl.substring(0, 47) + '...';
              }
            }
            titleElement.textContent = displayUrl;
            titleElement.href = currentUrl;
            titleElement.title = currentUrl;
          }
        }
      } catch (e) {
        // 跨域限制，无法获取iframe内容，这是正常情况
        // console.log('[NoTab] 无法获取iframe URL (跨域限制):', e.message);
      }
      
      iframe.removeEventListener('load', loadCallback);
    }

    iframe.addEventListener('load', loadCallback);
    
    // 添加iframe错误处理
    iframe.addEventListener('error', () => {
      progressBar.classList.remove('notab-loading');
    });

    // 新增：视频 iframe 加载事件
    if (videoIframe) {
        videoIframe.addEventListener('load', () => {
          if (isVideoMode) {
            progressBar.classList.remove('notab-loading');
          }
        });
        videoIframe.addEventListener('error', () => {
            progressBar.classList.remove('notab-loading');
            // 视频加载失败，禁用视频模式并切换回普通模式
            if (isVideoMode) { // 如果当前是视频模式，则切换
                isVideoMode = false;
                videoModeBtn.classList.remove('active');
                iframeContainer.style.display = 'block';
                videoContainer.style.display = 'none';
                iframe.src = tooltip.dataset.handledUrl;
                progressBar.classList.add('notab-loading');
            }
        });
    }

    pinBtn.addEventListener('click', (e) => {
      const isPinned = tooltip.dataset.isPinned === 'true';
      tooltip.dataset.isPinned = !isPinned ? 'true' : 'false';
      pinBtn.classList.toggle('active', !isPinned);
      
      // 统一逻辑：固定/取消固定时，根据鼠标位置决定遮罩层显示
      if (tooltip.matches(':hover')) {
        // 鼠标在弹窗内，显示遮罩层
        overlay.style.display = 'block';
        overlay.classList.add('NoTab-overlay-visible');
      } else {
        // 鼠标在弹窗外，隐藏遮罩层
        overlay.style.display = 'none';
        overlay.classList.remove('NoTab-overlay-visible');
      }
      
      e.stopPropagation();
    });

    let isDragging = false;
    let isResizing = false;
    let resizeDirection = null; // 'se' for southeast, 'sw' for southwest
    let originalX, originalY, originalWidth, originalHeight, originalLeft, originalTop;
    let animationFrameId = null;
    let pendingUpdate = null;
    let isInteracting = false; // 新增：跟踪是否正在交互

    // 性能优化：使用 requestAnimationFrame 和节流
    function throttledUpdate(updateFn) {
      if (pendingUpdate) {
        pendingUpdate = updateFn;
        return;
      }
      
      pendingUpdate = updateFn;
      animationFrameId = requestAnimationFrame(() => {
        if (pendingUpdate) {
          pendingUpdate();
          pendingUpdate = null;
        }
        animationFrameId = null;
      });
    }

          dragHandle.addEventListener('mousedown', (e) => {
        if (e.target.closest('button, a')) return;
        isDragging = true;
        isInteracting = true; // 设置交互状态
        tooltip.dataset.isInteracting = 'true'; // 同时设置到dataset
        originalX = e.clientX - tooltip.offsetLeft;
        originalY = e.clientY - tooltip.offsetTop;
        
        // 添加拖拽时的样式优化
        tooltip.style.willChange = 'transform';
        // 不设置整个tooltip的pointerEvents，让CSS类来处理iframe的pointerEvents
        tooltip.classList.add('dragging');
        document.body.style.userSelect = 'none';
        
        e.preventDefault();
      });

          // 右下角调整大小句柄
      resizeHandleSE.addEventListener('mousedown', (e) => {
        isResizing = true;
        isInteracting = true; // 设置交互状态
        tooltip.dataset.isInteracting = 'true'; // 同时设置到dataset
        resizeDirection = 'se'; // southeast
        originalWidth = tooltip.offsetWidth;
        originalHeight = tooltip.offsetHeight;
        originalLeft = tooltip.offsetLeft;
        originalTop = tooltip.offsetTop;
        originalX = e.clientX;
        originalY = e.clientY;
        
        // 添加调整大小时的样式优化
        tooltip.style.willChange = 'width, height';
        // 不设置整个tooltip的pointerEvents，让CSS类来处理iframe的pointerEvents
        tooltip.classList.add('resizing');
        document.body.style.userSelect = 'none';
        
        e.preventDefault();
      });

          // 左下角调整大小句柄
      resizeHandleSW.addEventListener('mousedown', (e) => {
        isResizing = true;
        isInteracting = true; // 设置交互状态
        tooltip.dataset.isInteracting = 'true'; // 同时设置到dataset
        resizeDirection = 'sw'; // southwest
        originalWidth = tooltip.offsetWidth;
        originalHeight = tooltip.offsetHeight;
        originalLeft = tooltip.offsetLeft;
        originalTop = tooltip.offsetTop;
        originalX = e.clientX;
        originalY = e.clientY;
        
        // 添加调整大小时的样式优化
        tooltip.style.willChange = 'width, height, left';
        // 不设置整个tooltip的pointerEvents，让CSS类来处理iframe的pointerEvents
        tooltip.classList.add('resizing');
        document.body.style.userSelect = 'none';
        
        e.preventDefault();
      });

    document.addEventListener('mousemove', (e) => {
      if (isDragging) {
        throttledUpdate(() => {
          const left = e.clientX - originalX;
          const top = e.clientY - originalY;
          
          // 使用 transform 而不是直接修改 left/top 来提高性能
          tooltip.style.transform = `translate(${left - tooltip.offsetLeft}px, ${top - tooltip.offsetTop}px)`;
          tooltip.style.left = `${left}px`;
          tooltip.style.top = `${top}px`;
          tooltip.style.transform = '';
          
                     // 保存最新位置（仅更新内存，不立即保存到存储）
           lastPreviewState.left = left;
           lastPreviewState.top = top;
        });
      }
      
      if (isResizing) {
        throttledUpdate(() => {
          if (resizeDirection === 'se') {
            // 右下角调整大小
            const newWidth = originalWidth + (e.clientX - originalX);
            const newHeight = originalHeight + (e.clientY - originalY);
            
            if (newWidth > 400) {
              tooltip.style.width = `${newWidth}px`;
              lastPreviewState.width = newWidth;
            }
            if (newHeight > 300) {
              tooltip.style.height = `${newHeight}px`;
              lastPreviewState.height = newHeight;
            }
          } else if (resizeDirection === 'sw') {
            // 左下角调整大小
            const deltaX = originalX - e.clientX;
            const deltaY = e.clientY - originalY;
            const newWidth = originalWidth + deltaX;
            const newHeight = originalHeight + deltaY;
            
            if (newWidth > 400) {
              tooltip.style.width = `${newWidth}px`;
              tooltip.style.left = `${originalLeft - deltaX}px`;
              lastPreviewState.width = newWidth;
              lastPreviewState.left = originalLeft - deltaX;
            }
            if (newHeight > 300) {
              tooltip.style.height = `${newHeight}px`;
              lastPreviewState.height = newHeight;
            }
          }
        });
      }
    });

    document.addEventListener('mouseup', () => {
      if (isDragging || isResizing) {
        // 清理性能优化样式
        tooltip.style.willChange = '';
        // 不需要重置pointerEvents，因为我们没有设置它
        tooltip.classList.remove('dragging', 'resizing');
        document.body.style.userSelect = '';
        
        // 保存状态到存储（仅在操作结束时保存一次）
        saveLastPreviewState();
        
        // 取消待处理的动画帧
        if (animationFrameId) {
          cancelAnimationFrame(animationFrameId);
          animationFrameId = null;
        }
        pendingUpdate = null;
        
        // 延迟重置交互状态，避免立即触发点击外部事件
        setTimeout(() => {
          isInteracting = false;
          tooltip.dataset.isInteracting = 'false';
          
          // 交互结束后，检查鼠标是否还在弹窗内，如果不在则隐藏遮罩层
          if (!tooltip.matches(':hover')) {
            overlay.classList.remove('NoTab-overlay-visible');
            overlay.style.display = 'none';
          }
        }, 50);
      }
      
      isDragging = false;
      isResizing = false;
      resizeDirection = null;
    });
  }

  // 点击外部关闭 (仅当未固定时)
  function handleClickOutside(e) {
    // console.log('[NoTab] handleClickOutside isLongPressing', isLongPressing);
    if (isLongPressing) {
      return;
    }
    
    // 检查是否正在交互，如果是则忽略此次点击
    if (tooltip.dataset.isInteracting === 'true') {
      return;
    }
    
    // 检查点击是否在 Shadow DOM 中的 tooltip 内部
    let isClickInsideTooltip = false;
    
    // 检查点击目标的路径，包括Shadow DOM
    const path = e.composedPath ? e.composedPath() : (e.path || []);
    
    // 方法1：使用 composedPath 检查整个事件路径
    if (path.length > 0) {
      isClickInsideTooltip = path.some(element => 
        element === tooltip || 
        (element.nodeType === Node.ELEMENT_NODE && tooltip.contains(element))
      );
    }
    
    // 方法2：如果 composedPath 不可用，回退到原来的方法
    if (!isClickInsideTooltip && shadowRoot && shadowRoot.contains && shadowRoot.contains(e.target)) {
      isClickInsideTooltip = tooltip.contains(e.target);
    }
    
    // 方法3：检查原始链接（需要处理虚拟链接元素的情况）
    let isClickOnLink = false;
    if (link.parentNode) {
      // 真实的链接元素
      isClickOnLink = e.target === link || link.contains(e.target);
    }
    // 对于虚拟链接元素（如文字搜索），不需要检查点击是否在链接上
    
    if (!isClickInsideTooltip && !isClickOnLink) {
      if (tooltip.dataset.isPinned !== 'true') {
        closeBtn.click();
        document.removeEventListener('click', handleClickOutside);
      }
    }
  }

  // 使用 setTimeout 延迟添加 handleClickOutside 监听器
  setTimeout(() => {
    // 再次检查 tooltip 是否仍然存在于 DOM 中，以防在 setTimeout 延迟期间被移除
      document.addEventListener('click', handleClickOutside);
  }, 0); // 0ms 的延迟通常足以将其推送到下一个事件循环

  // 将预览窗口引用存入Map
  activePreviews.set(link.href, { tooltip, overlay });
}

// 设置文本选择监听器
function setupTextSelectionListeners() {
  // 监听来自后台脚本的消息，处理右键菜单搜索请求
  // 现在在onMessage中统一处理
}

// 搜索选中文本
function searchSelectedText(text) {
  // 如果在iframe中，发送消息给父窗口处理
  if (isInIframe) {
    postMessageToParent('searchSelectedText', { text: text });
    return;
  }

  // 获取搜索URL
  let searchUrl = getSearchUrl(text);

  // 创建虚拟链接元素
  const linkElement = document.createElement('a');
  linkElement.href = searchUrl;
  linkElement.textContent = text;

  // 显示搜索结果预览
  showLinkSummary(null, linkElement);
}

// 获取搜索URL
function getSearchUrl(query) {

  // 如果启用了自动打开链接功能，检查是否是有效的URL
  if (textSearchSettings.dragUrlAutoOpen) {
    try {
      const urlPattern = /^(https?:\/\/)?([\w-]+\.)+[\w-]+(\/[\w- ./?%&=]*)?$/;
      if (urlPattern.test(query)) {
        // 如果是有效的URL，但没有协议，添加https://
        if (!query.startsWith('http')) {
          return 'https://' + query;
        }
        return query;
      }
    } catch (e) {
      // 如果URL解析失败，继续使用搜索
      console.error('URL parsing failed:', e);
    }
  }

  const engine = textSearchSettings.searchEngine;
  let urlTemplate = '';

  if (engine === 'custom' && textSearchSettings.customSearchUrl) {
    urlTemplate = textSearchSettings.customSearchUrl;
  } else if (searchEngineUrls[engine]) {
    urlTemplate = searchEngineUrls[engine];
  } else {
    // 默认使用Google
    urlTemplate = searchEngineUrls.google;
  }

  // 替换查询参数
  return urlTemplate.replace('%s', encodeURIComponent(query));
}

// Initialize when the content script loads
init();

// 全局消息存储
let i18nMessages = {};

// 自定义i18n消息获取函数，替代chrome.i18n.getMessage
function getMessage(messageName) {
  // 如果消息已加载到全局对象
  if (i18nMessages && i18nMessages[messageName]) {
    return i18nMessages[messageName].message;
  }

  // 否则，回退到chrome.i18n
  return chrome.i18n.getMessage(messageName);
}

// 加载指定语言的消息
async function loadMessages(language) {
  try {
    // console.log('[NoTab] 加载语言消息:', language);

    // 通过消息请求后台脚本获取语言文件
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        action: 'getLanguageMessages',
        language: language
      }, function (response) {
        if (response && response.messages) {
          // console.log('[NoTab] 消息加载成功:', Object.keys(response.messages).length);
          i18nMessages = response.messages;
          resolve(true);
        } else {
          console.error('[NoTab] 消息加载失败:', response?.error || '未知错误');
          // 如果加载失败且不是英语，尝试加载英语
          if (language !== 'en') {
            // console.log('[NoTab] 回退到英语');
            loadMessages('en').then(resolve).catch(reject);
          } else {
            reject(new Error('无法加载任何语言文件'));
          }
        }
      });
    });
  } catch (error) {
    console.error('加载语言消息失败:', error);
    // 如果加载失败且不是英语，尝试加载英语
    if (language !== 'en') {
      return loadMessages('en');
    }
    return false;
  }
}

// 更新所有UI文本的辅助函数
function updateAllUITexts() {
  // 更新链接预览相关文本
  const linkPreviews = shadowRoot ? shadowRoot.querySelectorAll('.NoTab-link-tooltip') : [];
  if (linkPreviews.length > 0) {
    linkPreviews.forEach(preview => {
      const pinBtn = preview.querySelector('.NoTab-link-tooltip-pin');
      const refreshBtn = preview.querySelector('.NoTab-link-tooltip-refresh');
      const openBtn = preview.querySelector('.NoTab-link-tooltip-open');
      const closeBtn = preview.querySelector('.NoTab-link-tooltip-close');
      const videoModeBtn = preview.querySelector('.NoTab-link-tooltip-video-mode'); // 新增视频模式按钮

      if (pinBtn) pinBtn.title = getMessage('pinPreview') || '固定预览';
      if (refreshBtn) refreshBtn.title = getMessage('refresh') || '刷新';
      if (openBtn) openBtn.title = getMessage('openInNewWindow') || '新窗口打开';
      if (closeBtn) closeBtn.title = getMessage('close') || '关闭';
      if (videoModeBtn && !videoModeBtn.classList.contains('disabled')) videoModeBtn.title = getMessage('videoMode') || '视频模式'; // 新增视频模式按钮标题
      if (videoModeBtn && videoModeBtn.classList.contains('disabled')) videoModeBtn.title = getMessage('videoModeUnavailable') || '视频模式不可用';
    });
  }

  // 更新任何带有data-i18n属性的元素
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    el.textContent = getMessage(key);
  });
}

// Helper function to remove the long press loading indicator
function removeLongPressLoader() {
  if (longPressLoadingIndicator) {
    // console.log('[NoTab] removeLongPressLoader - 移除loading指示器');
    removeFromShadowDOM(longPressLoadingIndicator);
    longPressLoadingIndicator = null;
  }
}

// 处理链接拖动结束事件
function handleDocumentDragEnd(event) {
  // 首先判断event.target是否为Element节点或者是否有closest方法
  const isElement = event.target && typeof event.target.closest === 'function';

  // 只有当event.target是Element节点时才尝试查找链接
  if (isElement) {
    const link = event.target.closest('a');
    if (link && link.href) {
      // 检查是否启用了拖动链接预览
      if (linkPreviewSettings.triggerMode === 'drag_link') {
        // console.log('[NoTab] 检测到链接拖动结束:', link.href);

        // 显示链接预览
        showLinkSummary(event, link);
        return; // 如果是链接拖动，处理完毕后返回
      }
    }
  }

  // 如果不是链接或链接预览未启用，尝试处理文本拖拽
  if (textSearchSettings.dragTextAction === 'disabled') {
    return; // 如果文本拖拽动作被禁用，直接返回
  }

  // 获取选中的文本
  const selectedText = window.getSelection().toString().trim();
  if (!selectedText || selectedText.length === 0) {
    return; // 如果没有选中文本，直接返回
  }

  // console.log('[NoTab] 检测到文本拖拽结束:', selectedText);

  // 传统单动作模式
  if (textSearchSettings.dragTextAction === 'search') {
      searchSelectedText(selectedText);
  } else if (textSearchSettings.dragTextAction === 'translate') {
      translateSelectedText(selectedText);
  }
  
  // 重置拖拽状态
  isDragging = false;
}

// 检查当前网站是否在黑名单中
function isCurrentSiteBlacklisted() {
  if (!linkPreviewSettings || !linkPreviewSettings.blacklistSites || linkPreviewSettings.blacklistSites.length === 0) {
    return false; // 没有黑名单或黑名单为空
  }

  // 获取当前网站的主机名
  const currentHostname = window.location.hostname.toLowerCase();

  // 检查是否包含在黑名单中（支持部分匹配）
  return linkPreviewSettings.blacklistSites.some(site => {
    const blacklistSite = site.trim().toLowerCase();

    // 完全匹配
    if (currentHostname === blacklistSite) {
      return true;
    }

    // 子域名匹配
    if (blacklistSite.startsWith('.') && currentHostname.endsWith(blacklistSite)) {
      return true;
    }

    // 通配符匹配
    if (blacklistSite.startsWith('*.') && currentHostname.endsWith(blacklistSite.substring(1))) {
      return true;
    }

    // 直接包含匹配
    if (currentHostname.includes(blacklistSite)) {
      return true;
    }

    return false;
  });
}

// 新增函数：处理 Esc 键按下事件以关闭预览窗口
function handleDocumentKeyDownForClose(event) {
  if (event.key === 'Escape') {
    // 如果在iframe中，发送消息给父窗口处理
    if (isInIframe) {
      postMessageToParent('closePreview');
      event.preventDefault(); // 阻止 iframe 内可能的默认行为
      return;
    }
    // 在主窗口直接处理
    handleEscKeyPress();
    event.preventDefault(); // 阻止可能的默认行为
  }
}

// 新增：封装 Esc 按键的核心逻辑，方便 iframe 和主窗口调用
function handleEscKeyPress() {
  if (activePreviewUrls.length > 0) {
    // 获取最后一个打开的预览窗口URL
    const lastUrl = activePreviewUrls[activePreviewUrls.length - 1];
    const preview = activePreviews.get(lastUrl);

    if (preview && preview.tooltip) {
      const pinBtn = preview.tooltip.querySelector('.NoTab-link-tooltip-pin');
      const closeBtn = preview.tooltip.querySelector('.NoTab-link-tooltip-close');

      // 检查 Pin 按钮是否存在并且没有 active 类 (表示未固定)
      if (pinBtn && !pinBtn.classList.contains('active')) {
        if (closeBtn) {
          closeBtn.click(); // 调用现有关闭逻辑
        }
      } else {
        // console.log('[NoTab] 最后一个预览窗口已固定或按钮不存在，Esc 无效:', lastUrl);
      }
    }
  }
}

// 新增：处理来自 iframe 的消息 (仅在顶层窗口运行)
function handleIframeMessages(event) {
  // 验证消息来源和结构
  if (event.data && event.data.source === 'NoTab-iframe' && event.data.action) {
    // console.log('[NoTab] 收到来自 iframe 的消息:', event.data);
    const { action, data } = event.data;

    switch (action) {
      case 'showLinkSummary':
        // 创建一个虚拟链接对象
        const virtualLink = document.createElement('a');
        virtualLink.href = data.url;
        // 创建一个模拟事件对象（或null）用于定位
        const virtualEvent = data.positionData ? { clientX: data.positionData.clientX, clientY: data.positionData.clientY } : null;
        // 调用主窗口的 showLinkSummary
        showLinkSummary(virtualEvent, virtualLink, data.errorTip);
        break;
      case 'searchSelectedText':
        searchSelectedText(data.text);
        break;
      case 'translateSelectedText':
        translateSelectedText(data.text);
        break;
      case 'closePreview':
        // 直接执行 Esc 关闭逻辑
        handleEscKeyPress();
        break;
    }
  }
}

// 在文件末尾添加以下函数

// 更新自定义主题样式
function updateCustomThemeStyle(colors) {
  if (!colors || !colors.bg || !colors.text) {
    return;
  }
  
  // 获取或创建自定义主题样式元素
  let customThemeStyle = shadowRoot ? shadowRoot.getElementById('NoTab-custom-theme-style') : null;
  if (!customThemeStyle) {
    customThemeStyle = document.createElement('style');
    customThemeStyle.id = 'NoTab-custom-theme-style';
    addStylesToShadowDOM(customThemeStyle);
  }
  
  // 基于背景色和文本色计算其他颜色
  const bgColor = colors.bg;
  const textColor = colors.text;
  
  // 生成略深的背景色作为header背景
  const headerBgColor = adjustColor(bgColor, -10);
  // 生成略浅的文本色作为border颜色
  const borderColor = adjustColor(textColor, 100);
  // 生成略深的文本色作为hover border颜色
  const hoverBorderColor = adjustColor(textColor, 50);
  // 使用文本色作为action背景色
  const actionBgColor = textColor;
  // 生成较深的文本色作为hover背景色
  const actionHoverBgColor = adjustColor(textColor, -50);
  // 生成突出的强调色
  const accentColor = generateAccentColor(bgColor, textColor);
  
  // 设置自定义主题的CSS变量
  const cssText = `
    .NoTab-link-tooltip.theme-custom {
      --tooltip-bg: ${bgColor};
      --tooltip-text: ${textColor};
      --tooltip-header-bg: ${headerBgColor};
      --tooltip-header-text: ${textColor};
      --tooltip-border: ${borderColor};
      --tooltip-link-bg: ${bgColor};
      --tooltip-link-border: ${borderColor};
      --tooltip-link-hover-border: ${hoverBorderColor};
      --tooltip-action-bg: ${actionBgColor};
      --tooltip-action-hover-bg: ${actionHoverBgColor};
      --tooltip-action-active-bg: ${accentColor};
      --tooltip-action-disabled-bg: #a0aec0;
      --tooltip-summary-bg: ${adjustColor(bgColor, -5)};
      --tooltip-summary-text: ${textColor};
      --tooltip-loading-bg: ${bgColor}F5;
      --tooltip-loading-text: ${textColor};
      --tooltip-resize-handle-border: ${textColor}33;
      --tooltip-resize-handle-hover-border: ${textColor}66;
      --tooltip-remaining-previews-bg: ${adjustColor(bgColor, -10)};
      --tooltip-remaining-previews-text: ${textColor};
      --tooltip-remaining-previews-hover-bg: ${adjustColor(bgColor, -20)};
      --tooltip-remaining-previews-hover-text: ${textColor};
    }
  `;
  
  customThemeStyle.textContent = cssText;
}

// 辅助函数：调整颜色明度
function adjustColor(color, amount) {
  // 如果颜色是十六进制格式，转换为RGB
  let r, g, b;
  
  if (color.startsWith('#')) {
    // 处理六位十六进制颜色
    if (color.length === 7) {
      r = parseInt(color.substring(1, 3), 16);
      g = parseInt(color.substring(3, 5), 16);
      b = parseInt(color.substring(5, 7), 16);
    } 
    // 处理三位十六进制颜色
    else if (color.length === 4) {
      r = parseInt(color.substring(1, 2), 16) * 17;
      g = parseInt(color.substring(2, 3), 16) * 17;
      b = parseInt(color.substring(3, 4), 16) * 17;
    }
  } 
  // 尝试处理rgb格式
  else if (color.startsWith('rgb')) {
    const matches = color.match(/\d+/g);
    if (matches && matches.length >= 3) {
      r = parseInt(matches[0]);
      g = parseInt(matches[1]);
      b = parseInt(matches[2]);
    }
  }
  
  // 默认值，以防解析失败
  if (isNaN(r) || isNaN(g) || isNaN(b)) {
    r = 128;
    g = 128;
    b = 128;
  }
  
  // 调整RGB值
  r = Math.max(0, Math.min(255, r + amount));
  g = Math.max(0, Math.min(255, g + amount));
  b = Math.max(0, Math.min(255, b + amount));
  
  // 转回十六进制
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// 辅助函数：生成强调色
function generateAccentColor(bgColor, textColor) {
  // 检查背景色是浅色还是深色
  if (isLightColor(bgColor)) {
    // 如果背景是浅色，使用蓝色调
    return '#4285f4';
  } else {
    // 如果背景是深色，使用亮蓝色
    return '#00aaff';
  }
}

// 辅助函数：检查颜色是否是浅色
function isLightColor(color) {
  let r, g, b;
  
  if (color.startsWith('#')) {
    // 处理六位十六进制颜色
    if (color.length === 7) {
      r = parseInt(color.substring(1, 3), 16);
      g = parseInt(color.substring(3, 5), 16);
      b = parseInt(color.substring(5, 7), 16);
    } 
    // 处理三位十六进制颜色
    else if (color.length === 4) {
      r = parseInt(color.substring(1, 2), 16) * 17;
      g = parseInt(color.substring(2, 3), 16) * 17;
      b = parseInt(color.substring(3, 4), 16) * 17;
    }
  } 
  // 尝试处理rgb格式
  else if (color.startsWith('rgb')) {
    const matches = color.match(/\d+/g);
    if (matches && matches.length >= 3) {
      r = parseInt(matches[0]);
      g = parseInt(matches[1]);
      b = parseInt(matches[2]);
    }
  }
  
  // 默认值，以防解析失败
  if (isNaN(r) || isNaN(g) || isNaN(b)) {
    return true;
  }
  
  // 计算颜色的亮度 (HSP色彩模型)
  // http://alienryderflex.com/hsp.html
  const hsp = Math.sqrt(0.299 * (r * r) + 0.587 * (g * g) + 0.114 * (b * b));
  
  // 亮度大于127.5视为浅色
  return hsp > 127.5;
}

// 获取样式内容
function getStyles() {
  return `
    /* Highlight styles */
    .NoTab-highlight {
      background-color: transparent;
      cursor: pointer;
      position: relative;
      display: inline;
      transition: all 0.2s;
      text-decoration: none;
      box-shadow: none;
      border-bottom: 2px solid rgba(255, 235, 59, 0.7);
    }
    
    .NoTab-highlight:hover {
      background-color: rgba(255, 235, 59, 0.2);
    }
    
    /* 不同样式的高亮 */
    .NoTab-highlight-style-underline {
      background-color: transparent;
      border-bottom: 2px solid;
      box-shadow: none;
    }
    
    .NoTab-highlight-style-background {
      background-color: rgba(255, 235, 59, 0.3);
      border-bottom: none;
    }
    
    .NoTab-highlight-style-mixed {
      background-color: rgba(255, 235, 59, 0.15);
      border-bottom: 2px solid;
    }
    
    /* Tooltip styles */
    .NoTab-tooltip {
      position: absolute;
      background-color: white;
      padding: 10px;
      border-radius: 5px;
      max-width: 300px;
      z-index: 10000;
      font-size: 14px;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
      animation: fadeIn 0.3s;
    }
    
    /* Annotation indicator */
    .NoTab-annotation-indicator {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 16px;
      height: 16px;
      margin-left: 3px;
      cursor: pointer;
      font-size: 12px;
      background-color: rgba(66, 133, 244, 0.8);
      color: white;
      border-radius: 50%;
      position: relative;
      top: -5px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
    }
    
    /* 已勾选项目的样式 */
    .NoTab-checked {
      text-decoration: line-through;
      color: #888;
    }
    
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
  `;
}
