/**
 * 文件：src/components/DesktopCaptureOverlay.tsx
 * 职责：截图框选覆盖层（每个显示器一个透明全屏窗口）。负责拖拽框选区域、
 *       绘制四向遮罩、ESC 取消，并通过 onConfirm 回传选区坐标；跨屏时重设
 *       截图光标并抢焦当前窗口。
 * 依赖：react、@/components/ui/button、window.desktopHost
 * 导出：默认 DesktopCaptureOverlay
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

type SelectionRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type Props = {
  mode: 'single' | 'long' | 'quick';
  onCancel: () => void;
  onConfirm: (selection: SelectionRect) => void;
};

/** 规整选区：坐标取整，宽高至少为 1px，避免零尺寸选区。 */
function clampSelection(selection: SelectionRect): SelectionRect {
  return {
    x: Math.round(selection.x),
    y: Math.round(selection.y),
    width: Math.max(1, Math.round(selection.width)),
    height: Math.max(1, Math.round(selection.height)),
  };
}

const DesktopCaptureOverlay = ({ mode, onCancel, onConfirm }: Props) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [selection, setSelection] = useState<SelectionRect | null>(null);
  // Tracks whether this window has already re-asserted its cursor for the
  // current pointer visit. Reset on mouseleave so re-entering re-activates it.
  const cursorActiveRef = useRef(false);

  // Re-assert the screenshot cursor + focus this overlay window. On macOS the
  // cursor only sticks for the key window, so crossing screens requires the
  // entered window to become key again — otherwise it reverts to the default arrow.
  function ensureCursor() {
    if (cursorActiveRef.current) return;
    cursorActiveRef.current = true;
    void window.desktopHost?.activateOverlay();
  }

  const selectionStyle = useMemo(() => {
    if (!selection) {
      return { display: 'none' };
    }

    return {
      left: `${selection.x}px`,
      top: `${selection.y}px`,
      width: `${selection.width}px`,
      height: `${selection.height}px`,
    };
  }, [selection]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  function getRelativePoint(clientX: number, clientY: number) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) {
      return null;
    }

    const x = Math.min(Math.max(clientX - rect.left, 0), rect.width);
    const y = Math.min(Math.max(clientY - rect.top, 0), rect.height);
    return { x, y };
  }

  /** 由拖拽起点与当前点构造矩形选区（取最小/最大边界，支持任意方向拖拽）。 */
  function buildSelection(currentX: number, currentY: number) {
    if (!dragStart) {
      return null;
    }

    return clampSelection({
      x: Math.min(dragStart.x, currentX),
      y: Math.min(dragStart.y, currentY),
      width: Math.abs(currentX - dragStart.x),
      height: Math.abs(currentY - dragStart.y),
    });
  }

  return (
    <div
      className="relative flex h-screen w-screen flex-col cursor-crosshair bg-transparent text-white select-none"
      onMouseEnter={ensureCursor}
      onMouseMove={ensureCursor}
      onMouseLeave={() => {
        cursorActiveRef.current = false;
      }}
    >
      {/* Instruction card */}
      <div className="absolute left-4 top-4 z-20 flex items-start gap-3.5 rounded-2xl bg-black/62 px-4 py-3.5 text-sm shadow-2xl backdrop-blur-xl ring-1 ring-white/10">
        <div className="space-y-1">
          <div className="text-[13px] font-semibold tracking-tight">
            {mode === 'quick' ? '拖拽框选要复制的区域' : mode === 'long' ? '拖拽框选长截图采集区域' : '拖拽框选要识别的区域'}
          </div>
          <div className="text-[12px] text-white/55">
            {mode === 'quick'
              ? '松开鼠标后将自动复制到剪贴板'
              : mode === 'long'
                ? '框选后滚动目标内容，应用将自动拼接长图并识别'
                : '松开鼠标后将自动继续'}
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 shrink-0 cursor-pointer rounded-xl border border-white/15 bg-white/8 text-[12px] font-medium text-white/85 hover:bg-white/15 hover:text-white"
          data-cursor-pointer
          onClick={onCancel}
        >
          取消
        </Button>
      </div>

      {/* Drag-to-select canvas */}
      <div
        ref={containerRef}
        className="relative flex-1 cursor-crosshair overflow-hidden"
        onMouseDown={(event) => {
          const point = getRelativePoint(event.clientX, event.clientY);
          if (!point) return;
          setDragStart(point);
          setSelection({ x: point.x, y: point.y, width: 1, height: 1 });
        }}
        onMouseMove={(event) => {
          const point = getRelativePoint(event.clientX, event.clientY);
          if (!point || !dragStart) return;
          const nextSelection = buildSelection(point.x, point.y);
          if (nextSelection) setSelection(nextSelection);
        }}
        onMouseUp={(event) => {
          const point = getRelativePoint(event.clientX, event.clientY);
          if (!point) {
            setDragStart(null);
            return;
          }
          const nextSelection = buildSelection(point.x, point.y);
          setDragStart(null);
          setSelection(nextSelection);
          if (nextSelection && nextSelection.width > 4 && nextSelection.height > 4) {
            onConfirm(nextSelection);
          }
        }}
        onMouseLeave={() => {
          if (!dragStart) return;
          setDragStart(null);
        }}
      >
        {/* Dim overlay around selection, selection area stays transparent */}
        {selection && (
          <>
            {/* Top dim */}
            <div
              className="pointer-events-none absolute left-0 right-0 top-0 bg-black/40"
              style={{ height: selection.y }}
            />
            {/* Bottom dim */}
            <div
              className="pointer-events-none absolute left-0 right-0 bottom-0 bg-black/40"
              style={{ top: selection.y + selection.height }}
            />
            {/* Left dim */}
            <div
              className="pointer-events-none absolute bg-black/40"
              style={{
                top: selection.y,
                left: 0,
                width: selection.x,
                height: selection.height,
              }}
            />
            {/* Right dim */}
            <div
              className="pointer-events-none absolute bg-black/40"
              style={{
                top: selection.y,
                left: selection.x + selection.width,
                height: selection.height,
                right: 0,
              }}
            />
            {/* Selection border */}
            <div
              className="pointer-events-none absolute border border-foreground/15"
              style={selectionStyle}
            />
          </>
        )}
      </div>
    </div>
  );
};

export default DesktopCaptureOverlay;
