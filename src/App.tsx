// 桌宠根组件。
//
// 拖拽架构 v2（2026-04-30）：
//   - 拖拽过程中完全不触发 React 渲染，直接操作 DOM style
//   - wrapperRef.style.transform 和 popoverPortalOffset 同步更新，零帧延迟
//   - mouseup 时才 setPos 持久化位置（供 hit region 上报等使用）
//   - popover 通过 onDragOffset callback 拿到偏移量，直接操作自己的 style

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PetCircle, { PET_SIZE } from "./components/PetCircle";
import BubbleStack from "./components/BubbleStack";
import type { BubbleKind } from "./lib/prompts";
import { updateHitRegion } from "./hitRegions";
import "./App.css";

const RADIUS = PET_SIZE / 2;

function App() {
  const [pos, setPos] = useState(() => ({
    x: Math.max(0, window.innerWidth / 2 - PET_SIZE / 2),
    y: Math.max(0, window.innerHeight / 3 - PET_SIZE / 2),
  }));
  const [hovered, setHovered] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [waitingByBubble, setWaitingByBubble] = useState<Record<BubbleKind, boolean>>({
    research: false,
    dialog: false,
    cowork: false,
  });

  // 当前位置的 ref（事件回调里用，不触发渲染）
  const posRef = useRef(pos);
  posRef.current = pos;

  // wrapper div 的 ref，拖拽时直接操作 style
  const wrapperRef = useRef<HTMLDivElement>(null);

  // BubbleStack 里 popover 的 ref 操作函数，由子组件注册上来
  const popoverMoveRef = useRef<((dx: number, dy: number) => void) | null>(null);

  const dragRef = useRef<{ dx: number; dy: number; startX: number; startY: number } | null>(null);

  // hit region 上报（位置 commit 到 state 后才更新）
  useEffect(() => {
    updateHitRegion("pet-circle", {
      x: pos.x,
      y: pos.y,
      width: PET_SIZE,
      height: PET_SIZE,
    });
    return () => updateHitRegion("pet-circle", null);
  }, [pos.x, pos.y]);

  // 全局鼠标事件
  useEffect(() => {
    function isInsideCircle(x: number, y: number) {
      const cx = posRef.current.x + RADIUS;
      const cy = posRef.current.y + RADIUS;
      const dx = x - cx;
      const dy = y - cy;
      return dx * dx + dy * dy <= RADIUS * RADIUS;
    }

    function onMove(e: MouseEvent) {
      if (dragRef.current) {
        const x = e.clientX - dragRef.current.dx;
        const y = e.clientY - dragRef.current.dy;

        // 直接操作 DOM，零帧延迟
        if (wrapperRef.current) {
          wrapperRef.current.style.transform = `translate(${x}px, ${y}px)`;
        }
        // 通知 popover 同步移动（相对于起始位置的 delta）
        const ddx = x - dragRef.current.startX;
        const ddy = y - dragRef.current.startY;
        popoverMoveRef.current?.(ddx, ddy);
        return;
      }
      setHovered(isInsideCircle(e.clientX, e.clientY));
    }

    function onDown(e: MouseEvent) {
      if (!isInsideCircle(e.clientX, e.clientY)) return;
      dragRef.current = {
        dx: e.clientX - posRef.current.x,
        dy: e.clientY - posRef.current.y,
        startX: posRef.current.x,
        startY: posRef.current.y,
      };
      setDragging(true);
    }

    function onUp(e: MouseEvent) {
      if (!dragRef.current) return;
      const x = e.clientX - dragRef.current.dx;
      const y = e.clientY - dragRef.current.dy;
      dragRef.current = null;
      setDragging(false);
      // 拖拽结束，提交到 React state（hit region、BubbleStack petAbsPos 等）
      setPos({ x, y });
      // popover 结束漂移，归零 delta（让它回到由 petAbsPos 计算的绝对坐标）
      popoverMoveRef.current?.(0, 0);
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const handleWaitingOutputChange = useCallback(
    (kind: BubbleKind, waiting: boolean) => {
      setWaitingByBubble((prev) => {
        if (prev[kind] === waiting) return prev;
        return { ...prev, [kind]: waiting };
      });
    },
    [],
  );

  const isWaitingForOutput = useMemo(
    () => Object.values(waitingByBubble).some(Boolean),
    [waitingByBubble],
  );

  return (
    <div className="pet-root">
      <div
        ref={wrapperRef}
        className={`pet-drag-wrapper${dragging ? " is-dragging" : ""}`}
        style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}
      >
        <PetCircle
          hovered={hovered}
          blushing={isWaitingForOutput}
          dragging={dragging}
        />
        <BubbleStack
          petSize={PET_SIZE}
          petAbsPos={pos}
          onWaitingOutputChange={handleWaitingOutputChange}
          onRegisterPopoverMove={(fn) => { popoverMoveRef.current = fn; }}
        />
      </div>
    </div>
  );
}

export default App;
