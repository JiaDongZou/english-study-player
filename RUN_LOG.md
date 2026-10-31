# 开发与验证记录

日期：2026-10-13

## 实现

采用本地 HTML / CSS / JavaScript 应用，无运行依赖，无服务器，无虚拟环境，无安装和下载。使用浏览器原生视频解码，文件通过 Object URL 在本机播放。

- 左右键分别快退 / 快进，默认 10 秒，秒数实时设置并独立保存。
- 支持小数秒、长按连跳、起止边界限制，跳转保持播放 / 暂停状态。
- 自定义控制栏放在视频外；全屏使用整个播放器容器，避免原生视频控件覆盖字幕。
- 支持外置 UTF-8 SRT / VTT、多行字幕、偏移、字号及播放速度。
- 数字编辑时不抢占方向键，Enter 返回播放器焦点。

## 验证命令

```powershell
node --check .\app.js
node .\verify.cjs
```

语法检查通过；Playwright 使用现有 Chrome，无下载新浏览器。测试中通过 Chrome MediaRecorder 生成 23.938433 秒真实 MP4，并从本地文件选择器加载、解码和跳转。测试样片为合成画面，用于功能验证，不是用户的视频。

全部通过：实际 MP4 解码、默认左右 10 秒、独立小数设置、连续跳转累加、时间边界、暂停与播放保持、SRT / VTT 解析和显示、字幕时间偏移、普通与全屏布局不重叠、设置持久化、720px 布局无横向溢出、无 JavaScript 页面错误。

证据：verification/result.json、verification/playing.png、verification/fullscreen.png、verification/sample.mp4。已人工查看普通与全屏截图。

## 使用与限制

双击启动播放器.cmd，或在 Edge / Chrome 打开 index.html。运行时不需要 Node 或 Playwright。

尚未测试用户实际视频及其他编码。浏览器支持范围之外的 MP4 编码可能无法播放；不支持 MP4 内封装的可选字幕轨。快进提示位于画面外，画面中不显示浮层。全屏下调整跳转秒数需先按 F 或 Esc 退出全屏。
