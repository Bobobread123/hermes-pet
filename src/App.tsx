// 桌宠根组件。
//
// 流 A（透明窗口 + always-on-top + 鼠标穿透）已完成；
// 流 B 第一阶段（Hermes runner 端到端跑通）已完成；
// 流 B 第二阶段（三气泡 UI）正在落地。
//
// 当前形态：
//   - PetCircle 占位圆 + 鼠标穿透 hit region 上报
//   - BubbleStack 跟随桌宠左侧渲染（research / dialog / cowork 三气泡）
//
// 下一步：
//   - 角色 SVG 替换（流 C 优先级 1）
//   - 拖入文件接入（流 C）

import { useCallback, useMemo, useState } from "react";
import PetCircle, { PET_SIZE, PET_SPRITE_W, PET_WING_LEFT } from "./components/PetCircle";
import BubbleStack from "./components/BubbleStack";
import type { BubbleKind } from "./lib/prompts";
import "./App.css";

function App() {
  // 桌宠的当前位置（PetCircle 上报，BubbleStack 跟随）
  const [petPos, setPetPos] = useState({
    x: Math.max(0, window.innerWidth / 2 - PET_SIZE / 2),
    y: Math.max(0, window.innerHeight / 3 - PET_SIZE / 2),
  });
  const [waitingByBubble, setWaitingByBubble] = useState<Record<BubbleKind, boolean>>({
    research: false,
    dialog: false,
    cowork: false,
  });

  const handlePosChange = useCallback(
    (next: { x: number; y: number; size: number }) => {
      setPetPos({ x: next.x, y: next.y });
    },
    [],
  );

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

  // BubbleStack 挂在跟桌宠同步移动的 wrapper 里
  // wrapper 原点 = sprite 实际左上角（petPos.x 是 hit region 左边 = sprite_left + BODY_LEFT）
  // 这样 BubbleStack 的 stackX 从翅膀外沿起算，不会遮挡翅膀
  const petWrapperStyle = useMemo(
    () => ({
      position: "fixed" as const,
      left: petPos.x - PET_WING_LEFT,   // sprite 左上角（翅膀左边缘）
      top: petPos.y,
      width: PET_SPRITE_W,              // sprite 完整宽度（含翅膀）
      height: PET_SIZE,
      pointerEvents: "none" as const,
    }),
    [petPos.x, petPos.y],
  );

  return (
    <div className="pet-root">
      <PetCircle
        blushing={isWaitingForOutput}
        onPosChange={handlePosChange}
      />
      <div style={petWrapperStyle}>
        <BubbleStack
          petAbsPos={petPos}
          petSize={PET_SIZE}
          onWaitingOutputChange={handleWaitingOutputChange}
        />
      </div>
    </div>
  );
}

export default App;
