# 发布指南

## 首次发布与更新

1. 同步 `package.json`、锁文件与 `plugin.json` 中的版本，更新 `CHANGELOG.md`。
2. 检查 README 的能力和验证范围，真实截图不应包含私人笔记、登录信息或未授权内容。
3. 运行 `npm ci`、`npm run typecheck`、`npm test`、`npm run build`、`npm run verify:package`。
4. 提交到 `main`，确认 GitHub Actions 的 CI 通过，再创建与插件版本一致的 `v<version>` 标签。
5. 创建正式 GitHub Release，上传名为 `package.zip` 的附件，设为 Latest。发布说明只包含当前版本变化和限制。
6. 下载线上附件，与本地 ZIP 的 SHA-256 和文件内容核对。README 截图随包发布，以支持离线显示。

首次上架时 Fork [siyuan-note/bazaar](https://github.com/siyuan-note/bazaar)，从最新上游 `main` 新建分支，在 `plugins.txt` 中只增加 `fu1fan/siyuan-browser`，向上游 `main` 提交 PR。不要同时修改其他插件、索引或生成文件。

检查 PR Check 结果，有问题时修复同一个 PR 和插件 Release。PR 合并与集市索引更新由思源维护者处理；创建 PR 不等于已经上架。后续只需递增版本并更新 Release，无需新提交上架 PR。

规范依据：[思源插件示例](https://github.com/siyuan-note/plugin-sample/blob/main/README.zh-CN.md)、[集市提交说明](https://github.com/siyuan-note/bazaar/blob/main/README.zh-CN.md)。

## 发布包

`package.zip` 根目录直接包含 `plugin.json`、`index.js`、`index.css`、`copy-preload.cjs`、唯一的 `desktop-*.cjs`、`i18n/`、README、协议、预览图和文档截图。

`npm run verify:package` 检查根目录文件、版本一致、包与 dist 内容一致、README 本地链接、图片大小和排除私有运行数据。打包使用系统 `zip`，验证使用 `unzip`；CI 在 Ubuntu 与 Node.js 22 下执行，不代表 Windows/Linux 桌面验收。

## 日常工作区部署

遵循本地 `AGENTS.md`，更新前将现有插件及配置备份到忽略的 `.test-runtime/`。安装时保留 `config.json`、浏览记录、工作空间笔记、资源和其他插件。文件一致与启用状态只是部署证据，重新加载后的实际界面交互单独记录。
