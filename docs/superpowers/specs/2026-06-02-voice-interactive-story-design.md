# Voice-Driven Interactive Story: 语音驱动互动故事

**Date:** 2026-06-02
**Status:** Draft

## Overview

在 Voice-First 中新增独立的"互动故事"模式，孩子通过语音做出选择来推动故事发展。AI 扮演故事叙述者，朗读旁白和角色对话，并根据孩子的语音选择推进不同分支。每个故事节点包含词汇教学元素，新单词高亮展示并附带趣味释义。故事完成后生成回顾摘要，展示学到的词汇和所走的分支路径。

**核心体验流程：**
1. 孩子从故事列表选择一个故事（如 "The Lost Treasure" 或 "Mystery at School"）
2. AI 叙述者朗读故事开头，营造场景
3. 面临选择时，屏幕显示两个选项（A/B），孩子说出选项
4. AI 根据选择推进故事，朗读下一段
5. 遇到新单词时，AI 暂停叙述，高亮词汇并用简单语言解释
6. 故事结束时，展示总结页面：词汇列表、选择路径回顾、完成徽章

## 解决的问题

- **主动学习 vs 被动听**：现有模式以音频播放为主，孩子是听众。互动故事让孩子成为故事的主角，主动参与决策
- **语音输出练习**：孩子必须开口说英文才能推进故事，自然产生大量口语输出
- **语境化词汇学习**：单词在故事中自然出现，比孤立的 Flashcards 更容易记忆
- **叙事理解力**：分支结构训练孩子理解因果关系（"如果你选 A，就会发生 X"）
- **自主使用**：3-5 岁不识字的孩子可以通过纯语音操作完整体验故事，不需要家长协助

## Current State

### 已有基础设施

**Realtime API 集成**（`src/lib/realtime/`）
- `RealtimeClient` — 已封装 WebSocket 连接、session 管理、tool 注册
- `RealtimeConversation` — 处理音频拼接、转写、function call dispatch
- `WavStreamPlayer` — 播放 AI 生成的语音（采样率 24000）
- `WavRecorder` — 录制用户语音输入

**语音交互模式（已有参考实现）**
- `ShadowReading.tsx` — 影子跟读模式，通过 `isActive` prop 切换全屏覆盖层
- `Flashcards.tsx` + `useVoiceRecognition.ts` — 语音翻牌，通过 `sendUserMessageContent` 发送文本给 AI
- `PronunciationScore.tsx` — 评分动画组件

**工具调用模式**（`DesktopLayout.tsx` L3348-3583）
- 现有 tool 定义：`google_search`、`youtube_search`、`selection_analyze`、`ask_deepseek`、`image_creation`、`audio_control`
- 通过 `client.addTool()` 注册，tool handler 中调用组件方法
- 语音控制已有 `audio_control` tool（暂停/恢复/跳转/音量）

**功能切换模式**
- `isShadowMode` 状态控制影子跟读全屏覆盖层
- 工具栏图标按钮（`GitBranch`/`Layers`/`Mic`/`BookOpen`）切换各功能
- Flashcards 通过 `toggleFlashcards` 函数切换显示/隐藏

**数据结构参考**
- 杂志内容：`public/play/<name>/` 下放 PDF、音频、脚本、关键词、Flashcards JSON
- 无现有"故事"数据格式

**路由**
- `App.tsx` 使用 React Router，当前所有主内容在 `DeviceLayout`（DesktopLayout/TabletLayout）中
- 无独立故事页面路由

### 不改变现有功能

所有现有模式（杂志播放、影子跟读、Flashcards、Chat）保持不变。互动故事作为新的全屏覆盖层（类似 ShadowReading 的 `isActive` 模式）实现，不修改现有组件逻辑。

## Design

### 新增路由

在 `App.tsx` 的 `AppRoutes` 中新增路由：

```tsx
<Route path="/stories" element={<ProtectedRoute><StoryPage /></ProtectedRoute>} />
```

同时保留从主界面工具栏进入的快捷方式（覆盖层模式），两条路径共享同一个 `StoryExperience` 组件。

### 新增状态模型

```typescript
// ========== 故事数据结构 ==========

/** 故事节点 — 一段叙述 + 可能的选择 */
interface StoryNode {
  id: string;                    // e.g. "start", "cave_entrance", "find_key"
  narration: string;             // AI 朗读的叙述文本（英文）
  narrationCn?: string;          // 中文翻译（可选，用于双语模式）
  illustration?: string;         // 场景插图 URL 或 emoji 描述
  character?: string;            // 说话角色（用于角色语音区分）
  vocabulary?: VocabularyItem[]; // 本节点的新词汇
  choices?: StoryChoice[];       // 分支选择（叶子节点无 choices）
  isEnding?: boolean;            // 是否为故事结尾
  endingTitle?: string;          // 结尾标题（仅 isEnding=true）
}

/** 分支选择 */
interface StoryChoice {
  id: string;                    // e.g. "enter_cave", "run_away"
  text: string;                  // 选项文本（英文）"Enter the dark cave"
  textCn?: string;               // 中文翻译 "进入黑暗的洞穴"
  voiceTriggers?: string[];      // 语音触发词（可选，AI 自动匹配）
  nextNodeId: string;            // 下一个节点 ID
  consequence?: string;          // 选择后果的简短描述（用于结局回顾）
}

/** 词汇条目 */
interface VocabularyItem {
  word: string;                  // 新单词
  phonetic?: string;             // 音标
  meaningCn: string;             // 中文释义
  meaningEn: string;             // 英文简单释义（给小孩子看）
  example?: string;              // 例句
  illustration?: string;         // 单词插图 URL
}

/** 故事元数据 */
interface StoryMeta {
  id: string;
  title: string;
  titleCn: string;
  description: string;
  difficulty: 'beginner' | 'intermediate';  // 词汇难度
  estimatedMinutes: number;      // 预计时长
  coverIllustration: string;     // 封面图
  theme: 'adventure' | 'mystery' | 'fairy_tale' | 'scifi';
}

/** 完整故事数据 = 元数据 + 所有节点 */
interface StoryData {
  meta: StoryMeta;
  nodes: Record<string, StoryNode>;  // key = node.id
  startNodeId: string;               // 起始节点
}

// ========== 运行时状态 ==========

type StoryPhase = 
  | 'selecting'      // 故事选择界面
  | 'loading'        // 加载故事数据
  | 'narrating'      // AI 正在朗读叙述
  | 'choice'         // 等待孩子做出选择
  | 'vocabulary'     // 词汇教学中
  | 'transitioning'  // 场景切换过渡
  | 'completed';     // 故事完成，显示总结

interface StoryProgress {
  currentNodeId: string;
  visitedNodes: string[];           // 访问过的节点（用于回顾）
  choicesMade: ChoiceRecord[];      // 做出的选择记录
  vocabularyLearned: VocabularyItem[]; // 学到的词汇（去重）
  startTime: number;
  endTime?: number;
}

interface ChoiceRecord {
  nodeId: string;
  choiceId: string;
  choiceText: string;
  timestamp: number;
}

interface StoryState {
  phase: StoryPhase;
  storyData: StoryData | null;
  progress: StoryProgress | null;
  selectedChoiceIndex: number | null;  // 当前高亮的选择项
  isAiSpeaking: boolean;               // AI 是否正在朗读
  isListening: boolean;                // 是否在监听用户语音
  narrationText: string;               // 当前正在朗读的文本
  showVocabularyPopup: boolean;        // 是否显示词汇弹窗
  currentVocabulary: VocabularyItem | null; // 当前展示的词汇
}
```

### 状态转换

```
[selecting] ──选择故事──→ [loading]
[loading] ──数据就绪──→ [narrating]
[narrating] ──朗读完毕──→ [choice] (有选择) 或 [completed] (结局)
[choice] ──孩子说出选项──→ [transitioning]
[choice] ──超时/静默──→ AI 重述选项，保持 [choice]
[transitioning] ──过渡动画完成──→ [narrating] (下一段) 或 [vocabulary]
[vocabulary] ──词汇解释完毕──→ [narrating] 或 [choice] 或 [completed]
[completed] ──查看总结──→ [completed]
[completed] ──返回选择──→ [selecting]
[任意阶段] ──退出──→ [selecting]
```

### AI Instructions（Story Mode）

进入故事模式时，动态替换 Realtime API session instructions：

```typescript
const STORY_INSTRUCTIONS = `
# Role: Story Narrator for Children
You are a warm, expressive storyteller narrating an interactive adventure for a young child (ages 3-7).

## Personality
- Speak slowly and clearly with exaggerated expressiveness
- Use different "voices" for different characters (whisper for mysterious, loud for exciting)
- Sound genuinely excited and encouraging
- Use simple vocabulary suitable for young children

## Storytelling Rules
1. Always narrate in English first, then optionally provide Chinese translation if the user asks
2. When you reach a CHOICE point, present exactly the two options from the story data
3. Accept voice input that matches either choice (use semantic matching, not exact words)
4. When vocabulary appears, pause the story, highlight the word, and explain it simply:
   - "New word! [WORD] means [simple English explanation]. In Chinese it's [Chinese meaning]. Let's practice: [WORD]! Can you say [WORD]?"
5. After explaining vocabulary, continue the story naturally
6. Use sound effects descriptions: "Whoosh! You run through the door!" or "Tap tap tap... someone is coming!"
7. End each story with a celebratory summary

## Vocabulary Teaching
When introducing a new word:
- Say the word clearly 3 times
- Give a simple English definition a child can understand
- Connect it to something familiar: "It's like when you..."
- Encourage the child to repeat it
- Use it in a simple sentence

## Choice Presentation
When presenting choices, use this format:
"Here's a choice for you! 
Option A: [choice A text]. Say 'A' or '[choice A key phrase]'
Option B: [choice B text]. Say 'B' or '[choice B key phrase']'

Take your time! Which one do you pick?"

Wait for the child's response. Accept variations like "I choose A", "B please", or just "A"/"B".
`;
```

### Tool: `advance_story`

注册一个 Realtime API tool 供 AI 在故事结束时调用，通知前端完成故事：

```typescript
client.addTool({
  name: 'story_complete',
  description: 'Called when the interactive story reaches an ending. Signals the frontend to show the completion screen.',
  parameters: {
    type: 'object',
    properties: {
      endingTitle: { type: 'string', description: 'Title of the ending' },
      summary: { type: 'string', description: 'Brief story summary' },
    },
    required: ['endingTitle', 'summary'],
  },
}, async ({ endingTitle, summary }) => {
  // Trigger completion screen
  completeStory(endingTitle, summary);
  return { ok: true };
});
```

### 新增组件

#### 1. StoryPage（路由页面）

全屏独立页面，包含 `StoryExperience` 组件。与 `DesktopLayout` 并列，不共享杂志播放器。

**职责：**
- 接收 `realtimeClient`（通过 context 或 prop drilling）
- 渲染 `StoryExperience`

#### 2. StoryExperience（核心容器）

类似 `ShadowReading` 的全屏覆盖层，也可嵌入 `DesktopLayout` 的主内容区。

**子状态：**
- 故事选择网格
- 故事进行中（叙述 + 选择 + 词汇）
- 故事完成摘要

**布局：**
```
┌─────────────────────────────────────────┐
│  [退出按钮]              [进度: 3/8]     │  ← 顶部导航栏
├─────────────────────────────────────────┤
│                                         │
│         ┌───────────────────┐           │
│         │                   │           │
│         │   场景插图区域     │           │  ← 插图/动画区
│         │   (illustration)  │           │
│         │                   │           │
│         └───────────────────┘           │
│                                         │
│  "You stand at the entrance of a       │
│   dark cave. Two tunnels stretch       │
│   before you..."                       │  ← 叙述文本区
│                                         │
│  ┌─────────────┐ ┌─────────────┐       │
│  │  A: Enter   │ │  B: Go back │       │  ← 选择按钮
│  │  the cave   │ │  home       │       │
│  └─────────────┘ └─────────────┘       │
│                                         │
│  ┌─ New Word: 🌟 cave ─────────────┐   │  ← 词汇卡片（弹出）
│  │  /keɪv/ 洞穴                    │   │
│  │  A cave is a big hole in a      │   │
│  │  mountain or under the ground!  │   │
│  └─────────────────────────────────┘   │
│                                         │
│  🎤 Listening...                       │  ← 语音状态指示器
│                                         │
└─────────────────────────────────────────┘
```

#### 3. StorySelector（故事选择网格）

从主界面工具栏或 `/stories` 路由进入时显示。

**Controls:**
- 故事卡片网格（2 列），每张卡片显示封面插图、标题、难度标签、预估时长
- 卡片点击或语音说故事标题进入

**样式：**
- 卡片：圆角 16px，阴影，hover 放大效果
- 封面：渐变背景 + emoji 主题图标（预生成，非实时 AI 生成）
- 难度标签：绿色（beginner）/ 橙色（intermediate）

#### 4. StoryNarration（叙述文本区）

AI 朗读时，文本逐句高亮显示。

**Controls:**
- 叙述文本，当前朗读的句子高亮
- 角色名标签（不同角色不同颜色）
- 打字机效果：文本随 AI 朗读逐步出现

**Positioning:** 场景插图下方，选择按钮上方

#### 5. StoryChoices（选择按钮组）

故事到达分支点时显示两个选择按钮。

**Controls:**
- 两个选项按钮（A / B），大字体，圆角
- 语音激活状态：麦克风图标 + 脉冲动画
- 选中高亮：选中的按钮发光放大
- 超时重述：15 秒无响应后，AI 自动重述选项

**Positioning:** 叙述文本下方

#### 6. VocabularyCard（词汇教学卡片）

新单词出现时弹出的教学卡片。

**Controls:**
- 单词大字 + 音标
- 中文释义 + 英文简单释义
- 例句
- "跟读"按钮（点击后 AI 等待孩子跟读，给予鼓励）
- 3-5 秒自动消失，或手动点击关闭

**Positioning:** 屏幕中央覆盖层，半透明背景

#### 7. StoryProgress（进度指示器）

显示故事进度和选择路径。

**Controls:**
- 圆点进度条（已访问节点为实心，当前节点为脉冲）
- 总节点数 / 已访问节点数
- 当前节点的简短描述（tooltip）

**Positioning:** 顶部导航栏右侧

#### 8. StoryCompletion（完成摘要页）

故事结束后显示的回顾页面。

**Controls:**
- 结束标题 + 恭喜文案
- 选择路径回顾（时间线形式，显示每个分支点的选择）
- 学到的词汇列表（可点击重新听发音）
- 完成徽章（"Adventure Complete!" / "Mystery Solved!"）
- "再玩一次" 和 "换一个故事" 按钮

**Positioning:** 全屏覆盖层

#### 9. VoiceStatusIndicator（语音状态指示器）

显示当前语音交互状态。

**Controls:**
- 图标 + 文字："Listening..." / "AI is speaking..." / "Your turn!"
- 脉冲动画（监听中）/ 波形动画（AI 朗读中）

**Positioning:** 屏幕底部居中

### 故事数据格式

故事数据以 JSON 文件存储在 `public/stories/` 目录下，每个故事一个文件：

```
public/stories/
├── the-lost-treasure.json       # 冒险故事
├── mystery-at-school.json       # 神秘故事
└── index.json                   # 故事列表索引
```

#### 示例：`the-lost-treasure.json`

```json
{
  "meta": {
    "id": "the-lost-treasure",
    "title": "The Lost Treasure",
    "titleCn": "丢失的宝藏",
    "description": "Find the hidden treasure in the Enchanted Forest!",
    "difficulty": "beginner",
    "estimatedMinutes": 8,
    "coverIllustration": "forest",
    "theme": "adventure"
  },
  "startNodeId": "start",
  "nodes": {
    "start": {
      "id": "start",
      "narration": "Once upon a time, you found a sparkly map in your grandmother's old drawer. The map showed a path through the Enchanted Forest to a hidden treasure! You grabbed your backpack and followed the trail.",
      "character": "narrator",
      "illustration": "map_and_forest",
      "choices": [
        {
          "id": "follow_river",
          "text": "Follow the sparkling river",
          "textCn": "沿着闪亮的小河走",
          "nextNodeId": "river_path",
          "consequence": "You chose the beautiful river path"
        },
        {
          "id": "enter_cave",
          "text": "Take the dark tunnel into the hill",
          "textCn": "走进山丘里的黑暗隧道",
          "nextNodeId": "cave_path",
          "consequence": "You bravely entered the mysterious cave"
        }
      ]
    },
    "river_path": {
      "id": "river_path",
      "narration": "You followed the sparkling river. The water shimmered with golden light. Suddenly, you saw a friendly frog sitting on a lily pad! 'Ribbit! Hello, little explorer!' said the frog. 'Are you looking for the treasure?'",
      "character": "narrator",
      "illustration": "river_frog",
      "vocabulary": [
        {
          "word": "sparkling",
          "phonetic": "/ˈspɑːrklɪŋ/",
          "meaningCn": "闪闪发光的",
          "meaningEn": "When something shines with little points of light, like stars or diamonds!",
          "example": "The water was sparkling in the sun."
        }
      ],
      "choices": [
        {
          "id": "ask_frog",
          "text": "Ask the frog for directions",
          "textCn": "问青蛙怎么走",
          "nextNodeId": "frog_guide",
          "consequence": "You trusted the friendly frog"
        },
        {
          "id": "continue_alone",
          "text": "Keep going along the river by yourself",
          "textCn": "自己继续沿河走",
          "nextNodeId": "river_dead_end",
          "consequence": "You tried to go alone"
        }
      ]
    },
    "cave_path": {
      "id": "cave_path",
      "narration": "You bravely walked into the dark tunnel. It was quiet... drip, drip, drip went the water from the ceiling. Then you saw something glowing in the dark!",
      "character": "narrator",
      "illustration": "dark_cave",
      "vocabulary": [
        {
          "word": "bravely",
          "phonetic": "/ˈbreɪvli/",
          "meaningCn": "勇敢地",
          "meaningEn": "When you do something even though you feel a little scared. That's being brave!",
          "example": "She bravely walked into the dark room."
        }
      ],
      "choices": [
        {
          "id": "touch_glow",
          "text": "Touch the glowing light",
          "textCn": "摸摸那个发光的东西",
          "nextNodeId": "crystal_discovery",
          "consequence": "You discovered magic crystals!"
        },
        {
          "id": "call_out",
          "text": "Say 'Hello? Is anyone there?'",
          "textCn": "喊一声：'有人吗？'",
          "nextNodeId": "meet_character",
          "consequence": "You met a cave friend"
        }
      ]
    },
    "frog_guide": {
      "id": "frog_guide",
      "narration": "'Follow me!' said the frog, hopping along the riverbank. Together, you found a hidden bridge made of rainbow stones! On the other side... you could see the treasure chest sparkling in the sunlight!",
      "character": "frog",
      "illustration": "rainbow_bridge",
      "vocabulary": [
        {
          "word": "bridge",
          "phonetic": "/brɪdʒ/",
          "meaningCn": "桥",
          "meaningEn": "Something built over water or a gap so you can cross from one side to the other!",
          "example": "We walked across the bridge to get to the park."
        }
      ],
      "choices": [
        {
          "id": "open_chest",
          "text": "Open the treasure chest",
          "textCn": "打开宝箱",
          "nextNodeId": "ending_good",
          "consequence": "You found the treasure!"
        }
      ]
    },
    "ending_good": {
      "id": "ending_good",
      "narration": "You opened the treasure chest and... wow! Inside were hundreds of beautiful golden coins, a shiny crown, and a note that said: 'The real treasure is the adventure you had!' You smiled, because you knew the friendly frog helped you find it. What an amazing adventure!",
      "character": "narrator",
      "illustration": "treasure_chest",
      "isEnding": true,
      "endingTitle": "The Treasure Found!"
    }
  }
}
```

#### 故事索引：`public/stories/index.json`

```json
{
  "stories": [
    {
      "id": "the-lost-treasure",
      "title": "The Lost Treasure",
      "titleCn": "丢失的宝藏",
      "description": "Find the hidden treasure in the Enchanted Forest!",
      "difficulty": "beginner",
      "estimatedMinutes": 8,
      "coverIllustration": "forest",
      "theme": "adventure",
      "file": "the-lost-treasure.json"
    },
    {
      "id": "mystery-at-school",
      "title": "Mystery at School",
      "titleCn": "学校的谜团",
      "description": "Who is leaving mysterious notes in the classroom?",
      "difficulty": "beginner",
      "estimatedMinutes": 8,
      "coverIllustration": "school",
      "theme": "mystery",
      "file": "mystery-at-school.json"
    }
  ]
}
```

### 插图系统（简化版）

第一版不使用 AI 实时生成插图（延迟太高、成本高），而是使用预设的 emoji + 渐变背景组合来表示场景：

```typescript
// 插图配置映射
const ILLUSTRATIONS: Record<string, { bg: string; emoji: string; label: string }> = {
  'map_and_forest':     { bg: 'linear-gradient(135deg, #2d5016 0%, #87CEEB 100%)', emoji: '🗺️🌲', label: 'Enchanted Forest' },
  'river_frog':         { bg: 'linear-gradient(135deg, #4FC3F7 0%, #81C784 100%)', emoji: '🐸💧', label: 'Sparkling River' },
  'dark_cave':          { bg: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)', emoji: '🕯️🦇', label: 'Dark Cave' },
  'rainbow_bridge':     { bg: 'linear-gradient(135deg, #FF6B6B 0%, #4ECDC4 50%, #45B7D1 100%)', emoji: '🌈🌉', label: 'Rainbow Bridge' },
  'treasure_chest':     { bg: 'linear-gradient(135deg, #FFD700 0%, #FFA000 100%)', emoji: '💰👑', label: 'Treasure!' },
  'school_classroom':   { bg: 'linear-gradient(135deg, #FFE0B2 0%, #FFCC80 100%)', emoji: '🏫📝', label: 'Classroom' },
  'school_hallway':     { bg: 'linear-gradient(135deg, #B3E5FC 0%, #81D4FA 100%)', emoji: '🚪🔍', label: 'School Hallway' },
  // ... 可扩展
};
```

后续版本可替换为 AI 生成插图（调用现有 `/api/zhipu/image` 接口）。

### 语音交互流程

```
1. AI 朗读叙述文本
   ├── 前端：逐句高亮文本
   ├── 后端：WavStreamPlayer 播放 AI 语音
   └── 词汇检测：叙述中遇到 vocabulary 时，AI 主动暂停

2. 词汇教学（如有）
   ├── AI 说出："New word! [WORD] means..."
   ├── 前端：弹出 VocabularyCard
   ├── AI 等待孩子跟读
   ├── AI 给予鼓励："Great job! You said [WORD] perfectly!"
   └── AI 继续叙述

3. 选择分支
   ├── AI 说出选项："Here's a choice for you! A: [text]. B: [text]"
   ├── 前端：显示 StoryChoices，高亮两个按钮
   ├── 语音监听：孩子说 "A" / "B" / 完整句子
   ├── Realtime API 转写 → AI 语义匹配 → 选择确认
   ├── 前端：高亮选中按钮，过渡动画
   └── AI：根据选择推进到下一个节点

4. 场景过渡
   ├── 前端：淡出当前场景 → 淡入新场景
   ├── 更新插图、进度条
   └── AI 开始朗读新节点的叙述

5. 故事完成
   ├── AI 调用 story_complete tool
   ├── 前端：显示 StoryCompletion 摘要页
   ├── 展示：词汇列表、选择路径、完成徽章
   └── 提供"再玩一次"/"换故事"选项
```

### 语音识别策略

复用现有的 Realtime API 语音转写能力（`input_audio_transcription` 已配置 whisper-1），不需要额外的语音识别模块：

1. **选项匹配**：AI 在 instructions 中被指示接受语义匹配（"I pick the cave" 匹配 "Enter the cave"）
2. **超时处理**：15 秒无语音输入 → AI 自动重述选项
3. **错误处理**：如果孩子说了无法理解的内容 → AI 友好提示 "I didn't catch that! Could you say A or B?"

### 视觉设计

**配色方案：**
- 故事模式使用暖色调渐变背景（区别于杂志模式的白色背景）
- 背景：`linear-gradient(180deg, #FFF8E1 0%, #FFF3E0 50%, #FFE0B2 100%)`
- 叙述文本：深棕色 `#3E2723`
- 选择按钮：蓝色渐变 `linear-gradient(135deg, #42A5F5, #1E88E5)`
- 选中状态：金色渐变 `linear-gradient(135deg, #FFD54F, #FFC107)`
- 词汇高亮：金色下划线 + 背景 `rgba(255, 193, 7, 0.2)`
- 完成页面：绿色 `#4CAF50` + 金色装饰

**字体大小（儿童友好）：**
- 叙述文本：`font-size: 1.5em`，`line-height: 1.8`
- 选择按钮：`font-size: 1.3em`
- 词汇单词：`font-size: 2em`，`font-weight: bold`
- 所有文字使用圆角字体（如系统圆体或 Nunito）

**动画：**
- 场景切换：fade + slide（300ms ease-in-out）
- 选择按钮出现：从下方弹入（200ms）
- 词汇卡片：从中央放大出现（scale 0 → 1，250ms）
- 语音监听指示器：脉冲动画（CSS `@keyframes pulse`）
- 完成徽章：旋转 + 缩放进入

**响应式：**
- DesktopLayout：故事区域占主内容区（与 PDF 播放器同级位置）
- TabletLayout：全屏覆盖
- 移动端：竖屏优化，选择按钮改为上下排列

### Files Changed

| File | Action | Responsibility |
|------|--------|---------------|
| `src/App.tsx` | Modify | 添加 `/stories` 路由 |
| `src/pages/StoryPage.tsx` | Create | 故事模式路由页面 |
| `src/pages/StoryPage.scss` | Create | 故事页面全局样式 |
| `src/components/story/StoryExperience.tsx` | Create | 核心容器，管理故事状态机 |
| `src/components/story/StoryExperience.module.css` | Create | 核心容器样式 |
| `src/components/story/StorySelector.tsx` | Create | 故事选择网格 |
| `src/components/story/StorySelector.module.css` | Create | 选择器样式 |
| `src/components/story/StoryNarration.tsx` | Create | 叙述文本逐句高亮显示 |
| `src/components/story/StoryNarration.module.css` | Create | 叙述样式 |
| `src/components/story/StoryChoices.tsx` | Create | 选择按钮组 |
| `src/components/story/StoryChoices.module.css` | Create | 选择按钮样式 |
| `src/components/story/VocabularyCard.tsx` | Create | 词汇教学弹窗 |
| `src/components/story/VocabularyCard.module.css` | Create | 词汇卡片样式 |
| `src/components/story/StoryProgress.tsx` | Create | 进度指示器 |
| `src/components/story/StoryCompletion.tsx` | Create | 完成摘要页 |
| `src/components/story/StoryCompletion.module.css` | Create | 完成页样式 |
| `src/components/story/VoiceStatusIndicator.tsx` | Create | 语音状态指示器 |
| `src/components/story/VoiceStatusIndicator.module.css` | Create | 语音指示器样式 |
| `src/components/story/illustrations.ts` | Create | 插图配置映射 |
| `src/hooks/useStoryEngine.ts` | Create | 故事引擎 hook（状态机、节点转换、进度追踪） |
| `src/hooks/useStoryVoice.ts` | Create | 语音交互 hook（语音命令解析、超时处理） |
| `src/types/story.ts` | Create | TypeScript 类型定义 |
| `public/stories/index.json` | Create | 故事列表索引 |
| `public/stories/the-lost-treasure.json` | Create | 示例故事 1：冒险 |
| `public/stories/mystery-at-school.json` | Create | 示例故事 2：神秘 |
| `local-server.js` | Modify | 添加 `/api/stories` 端点（返回 index.json） |
| `src/pages/DesktopLayout.tsx` | Modify | 工具栏添加故事模式入口图标 |

### No Changes To

- `src/lib/realtime/` — vendored 库不修改
- `src/lib/wavetools/` — 音频工具不修改
- `relay-server/` — 服务器端不修改
- `src/components/flashcards/` — Flashcards 组件不修改
- `src/components/shadow-reading/` — 影子跟读组件不修改
- `src/components/chat/` — Chat 组件不修改
- `src/contexts/AuthContext.tsx` — 认证上下文不修改

### API 端点

新增一个简单的服务端端点用于获取故事列表：

```javascript
// local-server.js 新增
app.get('/api/stories', (req, res) => {
  const indexPath = path.join(__dirname, 'public', 'stories', 'index.json');
  const data = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  res.json(data);
});

app.get('/api/stories/:id', (req, res) => {
  const storyPath = path.join(__dirname, 'public', 'stories', `${req.params.id}.json`);
  if (!fs.existsSync(storyPath)) {
    return res.status(404).json({ error: 'Story not found' });
  }
  const data = JSON.parse(fs.readFileSync(storyPath, 'utf8'));
  res.json(data);
});
```

### 实现顺序（建议）

1. **Phase 1 — 基础框架**（2-3 天）
   - 类型定义 (`src/types/story.ts`)
   - 故事引擎 hook (`useStoryEngine.ts`)
   - 故事选择器 (`StorySelector.tsx`)
   - 故事数据（2 个示例故事 JSON）
   - 服务端 API 端点

2. **Phase 2 — 核心交互**（3-4 天）
   - 故事体验容器 (`StoryExperience.tsx`)
   - 叙述文本组件 (`StoryNarration.tsx`)
   - 选择按钮组件 (`StoryChoices.tsx`)
   - 语音交互 hook (`useStoryVoice.ts`)
   - AI instructions 配置
   - Realtime API tool 注册 (`story_complete`)

3. **Phase 3 — 词汇与完成**（2-3 天）
   - 词汇教学卡片 (`VocabularyCard.tsx`)
   - 完成摘要页 (`StoryCompletion.tsx`)
   - 进度指示器 (`StoryProgress.tsx`)
   - 语音状态指示器 (`VoiceStatusIndicator.tsx`)

4. **Phase 4 — 集成与打磨**（2-3 天）
   - DesktopLayout 工具栏集成
   - StoryPage 路由
   - 插图系统
   - 响应式适配
   - 错误处理和边缘情况
   - 测试与调优

**预估总工期：** 9-13 天

## Out of Scope

- **AI 实时插图生成**：第一版使用预设 emoji + 渐变背景，后续迭代接入 AI 图片生成
- **多人故事**：家庭成员同时参与故事（Feature 5 家庭模式中考虑）
- **用户自定义故事编辑器**：家长/老师自定义故事内容（后续迭代）
- **故事录音回放**：回放孩子说的选择语音（后续迭代）
- **离线故事**：故事数据预缓存供离线使用（依赖网络）
- **动态难度调整**：根据孩子表现自动调整词汇难度（后续迭代）
- **故事成就系统**：跨故事的成就徽章、积分（后续迭代）
- **A/B 测试框架**：不同故事路径的数据分析（后续迭代）
- **跨设备故事同步**：手机/平板间故事进度同步（Feature 5 中考虑）
- **故事排行榜**：社区故事完成排行（后续迭代）
