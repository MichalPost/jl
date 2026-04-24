# Requirements Document

## Introduction

本功能为桌面端划词任务管理工具，基于 Vite + React + Tauri + TypeScript + TailwindCSS 技术栈构建。用户在桌面任意位置划选文字后，系统将在光标附近弹出一个轻量级极简快捷操作栏（Popup），用户可将划选的文字快速分类保存为任务、便签、高亮或稍后阅读等条目。系统自动捕获来源上下文（URL、网页标题、前后文），并支持 AI 意图识别、OCR 截图识别、全局搜索台、桌面便利贴、通知提醒及插件模块等高级功能，帮助用户在阅读或工作过程中高效捕获、整理和回顾信息。

## Glossary

- **App**：基于 Tauri 构建的桌面端应用程序整体
- **Overlay_Window**：Tauri 创建的透明全局悬浮窗口，用于监听全局文字选择事件并渲染 Popup
- **Popup**：用户划选文字后出现在光标附近的半透明极简快捷操作栏，包含分类保存按钮等操作
- **Selection_Monitor**：负责监听全局鼠标释放事件并读取当前选中文字的模块
- **Task**：由用户从划选文字创建的任务条目，包含文本内容、来源、上下文、创建时间和完成状态
- **Task_Store**：负责持久化存储和管理所有条目（Task、Note、Highlight、ReadLater）的模块，使用本地文件系统存储
- **Task_Manager_Window**：展示、搜索和管理所有条目的主窗口
- **Selected_Text**：用户通过鼠标划选操作选中的文字字符串
- **Inbox**：所有新捕获条目默认进入的收件箱，用户可在主界面对其进行归类处理
- **Context**：划词内容前后各两句话组成的上下文信息
- **Source**：划词时自动抓取的来源信息，包括 URL、网页标题或本地软件名称与文件名
- **Note**：以便签形式保存的条目
- **Highlight**：以高亮形式保存的条目
- **ReadLater**：以"稍后阅读"形式保存的条目
- **AI_Analyzer**：接入轻量级 AI 大模型 API，对 Selected_Text 进行意图识别和分类的模块
- **OCR_Module**：对用户截图进行文字识别的模块
- **Search_Spotlight**：全局快捷键呼出的搜索台，支持跨所有条目的关键词检索
- **Desktop_Sticky**：钉在桌面边缘的极简便利贴窗口
- **Plugin_Manager**：负责加载和管理插件模块的组件
- **Reminder**：与条目关联的定时通知提醒

---

## Requirements

### Requirement 1: 全局文字选择监听

**User Story:** 作为用户，我希望在桌面任意位置划选文字后系统能感知到选中内容，以便后续触发弹窗操作。

#### Acceptance Criteria

1. WHEN 用户在任意桌面应用中释放鼠标左键，THE Selection_Monitor SHALL 读取当前系统剪贴板或系统 API 获取 Selected_Text
2. WHEN Selected_Text 的字符长度大于 0 且不超过 500 个字符，THE Selection_Monitor SHALL 将 Selected_Text 及鼠标释放时的屏幕坐标传递给 Overlay_Window
3. WHEN Selected_Text 为空字符串，THE Selection_Monitor SHALL 不触发任何弹窗
4. IF 读取 Selected_Text 时发生系统错误，THEN THE Selection_Monitor SHALL 记录错误日志并保持静默，不影响用户当前操作
5. WHEN Selected_Text 的字符长度超过 500 个字符，THE Selection_Monitor SHALL 截取前 500 个字符并继续处理

---

### Requirement 2: Popup 弹窗显示与定位

**User Story:** 作为用户，我希望划选文字后弹窗出现在光标附近，以便快速决定如何分类保存。

#### Acceptance Criteria

1. WHEN Overlay_Window 接收到 Selected_Text 及坐标，THE Overlay_Window SHALL 在鼠标释放后 500ms 内于距鼠标释放位置垂直偏移 12px 处渲染 Popup
2. WHEN Popup 即将超出屏幕右边界，THE Overlay_Window SHALL 将 Popup 向左偏移使其完整显示在屏幕内
3. WHEN Popup 即将超出屏幕下边界，THE Overlay_Window SHALL 将 Popup 显示在鼠标位置上方
4. THE Popup SHALL 以半透明样式呈现，并包含以下快捷操作按钮：[加入TODO]、[存为便签]、[高亮保存]、[稍后阅读]、[钉在桌面]、关闭按钮
5. WHEN Popup 处于显示状态且用户在 Popup 区域外单击鼠标，THE Overlay_Window SHALL 隐藏 Popup
6. WHEN Popup 处于显示状态且用户按下 Escape 键，THE Overlay_Window SHALL 隐藏 Popup
7. WHILE Popup 处于显示状态，THE Overlay_Window SHALL 保持在所有窗口的最顶层
8. WHEN AI_Analyzer 返回意图识别结果，THE Popup SHALL 在快捷操作按钮下方展示对应的智能建议区域

---

### Requirement 3: 将划选文字加入任务列表

**User Story:** 作为用户，我希望通过 Popup 快捷按钮或快捷键将划选文字分类保存，以便后续跟踪处理。

#### Acceptance Criteria

1. WHEN 用户点击 Popup 中的 [加入TODO] 按钮，THE Task_Store SHALL 创建一条新的 Task，包含字段：id（UUID）、type（"todo"）、text（Selected_Text 内容）、source（Source 信息）、context（Context 信息）、createdAt（ISO 8601 时间戳）、completed（初始值为 false）、inbox（初始值为 true）
2. WHEN 用户点击 Popup 中的 [存为便签] 按钮，THE Task_Store SHALL 创建一条 type 为 "note" 的 Note 条目，包含与 Task 相同的基础字段
3. WHEN 用户点击 Popup 中的 [高亮保存] 按钮，THE Task_Store SHALL 创建一条 type 为 "highlight" 的 Highlight 条目
4. WHEN 用户点击 Popup 中的 [稍后阅读] 按钮，THE Task_Store SHALL 创建一条 type 为 "read_later" 的 ReadLater 条目
5. WHEN 用户按下 Ctrl+D 快捷键且存在 Selected_Text，THE Task_Store SHALL 将 Selected_Text 以 type 为 "todo" 的条目直接保存至 Inbox，不显示 Popup
6. WHEN 任意条目创建成功，THE Overlay_Window SHALL 隐藏 Popup 并显示持续 2 秒的成功提示
7. IF 条目创建过程中发生存储错误，THEN THE Overlay_Window SHALL 在 Popup 内显示错误提示文字，不关闭 Popup
8. THE Task_Store SHALL 将所有条目数据以 JSON 格式持久化存储到用户本地数据目录
9. WHEN 同一 Selected_Text 在 60 秒内被重复添加，THE Task_Store SHALL 仍创建新的独立条目，不进行去重

---

### Requirement 4: 任务列表查看与 Inbox 管理

**User Story:** 作为用户，我希望能打开主窗口查看 Inbox 及所有已保存的条目，并对其进行归类整理。

#### Acceptance Criteria

1. WHEN 用户通过系统托盘菜单或快捷键打开任务列表，THE App SHALL 显示 Task_Manager_Window
2. THE Task_Manager_Window SHALL 提供 Inbox 视图，展示所有 inbox 字段为 true 的条目，每条显示：类型图标、文本内容、来源信息、创建时间（格式：YYYY-MM-DD HH:mm）
3. WHEN Task_Manager_Window 打开时，THE Task_Manager_Window SHALL 按 createdAt 降序排列展示条目
4. WHEN 条目列表为空，THE Task_Manager_Window SHALL 显示空状态提示文字"暂无内容，划选文字即可快速添加"
5. WHILE Task_Manager_Window 处于打开状态，THE Task_Manager_Window SHALL 实时反映 Task_Store 中的最新数据
6. WHEN 用户将 Inbox 中的条目拖拽或指定到某个项目夹，THE Task_Store SHALL 更新该条目的 inbox 字段为 false 并记录所属项目夹
7. WHEN 用户为条目添加标签，THE Task_Store SHALL 将标签列表持久化到该条目的 tags 字段
8. WHEN 用户将条目标记为"已处理"，THE Task_Store SHALL 将该条目的 inbox 字段更新为 false 并将 completed 更新为 true

---

### Requirement 5: 任务状态管理

**User Story:** 作为用户，我希望能标记任务为已完成或将其删除，以便维护任务列表的整洁。

#### Acceptance Criteria

1. WHEN 用户勾选某条 Task 的复选框，THE Task_Store SHALL 将该 Task 的 completed 字段更新为 true 并持久化
2. WHEN 用户取消勾选某条 Task 的复选框，THE Task_Store SHALL 将该 Task 的 completed 字段更新为 false 并持久化
3. WHEN 用户点击某条 Task 的删除按钮，THE Task_Manager_Window SHALL 显示确认对话框
4. WHEN 用户在确认对话框中确认删除，THE Task_Store SHALL 从存储中永久移除该 Task
5. IF 删除操作发生存储错误，THEN THE Task_Manager_Window SHALL 显示错误提示，该 Task 保持原状态不变

---

### Requirement 6: 任务搜索

**User Story:** 作为用户，我希望能通过关键词搜索任务列表，以便在大量任务中快速定位目标。

#### Acceptance Criteria

1. THE Task_Manager_Window SHALL 提供一个搜索输入框，占位文字为"搜索任务..."
2. WHEN 用户在搜索框中输入关键词，THE Task_Manager_Window SHALL 在输入停止后 300ms 内过滤并展示 text 字段包含该关键词的 Task
3. WHEN 搜索结果为空，THE Task_Manager_Window SHALL 显示提示文字"未找到匹配的任务"
4. WHEN 用户清空搜索框，THE Task_Manager_Window SHALL 恢复展示全部 Task
5. THE Task_Manager_Window SHALL 对搜索关键词进行大小写不敏感匹配

---

### Requirement 7: 系统托盘集成

**User Story:** 作为用户，我希望应用在后台运行并通过系统托盘访问，以便不干扰正常工作流程。

#### Acceptance Criteria

1. WHEN App 启动时，THE App SHALL 在系统托盘区域显示应用图标
2. THE App SHALL 提供托盘右键菜单，包含以下选项："打开任务列表"、"退出"
3. WHEN 用户点击托盘菜单中的"打开任务列表"，THE App SHALL 显示或聚焦 Task_Manager_Window
4. WHEN 用户点击托盘菜单中的"退出"，THE App SHALL 终止进程并退出
5. WHEN 用户关闭 Task_Manager_Window，THE App SHALL 隐藏窗口而非退出进程，继续在后台运行

---

### Requirement 8: 自动捕获来源与上下文

**User Story:** 作为用户，我希望保存划词内容时系统自动记录来源和上下文，以便日后回溯信息出处。

#### Acceptance Criteria

1. WHEN 用户在浏览器中划词，THE Selection_Monitor SHALL 自动抓取当前网页的 URL 和网页标题，作为 Source 信息附加到条目
2. WHEN 用户在浏览器中划词，THE Selection_Monitor SHALL 自动抓取 Selected_Text 前后各两句话，作为 Context 信息附加到条目
3. WHEN 用户在本地软件（如 Word、PDF 阅读器）中划词，THE Selection_Monitor SHALL 记录当前软件名称和文件名作为 Source 信息
4. IF 无法获取 Source 信息，THEN THE Selection_Monitor SHALL 将 Source 字段记录为"来源未知"，不影响条目保存
5. IF 无法获取 Context 信息，THEN THE Selection_Monitor SHALL 将 Context 字段留空，不影响条目保存
6. THE Task_Manager_Window SHALL 在条目详情中展示 Source 和 Context 信息

---

### Requirement 9: OCR 截图识别

**User Story:** 作为用户，我希望通过快捷键截图后自动识别文字并弹出保存菜单，以便捕获无法直接划词的内容。

#### Acceptance Criteria

1. WHEN 用户按下截图快捷键，THE App SHALL 进入截图选区模式，允许用户框选屏幕区域
2. WHEN 用户完成截图选区，THE OCR_Module SHALL 对选区图像进行文字识别，并在识别完成后将结果作为 Selected_Text 传递给 Overlay_Window
3. WHEN OCR 识别成功，THE Overlay_Window SHALL 显示与划词相同的 Popup，展示识别出的文字及分类保存按钮
4. IF OCR 识别失败或识别结果为空，THEN THE Overlay_Window SHALL 显示提示"未能识别文字，请重试"
5. WHEN OCR 识别耗时超过 5 秒，THE Overlay_Window SHALL 显示加载状态提示，识别完成后自动更新

---

### Requirement 10: AI 意图识别

**User Story:** 作为用户，我希望系统自动分析划词内容的意图，并给出智能建议，以便更快完成分类操作。

#### Acceptance Criteria

1. WHEN 用户划词后，THE AI_Analyzer SHALL 通过 API 对 Selected_Text 进行意图识别，并在 Popup 显示后 1 秒内返回结果
2. WHEN AI_Analyzer 识别 Selected_Text 包含时间或事件信息，THE Popup SHALL 在智能建议区域显示"建立日程提醒"选项
3. WHEN AI_Analyzer 识别 Selected_Text 为专有名词或外文，THE Popup SHALL 在智能建议区域显示翻译或解释，并提供"加入生词本/知识库"按钮
4. WHEN AI_Analyzer 识别 Selected_Text 为代码报错信息，THE Popup SHALL 在智能建议区域显示"加入 Bug 待解决列表"按钮
5. IF AI_Analyzer 请求超时或返回错误，THEN THE Popup SHALL 隐藏智能建议区域，不影响其他快捷操作按钮的正常使用
6. WHERE 用户已在设置中配置 AI API Key，THE AI_Analyzer SHALL 启用意图识别功能；否则 THE AI_Analyzer SHALL 跳过意图识别

---

### Requirement 11: 桌面便利贴

**User Story:** 作为用户，我希望将划词内容钉在桌面上作为视觉提醒，以便在工作时随时看到重要信息。

#### Acceptance Criteria

1. WHEN 用户点击 Popup 中的 [钉在桌面] 按钮，THE App SHALL 创建一个 Desktop_Sticky 窗口，将 Selected_Text 以极简样式置顶显示在屏幕边缘
2. THE Desktop_Sticky SHALL 始终置顶显示，不遮挡用户主要工作区域
3. WHEN 用户拖拽 Desktop_Sticky，THE App SHALL 允许用户将其移动到屏幕任意位置
4. WHEN 用户点击 Desktop_Sticky 上的关闭按钮，THE App SHALL 关闭该 Desktop_Sticky 窗口
5. THE App SHALL 支持同时显示多个 Desktop_Sticky 窗口
6. WHEN App 重启时，THE App SHALL 恢复上次关闭前仍处于显示状态的所有 Desktop_Sticky

---

### Requirement 12: 全局搜索台（Search Spotlight）

**User Story:** 作为用户，我希望通过全局快捷键快速搜索所有已保存的内容，以便在不打开主窗口的情况下迅速找到目标。

#### Acceptance Criteria

1. WHEN 用户按下 Alt+Space 快捷键，THE App SHALL 在屏幕中央显示 Search_Spotlight 搜索台
2. WHEN Search_Spotlight 处于显示状态，THE Search_Spotlight SHALL 接受用户键盘输入作为搜索关键词
3. WHEN 用户在 Search_Spotlight 中输入关键词，THE Search_Spotlight SHALL 在输入停止后 200ms 内展示匹配的条目，匹配范围包括 text、source、context 和 tags 字段
4. WHEN 用户在搜索结果中选中某条目并按下 Enter，THE App SHALL 打开 Task_Manager_Window 并定位到该条目
5. WHEN Search_Spotlight 处于显示状态且用户按下 Escape，THE App SHALL 隐藏 Search_Spotlight
6. WHEN Search_Spotlight 处于显示状态且用户在其区域外单击，THE App SHALL 隐藏 Search_Spotlight
7. WHILE Search_Spotlight 处于显示状态，THE App SHALL 将其保持在所有窗口的最顶层

---

### Requirement 13: 通知提醒

**User Story:** 作为用户，我希望为保存的条目设置定时提醒，以便在合适的时间回顾重要内容。

#### Acceptance Criteria

1. WHEN 用户为某条目设置提醒时间，THE Task_Store SHALL 将提醒时间持久化到该条目的 remindAt 字段
2. WHEN 系统当前时间到达条目的 remindAt 时间，THE App SHALL 通过系统通知推送提醒，通知内容包含条目文本的前 80 个字符
3. WHEN 用户点击系统通知，THE App SHALL 打开 Task_Manager_Window 并定位到对应条目
4. IF App 在 remindAt 时间点未运行，THEN THE App SHALL 在下次启动时立即推送所有已过期的提醒通知
5. WHEN 用户取消某条目的提醒，THE Task_Store SHALL 将该条目的 remindAt 字段清空并持久化

---

### Requirement 14: 插件模块支持

**User Story:** 作为用户，我希望软件支持插件扩展，以便接入第三方服务或自定义工作流。

#### Acceptance Criteria

1. THE Plugin_Manager SHALL 提供标准插件接口，允许插件注册为以下扩展点之一：Popup 快捷操作按钮、条目保存后处理、Search_Spotlight 结果来源
2. WHEN App 启动时，THE Plugin_Manager SHALL 扫描插件目录并加载所有有效插件
3. WHEN 插件加载失败，THE Plugin_Manager SHALL 记录错误日志并跳过该插件，不影响 App 其他功能的正常运行
4. THE Task_Manager_Window SHALL 提供插件管理界面，展示已安装插件列表及其启用状态
5. WHEN 用户在插件管理界面切换插件的启用状态，THE Plugin_Manager SHALL 立即生效，无需重启 App

---

### Requirement 15: 响应式布局与断点适配

**User Story:** 作为用户，我希望应用在不同窗口尺寸和浏览器开发模式下都能稳定使用，以便在桌面端主窗口缩放、窄宽度调试和不同显示环境中保持可读、可操作。

#### Acceptance Criteria

1. THE App SHALL 采用移动优先（mobile-first）的响应式设计策略，并基于 Tailwind CSS 官方断点体系实现布局适配
2. WHEN Task_Manager_Window 宽度小于 `md` 断点时，THE Task_Manager_Window SHALL 将侧边栏、列表区、详情区从多列布局调整为单列或分步展示，避免水平滚动
3. WHEN Task_Manager_Window 宽度位于 `md` 至 `lg` 之间时，THE Task_Manager_Window SHALL 保持内容可读，并允许侧边栏或详情区折叠、收起或降低默认占宽
4. WHEN Overlay_Window、Search_Spotlight 或 Popup 在较小视口中显示时，THE App SHALL 保证主要操作按钮、输入框和关闭操作始终可见且可点击，不因固定宽度导致内容溢出视口
5. WHEN Desktop_Sticky 在较小屏幕或窄窗口环境中显示时，THE Desktop_Sticky SHALL 限制默认尺寸并允许内容换行，避免超出屏幕边界
6. THE App SHALL 为至少以下断点场景提供验证：`<640px`、`640px-767px`、`768px-1023px`、`>=1024px`
7. THE App SHALL 保证在浏览器开发模式下可通过调整视口尺寸验证上述响应式行为，无需依赖 Tauri 真机环境
