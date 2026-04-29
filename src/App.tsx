// 桌宠根组件。
//
// 流 A（透明窗口 + always-on-top + 鼠标穿透）已完成；
// 流 B 第一阶段（Hermes runner 端到端跑通）已完成。
//
// 当前形态：PetCircle 占位圆 + 鼠标穿透 hit region 上报。
// 下一步：在 PetCircle 左侧叠加三气泡 UI（research / 对话 / cowork），
// 替代之前用于调试 runtime 的 ChatPanel。

import PetCircle from "./components/PetCircle";
import "./App.css";

function App() {
  return (
    <div className="pet-root">
      <PetCircle />
    </div>
  );
}

export default App;
