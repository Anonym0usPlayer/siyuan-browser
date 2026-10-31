# 用户脚本（开发版）

用户脚本功能位于 v0.1.4 之后的开发代码中，不包含在 v0.1.4 发布包内。它支持明确列出的 GM API 子集，尚不兼容所有 Tampermonkey / Greasemonkey 脚本。

## 使用

1. 在浏览器右上角「… → 用户脚本」或插件设置中打开管理器。
2. 选择本地 `.user.js` 文件，或粘贴源码；也可以点击「填入示例」。
3. 点击「检查权限与兼容性」，查看匹配网址、权限、运行时机和依赖。存在不支持项时不能安装。
4. 点击「安装（默认停用）」，再打开对应脚本的开关，刷新目标网页。
5. 「最近运行记录」显示执行完成或错误；脚本注册的菜单出现在当前网页的「…」菜单中。

相同 `@namespace` 和 `@name` 视为更新：替换代码、重新下载依赖、保留独立存储，并恢复停用状态。版本号不用于自动更新。启停、更新、清除数据后都应刷新网页。停用立即撤销后续 GM 调用与菜单权限；已执行的 DOM 修改、定时器、网页请求只能通过重新加载网页停止或清除。

只安装可信脚本。脚本能读取和修改匹配网页内容，也能使用网页本身允许的网络能力。隔离执行不等于禁止脚本访问网页数据。

## 元数据与运行范围

源码必须以 `// ==UserScript==` 元数据块开头，包含 `@name`、至少一个 `@match`、显式 `@grant` 和 `@noframes`。支持 `@namespace`、`@version`、`@description`、`@exclude-match`、`@require`。

- 仅匹配 HTTP(S) 顶层网页，不在 iframe、思源宿主、主页或离线归档中执行。
- `@match` 使用 `https://example.com/*`、`*://*.example.com/*` 等模式；路径含查询参数，不含 fragment。`*` 协议只代表 HTTP/HTTPS。显式端口、IPv6 主机、`<all_urls>`、正则 `@include` 不支持。
- `@run-at document-end`（默认）或 `document-idle`；不支持 `document-start`。每次完整文档加载执行一次，SPA 路由变化不重新注入。
- 有权限的脚本各自在独立执行世界中运行，共享网页 DOM，不能直接访问网页 JS 全局变量；不提供 `unsafeWindow`。宿主不向脚本暴露 Node 或 Electron。
- `@grant none` 在网页执行世界中运行，无 GM API，不能与其他 grant 混用。
- 未支持的行为元数据和权限会明确阻止安装。作者、许可证、主页、图标及更新地址等信息字段可保留，但不会自动获取图标或更新脚本。

## 支持的 API

| API | 行为 |
| --- | --- |
| `GM.getValue(key, defaultValue)` | Promise，读取本脚本 JSON 数据 |
| `GM.setValue(key, value)` | Promise，保存 JSON 数据 |
| `GM.deleteValue(key)` / `GM.listValues()` | Promise，删除键或列出键 |
| `GM_addStyle(css)` | 插入 style，返回 DOM 元素 |
| `GM_info` | 当前脚本名称、命名空间、版本、匹配范围、权限等信息；不是完整 Tampermonkey 对象 |
| `GM.openInTab(url, {active: false})` | Promise，在插件中打开 HTTP(S) 标签；不返回可控制的标签句柄 |
| `GM_registerMenuCommand(label, callback)` | 注册当前文档菜单并返回数字 ID；每脚本最多 20 项，不支持注销或快捷键参数 |

每项 API 需要单独声明对应 `@grant`。不支持同步 `GM_getValue` / `GM_setValue`、跨域 `GM_xmlhttpRequest`、`@connect`、`@resource`、下载/通知/Cookie API、浏览器扩展 API 或自动更新。

`@require` 最多 8 个公开 HTTPS 地址，安装时下载并固定内容与 SHA-256，执行时不重新下载。依赖按声明顺序在脚本之前执行，与脚本具有相同权限；查看源码可看到依赖地址和哈希。下载拒绝私网地址、认证信息、自定义端口和不安全重定向；每项最大 1 MiB。下载失败时保留原脚本。

脚本和存储按工作空间隔离，位于 `data/storage/petal/siyuan-browser/userscripts.json`。单脚本源码最大 1 MiB，最多 100 个脚本；每个存储值最大 256 KiB、每脚本最多 1000 个键及 1 MiB，总文件最大 32 MiB。卸载会删除该脚本的数据；「清除脚本数据」保留源码。不要在运行期间手动修改文件，也不要将敏感凭据存入脚本数据。此功能没有独立的跨设备同步与冲突合并机制。

## 示例

```javascript
// ==UserScript==
// @name Example page style
// @namespace my-scripts
// @version 1.0
// @match https://example.com/*
// @noframes
// @grant GM_addStyle
// @grant GM.getValue
// @grant GM.setValue
// @run-at document-end
// ==/UserScript==
const visits = await GM.getValue("visits", 0);
await GM.setValue("visits", visits + 1);
GM_addStyle("h1 { color: #4263eb; }");
```

当前脚本包装为异步函数，允许示例中的顶层 `await`。脚本之间没有可依赖的执行顺序。兼容性检查验证元数据，不保证脚本业务逻辑或第三方依赖正确；运行错误应查看管理器记录。

## 验证边界

macOS 思源 3.8.9 已原生验证导入、默认停用、启用、DOM/样式修改、跨刷新 GM 存储、菜单回调、停用后刷新不执行、卸载及管理器运行记录。自动测试另覆盖匹配规则、权限/导航撤销、存储并发与配额、损坏文件保护、依赖失败保留旧版本和隔离世界分派。Windows/Linux、旧版思源宿主、第三方脚本兼容矩阵及跨窗口交互仍需原生验收。
