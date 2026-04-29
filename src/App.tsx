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
import PetCircle, { PET_SIZE } from "./components/PetCircle";
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

  return (
    <div className="pet-root">
      <PetCircle
        blushing={isWaitingForOutput}
        onPosChange={handlePosChange}
      />
      <BubbleStack
        petPos={petPos}
        petSize={PET_SIZE}
        onWaitingOutputChange={handleWaitingOutputChange}
      />
    </div>
  );
}

export default App;
