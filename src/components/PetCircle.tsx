// PetCircle — 像素角色 + 动画状态机
//
// 动画清单（按 UI-UX-Style.md）:
//   breathing  : 微呼吸，translateY ±1px，2.5s 循环，始终开（除 zzz 变慢）
//   idle-spin  : 整体旋转 360°，0.8s（每 60s 随机触发之一）
//   idle-shake : scaleX -1 再回来（扭头感），0.6s
//   head-pat   : 眯眼 + 翅膀抖两下，500ms
//   sleeping   : 闭眼（眼 scaleY→0）+ zzz 字浮现，3min 无鼠标触发
//   wake       : 眼睛恢复 + 眨一下，200ms
//
// 调试条（左下角）spike 验收后删除。

import { useCallback, useEffect, useRef, useState } from "react";
import { updateHitRegion } from "../hitRegions";
import "./PetCircle.css";

// 设计稿 viewBox = 326×269，像素格 = 10px
// 身体（金色主体）在 x=103~213, y=80~170
const SPRITE_W = 163; // 326 * 0.5
const SPRITE_H = 135; // 269 * 0.5

const SCALE       = SPRITE_W / 326;
const BODY_LEFT   = Math.round(103 * SCALE); // ~51
const BODY_WIDTH  = Math.round(120 * SCALE); // ~60
const BODY_TOP    = Math.round(80  * SCALE); // ~40
const BODY_HEIGHT = Math.round(110 * SCALE); // ~55

const HIT_W = BODY_WIDTH;
const HIT_H = BODY_HEIGHT;

export const PET_SIZE = BODY_WIDTH;
/** sprite 完整宽度（含翅膀），App 层用来定位 BubbleStack wrapper */
export const PET_SPRITE_W = SPRITE_W;
/** 翅膀左边缘到 sprite 左上角的距离，BubbleStack 贴翅膀外侧用 */
export const PET_WING_LEFT = Math.round(38 * SCALE); // ~19px

type AnimState = "base" | "idle-spin" | "idle-shake" | "head-pat" | "sleeping" | "waking";

interface PetCircleProps {
  blushing?: boolean;
  onPosChange?: (pos: { x: number; y: number; size: number }) => void;
}

export default function PetCircle({
  blushing = false,
  onPosChange,
}: PetCircleProps) {
  const [pos, setPos] = useState(() => ({
    x: Math.max(0, window.innerWidth / 2 - SPRITE_W / 2),
    y: Math.max(0, window.innerHeight / 3 - SPRITE_H / 2),
  }));
  const [dragging, setDragging]   = useState(false);
  const [hovered, setHovered]     = useState(false);
  const [animState, setAnimState] = useState<AnimState>("base");

  // spike 调试
  const [moves, setMoves] = useState(0);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });

  const posRef       = useRef(pos);
  posRef.current     = pos;
  const animStateRef = useRef(animState);
  animStateRef.current = animState;

  // hit region 上报
  useEffect(() => {
    const hitX = pos.x + BODY_LEFT;
    const hitY = pos.y + BODY_TOP;
    updateHitRegion("pet-circle", { x: hitX, y: hitY, width: HIT_W, height: HIT_H });
    onPosChange?.({ x: hitX, y: hitY, size: HIT_W });
    return () => updateHitRegion("pet-circle", null);
  }, [pos.x, pos.y, onPosChange]);

  // 鼠标事件
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);
  const lastMouseTimeRef = useRef(Date.now());

  useEffect(() => {
    function isInsideBody(mx: number, my: number) {
      const { x, y } = posRef.current;
      return mx >= x + BODY_LEFT && mx <= x + BODY_LEFT + HIT_W
          && my >= y + BODY_TOP  && my <= y + BODY_TOP  + HIT_H;
    }

    function onMove(e: MouseEvent) {
      lastMouseTimeRef.current = Date.now();
      const x = e.clientX, y = e.clientY;
      setMoves((m) => m + 1);
      setMouse({ x: Math.round(x), y: Math.round(y) });

      // 唤醒 zzz
      if (animStateRef.current === "sleeping") {
        setAnimState("waking");
        setTimeout(() => setAnimState("base"), 400);
      }

      if (dragRef.current) {
        setPos({ x: x - dragRef.current.dx, y: y - dragRef.current.dy });
        return;
      }
      setHovered(isInsideBody(x, y));
    }

    function onDown(e: MouseEvent) {
      if (!isInsideBody(e.clientX, e.clientY)) return;
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

  // 点击头部 → 摸头动画
  const handleClick = useCallback((e: React.MouseEvent) => {
    const mx = e.clientX, my = e.clientY;
    const { x, y } = posRef.current;
    const headBottom = y + Math.round(145 * SCALE);
    if (mx >= x + BODY_LEFT && mx <= x + BODY_LEFT + HIT_W
     && my >= y && my <= headBottom) {
      if (animStateRef.current !== "base" && animStateRef.current !== "sleeping") return;
      setAnimState("head-pat");
      setTimeout(() => setAnimState("base"), 500);
    }
  }, []);

  // idle 定时器：每 60s 随机触发
  useEffect(() => {
    const timer = setInterval(() => {
      if (animStateRef.current !== "base") return;
      const which = Math.random() < 0.5 ? "idle-spin" : "idle-shake";
      setAnimState(which);
      const dur = which === "idle-spin" ? 800 : 600;
      setTimeout(() => setAnimState("base"), dur);
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

  // 睡眠定时器：3min 无鼠标移动
  useEffect(() => {
    const SLEEP_AFTER = 3 * 60 * 1000;
    const timer = setInterval(() => {
      if (animStateRef.current !== "base") return;
      if (Date.now() - lastMouseTimeRef.current >= SLEEP_AFTER) {
        setAnimState("sleeping");
      }
    }, 10_000);
    return () => clearInterval(timer);
  }, []);

  // 阴影椭圆的绝对位置（跟随 pos，但不参与 breathing）
  // SVG 椭圆 cx=163, cy=199.5，scale=0.5 → 渲染坐标 cx=81.5, cy=99.75
  const shadowLeft = pos.x + 81.5;  // 椭圆中心 X（绝对）
  const shadowTop  = pos.y + 99.75; // 椭圆中心 Y（绝对）

  const sleeping = animState === "sleeping";

  return (
    <>
      {/* 漂浮阴影：兄弟节点，跟随 pos 但不受 breathing 影响 */}
      <div
        className={[
          "pet-shadow",
          sleeping       ? "pet-shadow--slow"    : "",
          dragging       ? "pet-shadow--dragging" : "",
        ].filter(Boolean).join(" ")}
        style={{
          position: "fixed",
          left: shadowLeft,
          top:  shadowTop,
          transform: "translate(-50%, -50%)",
        }}
      />
      <div
        className={[
          "pet-circle",
          hovered      ? "is-hovered"  : "",
          blushing     ? "is-blushing" : "",
          dragging     ? "is-dragging" : "",
          `anim-${animState}`,
        ].filter(Boolean).join(" ")}
        style={{
          width:     SPRITE_W,
          height:    SPRITE_H,
          transform: `translate(${pos.x}px, ${pos.y}px)`,
        }}
        onClick={handleClick}
      >
        <svg
          width={SPRITE_W}
          height={SPRITE_H}
          viewBox="0 0 326 269"
          xmlns="http://www.w3.org/2000/svg"
          shapeRendering="crispEdges"
          style={{ display: "block" }}
          className="pet-sprite"
        >
          {/* ── 身体主色 ── */}
          <rect x="123" y="80" width="10" height="10" fill="#F9DA77"/>
          <rect x="123" y="90" width="10" height="10" fill="#F9DA77"/>
          <rect x="123" y="110" width="10" height="10" fill="#F9DA77"/>
          <rect x="123" y="100" width="10" height="10" fill="#F9DA77"/>
          <rect x="143" y="110" width="10" height="10" fill="#F9DA77"/>
          <rect x="153" y="110" width="10" height="10" fill="#F9DA77"/>
          <rect x="163" y="110" width="10" height="10" fill="#F9DA77"/>
          <rect x="153" y="100" width="10" height="10" fill="#F9DA77"/>
          <rect x="143" y="100" width="10" height="10" fill="#F9DA77"/>
          <rect x="163" y="100" width="10" height="10" fill="#F9DA77"/>
          <rect x="173" y="110" width="10" height="10" fill="#F9DA77"/>
          <rect x="153" y="120" width="10" height="10" fill="#F9DA77"/>
          <rect x="173" y="100" width="10" height="10" fill="#F9DA77"/>
          <rect x="153" y="130" width="10" height="10" fill="#F9DA77"/>
          <rect x="153" y="140" width="10" height="10" fill="#F9DA77"/>
          <rect x="143" y="120" width="10" height="10" fill="#F9DA77"/>
          <rect x="153" y="150" width="10" height="10" fill="#F9DA77"/>
          <rect x="163" y="120" width="10" height="10" fill="#F9DA77"/>
          <rect x="143" y="130" width="10" height="10" fill="#F9DA77"/>
          <rect x="163" y="130" width="10" height="10" fill="#F9DA77"/>
          <rect x="163" y="140" width="10" height="10" fill="#F9DA77"/>
          <rect x="143" y="140" width="10" height="10" fill="#F9DA77"/>
          <rect x="163" y="150" width="10" height="10" fill="#F9DA77"/>
          <rect x="143" y="150" width="10" height="10" fill="#F9DA77"/>
          <rect x="173" y="120" width="10" height="10" fill="#F9DA77"/>
          <rect x="183" y="120" width="10" height="10" fill="#F9DA77"/>
          <rect x="173" y="130" width="10" height="10" fill="#F9DA77"/>
          <rect x="183" y="130" width="10" height="10" fill="#F9DA77"/>
          <rect x="173" y="140" width="10" height="10" fill="#F9DA77"/>
          <rect x="183" y="90" width="10" height="10" fill="#F9DA77"/>
          <rect x="183" y="140" width="10" height="10" fill="#F9DA77"/>
          <rect x="173" y="150" width="10" height="10" fill="#F9DA77"/>
          <rect x="193" y="120" width="10" height="10" fill="#F9DA77"/>
          <rect x="113" y="120" width="10" height="10" fill="#F9DA77"/>
          <rect x="103" y="120" width="10" height="10" fill="#F9DA77"/>
          <rect x="193" y="130" width="10" height="10" fill="#F9DA77"/>
          <rect x="193" y="140" width="10" height="10" fill="#F9DA77"/>
          <rect x="183" y="150" width="10" height="10" fill="#F9DA77"/>
          <rect x="183" y="110" width="10" height="10" fill="#F9DA77"/>
          <rect x="193" y="150" width="10" height="10" fill="#F9DA77"/>
          <rect x="113" y="130" width="10" height="10" fill="#F9DA77"/>
          <rect x="113" y="140" width="10" height="10" fill="#F9DA77"/>
          <rect x="113" y="150" width="10" height="10" fill="#F9DA77"/>
          <rect x="103" y="130" width="10" height="10" fill="#F9DA77"/>
          <rect x="103" y="140" width="10" height="10" fill="#F9DA77"/>
          <rect x="103" y="150" width="10" height="10" fill="#F9DA77"/>
          <rect x="133" y="90" width="10" height="10" fill="#F9DA77"/>
          <rect x="133" y="110" width="10" height="10" fill="#F9DA77"/>
          <rect x="133" y="140" width="10" height="10" fill="#F9DA77"/>
          <rect x="133" y="150" width="10" height="10" fill="#F9DA77"/>
          <rect x="123" y="120" width="10" height="10" fill="#F9DA77"/>
          <rect x="133" y="120" width="10" height="10" fill="#F9DA77"/>
          <rect x="123" y="130" width="10" height="10" fill="#F9DA77"/>
          <rect x="133" y="130" width="10" height="10" fill="#F9DA77"/>
          <rect x="123" y="140" width="10" height="10" fill="#F9DA77"/>
          <rect x="123" y="150" width="10" height="10" fill="#F9DA77"/>
          <rect x="113" y="90" width="10" height="10" fill="#F9DA77"/>
          <rect x="193" y="110" width="10" height="10" fill="#F9DA77"/>
          <rect x="193" y="100" width="10" height="10" fill="#F9DA77"/>
          <rect x="113" y="110" width="10" height="10" fill="#F9DA77"/>
          <rect x="113" y="100" width="10" height="10" fill="#F9DA77"/>
          <rect x="103" y="110" width="10" height="10" fill="#F9DA77"/>
          <rect x="103" y="100" width="10" height="10" fill="#F9DA77"/>
          <rect x="153" y="80" width="10" height="10" fill="#F9DA77"/>
          <rect x="133" y="80" width="10" height="10" fill="#F9DA77"/>
          <rect x="143" y="80" width="10" height="10" fill="#F9DA77"/>
          <rect x="163" y="80" width="10" height="10" fill="#F9DA77"/>
          <rect x="173" y="80" width="10" height="10" fill="#F9DA77"/>
          <rect x="153" y="90" width="10" height="10" fill="#F9DA77"/>
          <rect x="133" y="100" width="10" height="10" fill="#F9DA77"/>
          <rect x="183" y="100" width="10" height="10" fill="#F9DA77"/>
          <rect x="143" y="90" width="10" height="10" fill="#F9DA77"/>
          <rect x="163" y="90" width="10" height="10" fill="#F9DA77"/>
          <rect x="173" y="90" width="10" height="10" fill="#F9DA77"/>

          {/* ── 阴影色（右侧 + 底行） ── */}
          <rect x="153" y="160" width="10" height="10" fill="#E7C559"/>
          <rect x="143" y="160" width="10" height="10" fill="#E7C559"/>
          <rect x="163" y="160" width="10" height="10" fill="#E7C559"/>
          <rect x="203" y="130" width="10" height="10" fill="#F1D16E"/>
          <rect x="173" y="160" width="10" height="10" fill="#E7C559"/>
          <rect x="203" y="120" width="10" height="10" fill="#F1D16E"/>
          <rect x="213" y="120" width="10" height="10" fill="#E7C559"/>
          <rect x="183" y="160" width="10" height="10" fill="#E7C559"/>
          <rect x="203" y="140" width="10" height="10" fill="#F1D16E"/>
          <rect x="193" y="160" width="10" height="10" fill="#E7C559"/>
          <rect x="113" y="160" width="10" height="10" fill="#E7C559"/>
          <rect x="103" y="160" width="10" height="10" fill="#E7C559"/>
          <rect x="213" y="130" width="10" height="10" fill="#E7C559"/>
          <rect x="213" y="140" width="10" height="10" fill="#E7C559"/>
          <rect x="203" y="150" width="10" height="10" fill="#F1D16E"/>
          <rect x="203" y="160" width="10" height="10" fill="#E7C559"/>
          <rect x="213" y="150" width="10" height="10" fill="#E7C559"/>
          <rect x="213" y="160" width="10" height="10" fill="#E7C559"/>
          <rect x="133" y="160" width="10" height="10" fill="#E7C559"/>
          <rect x="123" y="160" width="10" height="10" fill="#E7C559"/>
          <rect x="193" y="90" width="10" height="10" fill="#F1D16E"/>
          <rect x="203" y="90" width="10" height="10" fill="#E7C559"/>
          <rect x="203" y="110" width="10" height="10" fill="#F1D16E"/>
          <rect x="203" y="100" width="10" height="10" fill="#F1D16E"/>
          <rect x="213" y="110" width="10" height="10" fill="#E7C559"/>
          <rect x="213" y="100" width="10" height="10" fill="#E7C559"/>
          <rect x="183" y="80" width="10" height="10" fill="#F1D16E"/>
          <rect x="193" y="80" width="10" height="10" fill="#E7C559"/>

          {/* ── 眼睛（left x=133, right x=183，各 10×20） ── */}
          <rect className="eye eye-left"  x="133" y="120" width="10" height="20" fill="#303030"/>
          <rect className="eye eye-right" x="183" y="120" width="10" height="20" fill="#303030"/>

          {/* ── 嘴巴（x=153, y=150, 20×5） ── */}
          <rect className="mouth" x="153" y="150" width="20" height="5" fill="#303030"/>

          {/* 阴影椭圆已移到 SVG 外部，见 .pet-shadow */}

          {/* ── 左翅膀（白色 + fillOpacity 渐变） ── */}
          <rect className="wing wing-left" x="88" y="135" width="10" height="10" fill="white" fillOpacity="0.98"/>
          <rect className="wing wing-left" x="78" y="125" width="10" height="10" fill="white" fillOpacity="0.98"/>
          <rect className="wing wing-left" x="88" y="125" width="10" height="10" fill="white"/>
          <rect className="wing wing-left" x="78" y="115" width="10" height="10" fill="white"/>
          <rect className="wing wing-left" x="68" y="105" width="10" height="10" fill="white"/>
          <rect className="wing wing-left" x="68" y="125" width="10" height="10" fill="white" fillOpacity="0.95"/>
          <rect className="wing wing-left" x="68" y="115" width="10" height="10" fill="white" fillOpacity="0.98"/>
          <rect className="wing wing-left" x="58" y="125" width="10" height="10" fill="white" fillOpacity="0.9"/>
          <rect className="wing wing-left" x="58" y="115" width="10" height="10" fill="white" fillOpacity="0.95"/>
          <rect className="wing wing-left" x="48" y="115" width="10" height="10" fill="white" fillOpacity="0.98"/>
          <rect className="wing wing-left" x="38" y="115" width="10" height="10" fill="white"/>
          <rect className="wing wing-left" x="58" y="105" width="10" height="10" fill="white"/>
          <rect className="wing wing-left" x="48" y="125" width="10" height="10" fill="white" fillOpacity="0.8"/>
          <rect className="wing wing-left" x="58" y="135" width="10" height="10" fill="white" fillOpacity="0.8"/>
          <rect className="wing wing-left" x="88" y="145" width="10" height="10" fill="white" fillOpacity="0.95"/>
          <rect className="wing wing-left" x="78" y="135" width="10" height="10" fill="white" fillOpacity="0.95"/>
          <rect className="wing wing-left" x="68" y="135" width="10" height="10" fill="white" fillOpacity="0.9"/>
          <rect className="wing wing-left" x="78" y="145" width="10" height="10" fill="white" fillOpacity="0.9"/>

          {/* ── 右翅膀（明确 x/y 坐标，不用 matrix，避免渲染不对称） ── */}
          <rect className="wing wing-right" x="228" y="125" width="10" height="10" fill="white"/>
          <rect className="wing wing-right" x="228" y="135" width="10" height="10" fill="white" fillOpacity="0.98"/>
          <rect className="wing wing-right" x="228" y="145" width="10" height="10" fill="white" fillOpacity="0.95"/>
          <rect className="wing wing-right" x="238" y="115" width="10" height="10" fill="white"/>
          <rect className="wing wing-right" x="238" y="125" width="10" height="10" fill="white" fillOpacity="0.98"/>
          <rect className="wing wing-right" x="238" y="135" width="10" height="10" fill="white" fillOpacity="0.95"/>
          <rect className="wing wing-right" x="238" y="145" width="10" height="10" fill="white" fillOpacity="0.9"/>
          <rect className="wing wing-right" x="248" y="105" width="10" height="10" fill="white"/>
          <rect className="wing wing-right" x="248" y="115" width="10" height="10" fill="white" fillOpacity="0.98"/>
          <rect className="wing wing-right" x="248" y="125" width="10" height="10" fill="white" fillOpacity="0.95"/>
          <rect className="wing wing-right" x="248" y="135" width="10" height="10" fill="white" fillOpacity="0.9"/>
          <rect className="wing wing-right" x="258" y="105" width="10" height="10" fill="white"/>
          <rect className="wing wing-right" x="258" y="115" width="10" height="10" fill="white" fillOpacity="0.95"/>
          <rect className="wing wing-right" x="258" y="125" width="10" height="10" fill="white" fillOpacity="0.9"/>
          <rect className="wing wing-right" x="258" y="135" width="10" height="10" fill="white" fillOpacity="0.8"/>
          <rect className="wing wing-right" x="268" y="115" width="10" height="10" fill="white" fillOpacity="0.98"/>
          <rect className="wing wing-right" x="268" y="125" width="10" height="10" fill="white" fillOpacity="0.8"/>
          <rect className="wing wing-right" x="278" y="115" width="10" height="10" fill="white"/>
        </svg>

        {/* 睡眠时头顶飘 zzz */}
        {sleeping && (
          <div className="pet-zzz" aria-hidden="true">
            <span className="zzz-1">z</span>
            <span className="zzz-2">z</span>
            <span className="zzz-3">Z</span>
          </div>
        )}

        {/* hover 时身体区光晕 */}
        {hovered && !sleeping && (
          <div
            className="pet-hover-glow"
            style={{ left: BODY_LEFT, top: BODY_TOP, width: HIT_W, height: HIT_H }}
          />
        )}
      </div>

      <div className="pet-debug">
        moves={moves} mouse=({mouse.x},{mouse.y}) pet=({Math.round(pos.x)},{Math.round(pos.y)}) hov={String(hovered)} blush={String(blushing)} anim={animState}
      </div>
    </>
  );
}
