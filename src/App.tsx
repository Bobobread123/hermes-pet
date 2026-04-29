// 桌宠根组件。
//
// 拖拽架构（2026-04-30 重构）：
//   - pos 状态统一在 App 层持有，通过一个 wrapper div 的 transform 整体移动
//   - PetCircle 和 BubbleStack 都在这个 wrapper 内，保证同帧移动，无撕裂
//   - PetCircle 不再自己管位置，只负责渲染 + hover/blushing 状态
//   - BubbleStack 用相对于 wrapper 的偏移定位，不再依赖绝对 petPos
//   - 鼠标事件在 App 层统一监听，dragRef 记录按下时偏移量

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

  const posRef = useRef(pos);
  posRef.current = pos;

  const dragRef = useRef<{ dx: number; dy: number } | null>(null);

  // hit region 上报（整个 wrapper 矩形，包含气泡区域由 BubbleStack 自己上报）
  useEffect(() => {
    updateHitRegion("pet-circle", {
      x: pos.x,
      y: pos.y,
      width: PET_SIZE,
      height: PET_SIZE,
    });
    return () => updateHitRegion("pet-circle", null);
  }, [pos.x, pos.y]);

  // 全局鼠标事件：拖拽 + hover 判定
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
        setPos({
          x: e.clientX - dragRef.current.dx,
          y: e.clientY - dragRef.current.dy,
        });
        return;
      }
      setHovered(isInsideCircle(e.clientX, e.clientY));
    }

    function onDown(e: MouseEvent) {
      if (!isInsideCircle(e.clientX, e.clientY)) return;
      dragRef.current = {
        dx: e.clientX - posRef.current.x,
        dy: e.clientY - posRef.current.y,
      };
      setDragging(true);
    }

    function onUp() {
      dragRef.current = null;
      setDragging(false);
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
      {/*
        wrapper 整体 translate：PetCircle + BubbleStack 同帧移动，无撕裂。
        拖拽时加 is-dragging 去掉 transition，松开后 transition 回弹。
      */}
      <div
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
        />
      </div>
    </div>
  );
}

export default App;
