// lessTabs Background Script

// 监听插件图标的点击事件
chrome.action.onClicked.addListener((tab) => {
  // 切换侧边栏的显示状态
  chrome.sidePanel.open({ windowId: tab.windowId });
});

// 安装或更新时设置declarativeNetRequest规则
chrome.runtime.onInstalled.addListener((details) => {
  
  // 设置动态规则来移除阻止iframe加载的响应头
  chrome.declarativeNetRequest.getDynamicRules((rules) => {
    // 获取现有规则ID
    const ruleIds = rules.map((rule) => rule.id);

    // 如果存在规则，先移除
    if (ruleIds.length > 0) {
      chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: ruleIds
      }, () => {
        addNetRequestRules();
      });
    } else {
      // 直接添加新规则
      addNetRequestRules();
    }
  });

  function addNetRequestRules() {
    chrome.declarativeNetRequest.updateDynamicRules({
      addRules: [
        // 移除CSP、X-Frame-Options和Cookie响应头
        {
          id: 1,
          priority: 1,
          action: {
            type: "modifyHeaders",
            responseHeaders: [
              { header: "Content-Security-Policy", operation: "remove" },
              { header: "X-Frame-Options", operation: "remove" },
              { header: "Cookie", operation: "remove" }
            ]
          },
          condition: {
            urlFilter: "*://*/*",
            resourceTypes: ["sub_frame"]
          }
        },
        {
          id: 2,
          priority: 2,
          action: {
            type: "modifyHeaders",
            requestHeaders: [
              {
                header: "User-Agent",
                operation: "set",
                value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36"
              }
            ]
          },
          condition: {
            urlFilter: "https://www.xiaohongshu.com/*",
            resourceTypes: ["sub_frame"]
          }
        }
      ],
      removeRuleIds: []
    }, () => {
      if (chrome.runtime.lastError) {
        console.error('[NoTab Background] 更新动态规则错误:', chrome.runtime.lastError);
      }
    });
  }
});
