# Voice Flashcards: 语音翻牌 + 发音评分

**Date:** 2026-06-02
**Status:** Draft

## Overview

在现有 Flashcards 组件基础上，增加语音交互能力：

1. **语音翻牌** — 孩子说出卡片正面的单词，AI 自动翻牌显示答案
2. **语音导航** — 说 "next" / "previous" 切换卡片
3. **发音评分** — AI 对孩子的发音打分（0-100），显示星级评价
4. **语音模式** — 全程不需要触屏，纯语音完成所有操作

## 解决的问题

- **解放双手**：孩子可以边玩边学，不需要盯着屏幕点
- **增加趣味性**：像 KTV 打分一样，让孩子主动反复练习发音
- **即时反馈**：发音后立刻得到评分和纠正建议
- **降低使用门槛**：3-5 岁不识字的孩子也能独立使用

## Current State

现有 `Flashcards.tsx`（282 行）已实现：
- 卡片翻转动画（CSS 3D transform）
- TTS 朗读（通过 Realtime API `sendUserMessageContent`）
- 翻译切换
- 键盘导航（左右箭头、空格翻牌）
- 组件接收 `realtimeClient` prop

**不改变现有功能**：所有新增功能通过新状态和新 UI 元素实现，不修改现有翻牌、翻译、TTS 逻辑。

## Design

### 新增状态模型

```typescript
// 语音模式状态
type VoiceMode = 'off' | 'listening' | 'scoring';

interface VoiceFlashcardState {
  voiceMode: VoiceMode;
  lastScore: number | null;        // 0-100 发音评分
  lastFeedback: string | null;     // AI 反馈文本
  isRecording: boolean;            // 是否正在录音
  streakCount: number;             // 连续正确次数
}
```

### 状态转换

```
[off] ──点击麦克风──→ [listening]
[listening] ──说完单词──→ [scoring]
[scoring] ──显示评分──→ [listening] (自动继续)
[scoring] ──点击关闭──→ [off]
[listening] ──超时/静默──→ [off]
```

### 新增子组件

#### 1. VoiceModeToggle（语音模式开关）

位于卡片右下角，麦克风图标。点击切换语音模式开/关。

**Controls:**
- 麦克风图标按钮（与现有 voiceButton 同级）

**Positioning:** 卡片右下角，voiceButton 左侧

#### 2. PronunciationScore（发音评分显示）

语音模式下，孩子说完单词后显示评分动画。

**Controls:**
- 分数数字（0-100）+ 星级（1-5 星）
- 鼓励文案（"Great job!" / "Try again!" / "Perfect!"）
- 3 秒后自动消失

**Positioning:** 卡片中央覆盖层

#### 3. VoiceHint（语音提示）

语音模式下显示当前期待的操作提示。

**Controls:**
- 文字提示（"Say the word" / "Say 'next' or 'previous'"）

**Positioning:** 卡片顶部

### 语音交互流程

1. 开启语音模式 → 显示提示 "Say the word on the card"
2. 孩子说单词 → AI 识别并评分
3. 显示评分动画 → 自动翻牌到答案面
4. 孩子说 "next" → 切换下一张
5. 孩子说 "previous" → 切换上一张
6. 说 "read aloud" → 朗读当前卡片

### 发音评分算法

通过 Realtime API 发送评分请求：

```typescript
const scorePronunciation = async (spokenText: string, expectedText: string) => {
  if (!realtimeClient.isConnected()) return null;
  
  // 发送评分请求到 AI
  realtimeClient.sendUserMessageContent([{
    type: 'input_text',
    text: `Pronunciation scoring task. The child said: "${spokenText}". 
    The expected word was: "${expectedText}".
    Score 0-100 based on pronunciation accuracy.
    Reply with JSON only: {"score": <number>, "feedback": "<short encouragement>", "stars": <1-5>}`,
  }]);
  
  // 等待 AI 响应并解析
  // (通过 conversation.item.completed 事件获取)
};
```

### 视觉设计

**麦克风按钮:**
- 尺寸: 42px × 42px（与 voiceButton 一致）
- 位置: `bottom: 4px; right: 89px`（voiceButton 左侧）
- 样式: 圆形，半透明黑底，白色图标
- 激活状态: 红色脉冲动画（`@keyframes pulse`）

**评分显示:**
- 背景: `rgba(0,0,0,0.85)` 圆角卡片
- 分数: 白色大字 `font-size: 3rem`
- 星星: 黄色 `#FFD700`
- 动画: 从下方滑入 + 淡入

**语音提示:**
- 位置: 卡片顶部居中
- 样式: 半透明黑底白字小标签
- 动画: 淡入淡出

### Files Changed

| File | Action | Responsibility |
|------|--------|---------------|
| `src/components/flashcards/Flashcards.tsx` | Modify | 添加语音模式状态、语音交互逻辑、评分显示 |
| `src/components/flashcards/Flashcards.module.css` | Modify | 添加麦克风按钮、评分动画、语音提示样式 |
| `src/components/flashcards/useVoiceRecognition.ts` | Create | 语音识别 hook（封装 WavRecorder + Realtime API） |
| `src/components/flashcards/PronunciationScore.tsx` | Create | 发音评分显示组件 |
| `src/components/flashcards/PronunciationScore.module.css` | Create | 评分组件样式 |

### No Changes To

- `src/lib/realtime/` — vendored 库不修改
- `relay-server/` — 服务器端不修改
- `src/pages/ConsolePage.tsx` — 主页面不修改（组件通过 prop 接收 client）
- 现有翻牌、翻译、TTS 逻辑 — 保持不变

## Out of Scope

- 多人同时语音交互（家庭功能在 Feature 5 中实现）
- 语音录制回放对比（后续迭代）
- 离线语音识别（依赖网络）
- 自定义评分标准（使用 AI 默认标准）
