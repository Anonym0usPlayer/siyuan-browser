# 浏览器扩展与用户脚本方案评估

调研日期：2026-10-31。基线：v0.1.3（`04d5ced`）。对应 [Issue #2](https://github.com/fu1fan/siyuan-browser/issues/2)：希望安装新标签页扩展和油猴扩展。

## 建议

**优先做范围明确的用户脚本支持，主页需求沿用自定义主页；将完整扩展兼容列为独立实验。** 这是针对当前插件规模和这两个需求的工程取舍，不是说 Electron 完全不能运行扩展，也不是说自建脚本引擎很便宜。

首版应称“用户脚本（兼容部分 GM API）”，不能称“支持 Tampermonkey”或“兼容所有油猴脚本”。若用户真正要求的是直接安装现成 Tampermonkey／Violentmonkey、导入原有脚本后原样运行，应先做扩展兼容原型；一个只支持 DOM 修改的小引擎不能替代该需求。

## 已确认的环境与代码边界

本机安装包元数据为 SiYuan **3.8.9**，Electron Framework **44.10.0**。依据分别为 `/Applications/SiYuan.app/Contents/Info.plist` 的 `CFBundleShortVersionString`，以及 `Contents/Frameworks/Electron Framework.framework/Versions/A/Resources/Info.plist` 的 `CFBundleVersion`。这是打包框架元数据，未读取运行中进程的 `process.versions`；也没有把项目依赖声明当作实际运行时版本。插件仍声明最低思源 3.8.6，后续功能必须做能力检测或提高最低版本，不能假定所有用户都运行该框架。

代码检查发现：

- [adapter.ts](../../src/adapter.ts) 通过 `@electron/remote.require` 加载主进程模块，创建独立 `persist:siyuan-browser-*` 会话；guest 保持 `sandbox=yes`、`contextIsolation=yes`、`nodeIntegration=no`。因此，原生扩展加载或脚本桥接**原则上可以在插件内实现**，并非必然修改思源源码。
- [main.ts](../../src/main.ts) 已安装会话级 `onBeforeRequest`，执行广告过滤、内核端口拦截和协议限制；现有导航/请求白名单不接受 `chrome-extension:`。同会话新建的 WebContents 目前按网页 guest 管理，扩展后台页、弹窗和配置页需要单独分类与生命周期管理。
- [preload.ts](../../src/preload.ts) 只有复制功能，没有用户脚本管理、执行沙箱或 GM RPC。现有 [resource](../../src/main.ts) 是图片/归档用途的受限资源获取，不等于 `GM_xmlhttpRequest`。
- [core.ts](../../src/core.ts) 与 [index.ts](../../src/index.ts) 已有自定义 HTTP(S) 主页配置，打开浏览器会使用 `config.home`；内置主页实际由思源 renderer 渲染。新标签页网页地址已可满足一部分需求，但不能替代扩展的书签、同步、后台和浏览器 API。

## 三条路线的实际差别

| 路线 | 能获得什么 | 主要投入与限制 | 适合当前任务吗 |
| --- | --- | --- | --- |
| 只用 Electron 原生扩展加载 | 在插件持久会话加载解压扩展，可能运行简单 content-script 扩展 | 不是商店安装器；标签管理、扩展按钮/弹窗、新标签页接管等需要宿主补齐；具体扩展逐个验证 | 可作最小能力探针，不宜作为“支持 Edge 扩展”的交付 |
| Electron + 扩展兼容层 | 复用现有扩展的管理界面、脚本调度和 GM 实现，生态覆盖上限较高 | 需要浏览器级适配、版本兼容、权限与生命周期审计；仍有未实现 API | 当目标必须运行完整现成扩展时值得投入 |
| 插件自建用户脚本运行器 | 接入现有 guest 和插件 UI，能力边界由本项目控制；按需支持常用脚本 | 本项目承担元数据、沙箱、GM API、存储、多标签同步、依赖下载、更新和错误诊断；兼容范围小于成熟管理器 | 最适合先交付有边界的页面增强能力 |

[Electron 44.10.0 的版本化文档](https://github.com/electron/electron/blob/v44.10.0/docs/api/extensions.md) 只承诺部分 Chrome 扩展 API，要求解压目录和持久会话，每次启动重新加载；没有承诺任意商店扩展兼容。`chrome.tabs` 仅覆盖有限能力。不要把新版 Chromium 版本号等同于完整 Chrome 扩展宿主。

[electron-chrome-extensions](https://github.com/samuelmaddock/electron-browser-shell/blob/3817c4236f8511156086eb4541f364679b277b40/packages/electron-chrome-extensions/README.md) 提供 tabs/windows、action、部分菜单和权限能力，以及 `getURLOverrides()`。其接口允许自定义标签创建/切换，因此可映射到思源标签，而不是只能新建独立浏览器窗口。但本项目还须把 guest、思源 tab、所属 BrowserWindow、关闭/恢复/多窗口状态准确关联，并打包它的 preload。

上游自述最低 Electron 35.0.0-beta.8，本次检查的源码包版本为 4.10.0；这只是最低依赖门槛，不是对思源集成的兼容证明。它的功能表仍有缺项，`permissions.remove` 在[实际实现](https://github.com/samuelmaddock/electron-browser-shell/blob/3817c4236f8511156086eb4541f364679b277b40/packages/electron-chrome-extensions/src/browser/api/permissions.ts)中仍是 TODO 并返回成功，不能直接当作可靠的撤权机制使用。

### 扩展路线的两个关键适配点

1. **请求拦截不能简单叠加。** Electron 官方说明其 `webRequest` 优先于扩展侧 `chrome.webRequest`；兼容层也指出原生监听会阻止扩展监听。本项目当前正依赖原生监听保护思源内核和广告过滤，因此“油猴已加载”不代表跨域请求、脚本安装等正常。需要验证冲突并设计单一受控调度方案，不能为扩展删除现有保护。[Electron 文档](https://github.com/electron/electron/blob/v44.10.0/docs/api/extensions.md#chromewebrequest)
2. **权限范围必须局限于浏览器会话。** 不应照搬示例的 `defaultSession`。只登记插件 guest；不要把思源编辑器、MHTML 归档会话或其他插件窗口作为扩展可访问的 tabs。`chrome-extension:` 放行应限已加载扩展 ID，卸载后撤销。扩展自身后台页/弹窗不应套用普通网页 guest 的所有处理。

## Tampermonkey 与 Violentmonkey：不能只看“能加载”

| 对象 | 本次确认的版本/形态 | 关键依赖 | 当前判断 |
| --- | --- | --- | --- |
| Tampermonkey Chromium/Edge 正式版 | 官网更新日志最新公告 5.5.1（2026-10-01）；官网说明 Chrome/Edge 版为 MV3 | 官方 FAQ 明确要求 `userScripts` 授权；还涉及 tabs、webNavigation、cookies、菜单、下载等 | 原生 Electron／兼容层均没有给出满足全部依赖的保证；不能直接承诺可用 |
| Tampermonkey 官方下载包 | 本次官方 `tampermonkey_stable.crx` 实际 manifest 为 **5.4.1/MV3**，与公告有差异 | 实测 manifest 含 service worker、userScripts、offscreen、declarativeNetRequestWithHostAccess、scripting 等 | 只静态解包，未安装/执行；不能拿该包声称已验证最新 5.5.1 |
| Violentmonkey | GitHub 最新正式发布 **v2.50.0**（2026-10-26 UTC），同时提供 MV2 和 MV3 构建 | MV3 构建声明 Chrome ≥135，service worker、userScripts、offscreen、DNR、webNavigation、identity、alarms；MV2 使用后台脚本及 webRequestBlocking | 不应再简单称其“只有 MV2”；MV3 依赖缺口须实测，MV2 可作为兼容原型对照，不能以固定旧模式替代长期维护 |

版本依据：[Tampermonkey 更新日志](https://www.tampermonkey.net/changelog.php)、[官方版本表](https://www.tampermonkey.net/faq.php?q=Q406)、[执行脚本权限说明](https://www.tampermonkey.net/faq.php?q=Q209)、[官方 CRX](https://www.tampermonkey.net/crx/tampermonkey_stable.crx)、[Violentmonkey v2.50.0 发布](https://github.com/violentmonkey/violentmonkey/releases/tag/v2.50.0)、[该版本 MV3 manifest 生成逻辑](https://github.com/violentmonkey/violentmonkey/blob/v2.50.0/scripts/manifest-helper.js)。

Tampermonkey 下载包 SHA-256：`a124e3189ecc0981ce79ef182dd3897a75fe22fc7bf0828e9d293ad7122d3d4d`。静态 manifest 留在忽略目录 `.test-runtime/extensions-research/tampermonkey-manifest.json`。商店页面本次没有返回可核实的版本信息，因此以公告和实取包分别记录。

特别注意：Electron 44.10.0 文档未列入 `userScripts`、`offscreen`、DNR 的支持承诺；兼容层功能表也未承诺补齐它们。**“未承诺”不是运行时证明 API 必然不存在**，但足以否定“加个加载按钮就能可靠支持最新油猴”的实施假设。Chrome 的 `userScripts` 有独立权限与用户开关，不能把 `scripting.executeScript` 当成等价替代。[Chrome 官方说明](https://developer.chrome.com/docs/extensions/reference/api/userScripts)

## 建议的首版用户脚本范围

以下是实施建议，当前仓库尚未实现。安装时应检查元数据和 grant，发现未支持能力时明确阻止启用并解释，不能静默忽略后宣称兼容。

| 能力 | 首版建议 | 后续成本/注意事项 |
| --- | --- | --- |
| 导入 `.user.js`、查看源码、启停、卸载、每页执行日志 | 支持；本地导入和手动更新优先 | 需要稳定脚本 ID、版本/来源记录、卸载是否保留数据选项 |
| `@name/@namespace/@version`、HTTP(S) `@match/@exclude-match` | 支持；有边界的匹配语法 | 不能对 URL 做粗糙字符串前缀匹配；端口、子域、编码、重定向均要测试 |
| `@include/@exclude` 正则、`@unwrap` | 暂不支持 | 避免首版叠加正则语义和任意全局作用域要求 |
| `@run-at document-end/document-idle` | 支持；每个新文档执行一次 | 缺省策略须明确；导航取消和迟到注入要丢弃 |
| `@run-at document-start/document-body` | 第二阶段，首版显式拒绝 | 需要 preload 时序、预缓存脚本/依赖和早期执行验证，不能在 `did-finish-load` 后冒充 start |
| `@require` | 支持受限 HTTPS 依赖：安装时下载、缓存、固定内容哈希，按声明顺序执行 | 更新要重新展示依赖变化；下载失败则整组不启用，不在页面运行时悄悄拉取最新版 |
| `@resource`、GM resource API | 第二阶段 | MIME、大小、文本/二进制转换、对象 URL 生命周期都要处理 |
| `@grant none` | 支持独立的 page-world 无特权模式 | 可修改网页 JS 全局，也可被网页干扰；绝不暴露宿主 GM RPC 或 Node 能力 |
| `GM_info`、`GM_addStyle` | 支持 | GM 信息只含该脚本必要元数据，样式操作遵循页面生命周期 |
| `GM.getValue/setValue/deleteValue/listValues` | 支持异步版本 | 按工作空间+脚本 ID 存储、限制配额、原子落盘；并发写入由主进程序列化，Promise 在持久化成功后才完成 |
| 旧式同步 `GM_getValue/GM_setValue` | 第二阶段 | 不能简单改成 Promise；同步读需要注入前快照，写后读一致性、多标签变更传播和失败反馈需要另做语义设计 |
| `GM_registerMenuCommand`、`GM_openInTab` | 支持有限形式 | 菜单归属当前脚本/guest，导航时清理；新标签只能 HTTP(S)，经插件现有路由打开 |
| `GM_xmlhttpRequest` / `GM.xmlHttpRequest`、`@connect` | 第二阶段；首版不支持跨域特权请求 | 涉及认证/cookie、重定向、响应类型、取消/超时、headers 和进度回调，普通 fetch 包装无法等价替代 |
| `unsafeWindow`、共享网页对象的特权脚本 | 首版不支持 | 隔离世界与主世界之间对象/函数语义复杂，不应借此把特权接口放进页面全局 |
| iframe | 首版只支持主框架，要求显式 `@noframes`；否则提示兼容限制并禁止自动启用 | 后续按 frame URL/身份独立匹配，覆盖跨域 iframe、about:blank/srcdoc 和 frame 销毁，不为此打开 Node 集成 |
| SPA | 文档内保留脚本运行；不因每次路由变化自动重复注入 | DOM 型脚本可自行用 MutationObserver；首次不匹配后路由变为匹配、专用 URL-change API 属后续功能 |
| 自动更新、云同步、GM_download/GM_cookie、浏览器请求改写 | 首版不支持 | 需要独立的下载/更新来源校验、权限变更、撤销与迁移设计 |

因此，首版能覆盖页面样式、DOM 增强和轻量本地偏好；大量使用同步 GM 存储、跨域 API、早期 hook 或跨域 iframe 的现成脚本暂时不兼容。应先拿用户实际需要的代表脚本验证覆盖面，再决定是否继续扩大引擎。元数据语义参考 [Violentmonkey 文档](https://violentmonkey.github.io/api/metadata-block/)，`GM_xmlhttpRequest` 的真实接口面参考 [Tampermonkey 文档](https://www.tampermonkey.net/documentation.php?q=GM_xmlhttpRequest)。

## 实现路径与不能省略的成本

1. **脚本管理与执行分离。** renderer 只负责可信管理 UI；脚本目录、依赖快照、grant 和持久化由主进程模块管理。每次导航根据已确认的 guest/frame URL 发放执行描述，禁用、导航和插件卸载时使旧请求失效。
2. **不在思源 renderer 或有特权的 preload 全局直接 eval 用户代码。** 有 GM grant 的脚本各自运行于独立 isolated world，避开 Electron preload world 999，避免不同脚本共享特权全局；每个脚本的窄接口可由 `contextBridge.exposeInIsolatedWorld` 建立，但须先验证当前宿主能力与跨 world 行为。RPC 权限绑定实际 sender/frame、由可信桥固定的脚本身份和导航代次，不能相信调用方传入的 ID 或只靠可伪造 DOM 事件。`@grant none` 单独在 page world 运行，没有该桥。[Electron 44.10.0 contextBridge](https://github.com/electron/electron/blob/v44.10.0/docs/api/context-bridge.md)
3. **时序要实测。** 主进程 `executeJavaScript` 会等待加载结束；不能拿它实现严格 document-start。下一阶段需要在 sandboxed preload 内用 frame API，并预加载脚本和依赖。Electron 的 sandbox 不等于用户脚本授权管理，preload 仍拥有 IPC 等能力，须阻止泄漏。[执行时序](https://www.electronjs.org/docs/latest/api/web-contents#contentsexecutejavascriptcode-usergesture)、[sandbox 说明](https://www.electronjs.org/docs/latest/tutorial/sandbox)
4. **跨域请求是完整子系统。** 如增加 GM 请求，要按 `@connect` 和用户授权检查目标及每次重定向，使用浏览器插件会话而非思源默认会话，保护本机内核与私网目标；不得暴露通用 Node 网络/文件访问。定义 cookies、anonymous、响应大小、超时和取消语义，并做错误回调兼容测试。脚本能修改页面 DOM 不意味着它已获准任意主进程请求。
5. **测试范围由语义决定。** 至少验证同名不同 namespace 的数据隔离、多标签并发、重载持久化、卸载清理、网页伪造 RPC、导航后迟到回调、CSP 页面、依赖失败和不支持 grant。随后用实际脚本形成逐项兼容清单，不以一个 demo 运行证明“油猴兼容”。

## 扩展原型什么时候值得转正

如果实际脚本集大多落在上述首版之外，继续自建会逐步变成维护一个脚本管理器。此时扩展兼容层可能比重新实现所有 GM 语义更划算，应做下列独立原型再决定：

1. 在插件持久会话加载最小 MV2/MV3 扩展，验证 content scripts、后台生命周期、storage、`userScripts`、offscreen、DNR 的实际可用性；记录宿主版本与失败 API。
2. 接入兼容层，映射一个新标签页扩展的创建/切换/关闭与 newtab override，同时保留内置主页作为卸载后的回退。确认所有扩展 tabs 均不包含思源编辑器。
3. 分别测试 Tampermonkey 的确切最新安装包、Violentmonkey v2.50.0 MV3 与 MV2 对照：安装脚本、document-start、同步/异步 GM 存储、跨域带 cookie 请求、iframe、SPA、菜单、重启恢复和撤权；保留广告过滤及内核访问保护。
4. 只有在正常插件加载/卸载期间可以初始化和彻底清理，且不要求修改宿主启动参数、禁用 sandbox 或控制思源全局 session 时，才作为插件功能提供。若必须改宿主，应明确变为宿主协作项目。

本次完成的是源码和官方资料调研、安装包元数据确认及 Tampermonkey manifest 静态读取。没有安装任何扩展，没有运行兼容原型，也没有修改产品代码。以上选择是基于已发现接口和架构约束的建议，不是已经得到运行时兼容验证的结论。
