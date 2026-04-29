// PetCircle —— 桌宠占位圆的纯渲染组件。
//
// 2026-04-30 重构：位置管理已上移到 App 层（统一 wrapper translate）。
// 本组件只负责 SVG 渲染 + 样式状态，不再持有 pos state，不再监听鼠标事件。
//
// Props:
//   hovered  — 鼠标在圆内（由 App 判定传入）
//   blushing — 等待 Hermes 输出时显示腮红
//   dragging — 拖拽中（去掉 transition）

import "./PetCircle.css";

const SIZE = 100;
const SCALE = SIZE / 200;

function s(value: number): number {
  return value * SCALE;
}

interface PetCircleProps {
  hovered?: boolean;
  blushing?: boolean;
  dragging?: boolean;
}

export const PET_SIZE = SIZE;

export default function PetCircle({
  hovered = false,
  blushing = false,
  dragging = false,
}: PetCircleProps) {
  return (
    <div
      className={`pet-circle${hovered ? " is-hovered" : ""}${blushing ? " is-blushing" : ""}${dragging ? " is-dragging" : ""}`}
      style={{ width: SIZE, height: SIZE }}
    >
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <defs>
          <radialGradient id="petBody" cx="50%" cy="40%" r="60%">
            <stop offset="0%" stopColor="#FFF8EC" />
            <stop offset="100%" stopColor="#F5E6D3" />
          </radialGradient>
        </defs>
        <circle cx={SIZE / 2} cy={SIZE / 2} r={SIZE / 2 - s(4)} fill="url(#petBody)" stroke="#D4B896" strokeWidth={s(2)} />
        <circle cx={SIZE / 2 - s(28)} cy={SIZE / 2 - s(6)} r={hovered ? s(4) : s(8)} fill="#2B2B2B" />
        <circle cx={SIZE / 2 + s(28)} cy={SIZE / 2 - s(6)} r={hovered ? s(4) : s(8)} fill="#2B2B2B" />
        <circle
          className="pet-cheek"
          cx={SIZE / 2 - s(42)}
          cy={SIZE / 2 + s(16)}
          r={s(15)}
          fill="#F5A0B0"
          opacity={blushing ? 0.72 : 0}
        />
        <circle
          className="pet-cheek"
          cx={SIZE / 2 + s(42)}
          cy={SIZE / 2 + s(16)}
          r={s(15)}
          fill="#F5A0B0"
          opacity={blushing ? 0.72 : 0}
        />
        <path
          d={
            hovered
              ? `M ${SIZE / 2 - s(18)} ${SIZE / 2 + s(22)} Q ${SIZE / 2} ${SIZE / 2 + s(38)} ${SIZE / 2 + s(18)} ${SIZE / 2 + s(22)}`
              : `M ${SIZE / 2 - s(18)} ${SIZE / 2 + s(28)} Q ${SIZE / 2} ${SIZE / 2 + s(32)} ${SIZE / 2 + s(18)} ${SIZE / 2 + s(28)}`
          }
          fill="none"
          stroke="#2B2B2B"
          strokeWidth={s(3)}
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
