# 关键业务流程

> 本文件由 `README.md` 第 6 节拆出，描述单次截图识别、长截图、OCR 离线识别与主题切换四条核心流程的实现链路。

## 6.1 单次截图识别

`startScreenCapture('single')` → 权限校验 → `screen.getAllDisplays()` + `desktopCapturer` 截取所有显示器并为每个显示器创建 overlay 窗口 → 用户在 overlay 拖拽框选 → `completeScreenCapture` 定位显示器并裁剪（`cropScreenshot`）→ `finalizeSingleCapture` → `recognizeTextFromImage`（写临时 PNG → 调用 `ocr.swift`）→ 结果写入 `hostState` 并广播 → 弹出 result 窗口展示 / 编辑。

## 6.2 长截图

首段框选后进入 `longCaptureSession`（默认 `auto` 模式，按内容变化自动采集；可切 `manual` 手动）。每段独立 OCR 并累积文本；`finishLongCapture` 时 `stitchLongImage` 在 `stitcher` 隐藏窗口内拼接全图 + `mergeLongCaptureText` 按 8 行重叠去重合并，最后对全图再做一次 OCR 取更优结果。长图可保存为文件或复制图片到剪贴板。

## 6.3 OCR 离线识别

主进程将 data URL 解码写入临时 PNG（`/tmp/screen-ocr-{timestamp}.png`），必要时先降采样至 2000px 内；`spawn` 调用打包内置的 `screen-ocr-engine.bin`（三路回退：打包内置二进制 → `/tmp` 缓存 → 即时编译），脚本经 `CGImageSource → VNImageRequestHandler(url) → NSImage` 三路回退确保读取；输出 `{"text":"..."}` JSON，主进程解析后于 `finally` 中清理临时文件。

## 6.4 主题切换

`useThemeStore` 持久化 `themeId` → `applyTheme` 将单一 hue 推导的全套 OKLCH 变量写入独立 `<style id="dynamic-theme-vars">`（覆盖 `default.css` 的静态 `:root` / `.dark`）→ `storage` 事件驱动其它窗口 `_sync`，实现多窗口主题一致。
