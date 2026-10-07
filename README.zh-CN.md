# Presenter 使用说明

English: [README.md](README.md)。Presenter 的界面只有英文；本说明里的按钮名称用界面上的英文原文。

Presenter 是一个桌面放映工具。它把课件（HTML、PDF、PPT、PPTX、Keynote）和程序窗口（浏览器、视频……）放到一块或多块投影上，并在笔记本上显示控制台。它支持 Windows 和 Mac，免费，不需要安装。

## 下载

最新的压缩包在 **[Releases 页面](https://github.com/vizenxx/presenter/releases/latest)** 的 **Assets** 里：Windows 用 `…-win.zip`，Mac 用 `…-mac.zip`。任何人都能打开这个页面，把链接发给其他老师即可。

## 打开（不需要安装）

Presenter 是一个解压即用的文件夹。没有安装程序，也不需要管理员密码。

**Windows**

1. 右键点 `Presenter-0.1.0-win.zip` → **全部解压缩**。文件夹可以放在任何地方，例如“文档”。
2. 在文件夹里双击 **Presenter**（带 Presenter 图标的那个文件）。大约 2 秒打开。
3. 想要桌面图标：右键点 **Presenter** → **显示更多选项 → 发送到 → 桌面快捷方式**。
4. 程序没有签名。压缩包从网上下载时，Windows 可能显示“Windows 已保护你的电脑”：点 **更多信息 → 仍要运行**，只需要一次。

**Mac**（macOS 13 Ventura 或更新版本，Intel 或 Apple 芯片都可以）

1. 双击 `Presenter-0.1.0-mac.zip`，得到 **Presenter**。双击它打开（放进“应用程序”不是必须的）。
2. 第一次打开时，macOS 可能提示无法检查这个 App。打开 **系统设置 → 隐私与安全性**，向下滚动，点 **仍要打开**。只需要一次。
3. PPT 和 PPTX 通过 **Keynote**（每台 Mac 都有，免费）转换。第一次会提示“Presenter 想要控制 Keynote”，点 **好**。转换时 Keynote 会打开一个窗口，转换完自动关闭。没有 Keynote 时，也可以用 LibreOffice。
4. Mac 快捷键：**⌘ Return** 或 **fn F5** 开始投影；**⌘ +**、**⌘ −**、**⌘ 0** 调字号；**⌘ Z** 撤销标注；**delete** 清空标注。
5. 在 **系统设置 → 隐私与安全性** 里允许 Presenter：
   - **录屏与系统录音**：投影程序窗口（以及在列表里显示窗口标题）、控制台的实时投影画面都需要它。允许后重新打开 Presenter。
   - **辅助功能**（可选；加第一个程序窗口时 Presenter 会提示）：让 Presenter 精确调出你选的那个窗口，并还原最小化的窗口。不允许时，改为把整个程序带到前面。

## 控制台一览

| 区域 | 作用 |
|---|---|
| 顶部栏 | **Open deck**、**Recent**、**🎲 Name picker**、**📘 Guide**、**☀ / ☾**（浅色或深色界面）、**▶ Start projecting** |
| 当前页（左） | Projector 1 正在放的内容。投影前直接显示课件；投影时实时显示观众看到的画面。上方是标注工具 |
| Next slide（右） | 选中卡片的下一页。点它可以继续往后翻看 |
| Class timer | 课堂计时器，观众在投影上能看到 |
| My timer | 你自己的计时器，只有你看得到 |
| Slides / Notes | 选中卡片的目录和讲者备注（按钮在当前页上方） |
| 底部栏 | 每份内容（课件或程序窗口）一张卡片，卡片上有 **Projector ▾** 按钮。最后是 **＋ Add screen** |

程序里的 **📘 Guide** 有同样的说明，分两部分：**1 · Use Presenter**（“我想…… → 这样做”）和 **2 · Prepare decks**（准备课件）。

## 开始

1. 把课件文件拖进控制台窗口，或者点 **Open deck**。没有课件时，在开始画面点 **Show a program window…**，把浏览器、视频或任何打开的程序窗口直接放到 Projector 1。
2. 点右上角的 **▶ Start projecting**，或者按 **F5**。Projector 1 全屏显示到投影仪上。
3. 点 **■ Stop projecting**，或者按 **Esc**。投影关闭，控制台里的内容都还在。
4. 投影仪必须设为“扩展”模式。没有接投影仪时，投影会以一个普通窗口显示，适合在家练习。

### 别人做的 HTML 课件

- 用 **Reveal.js**、**remark**、**impress.js** 或 **Marp** 做的课件会自动接入：页数、目录、备注和精确跳页都能用。
- 每页一个 `.slide` 元素、当前页带 `active` 标记的普通网页课件也会自动接入：页数、标题、讲者备注（例如 `data-speaker-script`、`.notes`）和计划时长都能读到。
- 其他 HTML 课件用 **Key mode**：方向键翻页，程序不知道总页数，所以卡片上只显示当前页码。
- 想让新课件完整兼容：按 [docs/protocol.md](docs/protocol.md) 做，或者从 [examples/minimal-deck.html](examples/minimal-deck.html) 改；用 AI 做课件时，把 [docs/ai-integration.md](docs/ai-integration.md) 里方框中的英文整段贴在你的要求后面（Guide 里可以一键复制）。

### PPT、PPTX、Keynote 和 PDF

- 程序先把 PPT 转成放映格式。第一次打开一份 PPT 需要十几秒，控制台顶部会显示进度。之后再打开同一份 PPT 会直接显示。
- 转换用 PowerPoint（Windows）或 Keynote（Mac），都没有时用 LibreOffice。三者都没有时，请先把 PPT 另存为 PDF。
- 每页只显示最终画面：“点一下出现一条”的动画和视频不会播放。
- 隐藏的幻灯片不会显示，和 PowerPoint 放映时一样。
- PPT 里的标题会出现在 **Slides** 里，讲者备注会出现在 **Notes** 里。

## 翻页

- 翻页笔、方向键、PageUp / PageDown、空格键都可以翻页。Home 键回到第一页，End 键跳到最后一页。
- **选中的卡片会翻页。** 它勾选了 **Linked** 时，所有勾选了 Linked 的卡片一起翻；没勾选时，只有它自己翻。
- 选中的方法：点卡片，或者点它的画面。选中的卡片有蓝色边框。
- 卡片上的 **−** 和 **+** 只移动这一张卡片，例如调整两份课件之间差几页。
- **Next slide** 显示选中卡片的下一页。点它就能继续往后翻看：翻页键只翻预览，观众看到的画面不变。点当前页或任意卡片就回来。

## 内容和投影

- 底部每张卡片是一份**内容**（课件或程序窗口），它自己记住翻到第几页。
- **＋ Add screen** 加一份内容：同一份课件、另一份课件，或 **A window on this computer**（电脑上的程序窗口）。新加的内容先**待用**，不会弹出任何窗口。
- 卡片上的 **Projector ▾** 按钮决定观众在哪里看到它：
  - **Projector 1**：主投影。
  - **Projector 2、3……**：你开的其他投影。
  - **New projector**：第二块投影或电视。有空闲显示器时在上面全屏打开，没有就开成普通窗口。
  - **Not shown**：不显示，待用。
- 每块投影一次放一份内容。被换下来的内容回到待用，**进度保留**，换回来接着放。
- 同一个菜单里有 Projector 2、3……的**全屏**和**关闭**。关闭一块投影后，它上面的内容回到待用。
- **只点卡片是“选中”**：翻页键、Next slide 和 Notes 跟着它，观众看到的画面不变，可以用来悄悄翻看待用的课件。
- 课件卡片的 **⋯** 菜单里有字号和 **Remove**；窗口卡片上有 **✕**。
- Projector 按钮上的绿点表示观众现在看得到这份内容。

## 程序窗口

- **＋ Add screen → A window on this computer**（或开始画面的 **Show a program window…**）会列出所有程序窗口，最小化的也在里面，和 Zoom 一样。
- 真窗口留在你的笔记本上，你照常操作它；投影显示它的实时画面。
- 加进来或点它的卡片，都不会动真窗口。给它选一块投影时，窗口才来到最前面（最小化的会还原）。
- 翻页和备注对窗口不适用。点卡片上的 **✕** 移除。
- Mac 上需要“录屏与系统录音”权限；要精确调出某个窗口还需要“辅助功能”权限（见“打开 → Mac”）。在其他桌面空间里的窗口也算作最小化。

### 浮动工具条

投影上的程序窗口在最前面时，屏幕上方会浮出一条小工具条：

- 标注工具。选画笔后直接在真窗口上画，笔迹同步显示在投影的窗口画面上；选回鼠标就照常操作窗口。
- 在窗口上画的时候，键盘交给工具条：**Ctrl+Z**（Mac：⌘Z）撤销笔迹，**Esc** 回到鼠标，键盘还给窗口。
- **⏱**：课堂计时器。计时中直接显示剩余时间，点它展开设置。
- **🎲 Roll**：随机点名，点中的名字显示在按钮旁边。
- **Mine**：My timer 的时间，在控制台开始计时后才出现。
- 点 **◂** 收起，拖 **⠿** 移动。

观众看不到这条工具条。切回控制台或别的程序时，它自动隐藏。

## 标注

当前页上方有一排工具：**Pointer**（鼠标）、**Pen**（画笔）、**Highlighter**（荧光笔）、**Box**（框选）、**Arrow**（箭头）、**Laser**（红点）、**Eraser**（橡皮擦），6 种颜色，以及 **Undo** 和 **Clear**。

- 在控制台的课件画面上画，或者直接在投影屏上画，两边同时显示同样的笔迹。
- 投影时，鼠标在投影屏上移动，左下角会出现一个小工具条，几秒后自动隐藏。
- 课件上的笔迹翻页就清除。程序窗口上的笔迹一直保留，直到你点清空，或这个窗口离开它的投影。
- **Arrow**：从箭头起点拖到它指向的位置。箭头尖是开口的 V 形。
- 画的时候按住 **Shift**：画笔和荧光笔只画一条直线（任意角度），框选变成正方形，箭头按 45° 转向。
- 控制台和浮动工具条的快捷键：**P** 画笔、**H** 荧光笔、**R** 框选、**A** 箭头、**L** 红点、**E** 橡皮擦、**Ctrl+Z**（Mac：⌘Z）撤销、**Delete** 清空。
- 在课件画面上点过之后（控制台里或投影屏上），**Ctrl+Z** 和 **Esc** 也有效。
- 任何画笔状态下按 **Esc** 都回到鼠标；在控制台里再按一次 **Esc** 停止投影。

## 计时器

**Class timer**（观众看得到）

- 点 **1 min**、**5 min** 等按钮立即开始，或者输入分钟数再点 **Start**。
- 课件为某一页设定了计划时长时，计时器会显示出来。
- 剩 1 分钟时“滴滴”响两声；最后 5 秒每秒“滴”一声。
- 时间到后铃声一直响，按任意键或点击任意处停止。停止铃声的这次按键不会翻页。
- UXD202 课件用课件底部自带的计时器显示时间；其他内容在投影右下角显示。

**My timer**（只有你看得到）

- **Count up**（正计时）或 **Count down**（倒计时），用来把握讲课节奏。它不会响铃。
- 倒计时过了零点会继续走，红色显示 **Over time**。
- 计时中，浮动工具条上也会显示它的时间。

## 随机点名

点顶部的 **🎲 Name picker**，选择名单，再点 **🎲 Roll**：名单在投影上依次高亮滚动，逐渐变慢，最后停在一个人身上。停下后按任意键或点一下，点名画面收起。这一下不会翻页。

- 没点到过的人，被点到的机会相同。勾选“People already picked can be picked again (small chance)”时，点到过的人仍可能再被点到，但概率很低。
- **Picked so far: X of Y** 显示已点到的人数；点 **↺ Reset** 并确认后，所有人都变回“没点到”。点名记录只在程序打开期间保留。
- 第一次打开时只有一份示例名单：点 **Edit**，换成你的班级（每行一个人，前面的编号可以不写）。点 **New** 可以再建一份名单。名单会保存下来。
- 没有投影时，只有你看得到点名结果（在控制台里，或浮动工具条的 **Roll** 旁边）。

## 浅色或深色界面

顶部栏的 **☀ / ☾** 把控制台和浮动工具条切换成浅色或深色。Presenter 会记住你的选择；没选之前，跟随电脑的设置。投影画面不变。

## 字号

**Text size**（Ctrl + / Ctrl − / Ctrl 0；Mac 用 ⌘）放大或缩小 HTML 课件，并按课件文件记住。Projector 1 的字号在当前页上方，其他课件在卡片的 **⋯** 菜单里。PPT 和 PDF 按整页显示，字号对它们不适用。

## 常见问题

- **列表里找不到某个窗口**：先打开那个程序（最小化也可以）。Presenter 自己的窗口不会出现在列表里。
- **PPT 打不开**：安装 PowerPoint、Keynote（Mac）或 LibreOffice 其中之一，或者先把 PPT 另存为 PDF。
- **控制台一直停在 “Starting…”**：先不要关掉程序，把程序数据文件夹里的 `startup-log.txt` 发给维护者（Windows：`%APPDATA%\presenter`；Mac：`~/Library/Application Support/Presenter`）。它会显示停在了哪一步。

## 给维护者

- 源码：`src/`。设计文档：`docs/specs/`。实施计划：`docs/superpowers/plans/`。
- 常用命令：`npm run build`（构建）、`npm test`（单元测试）、`npm run e2e`（端到端测试，17 步；接着第二块屏幕时，它隐藏、静音运行，并跳过投影步骤）。
- 不开窗口的检查：`npm run check:viewer`（PPT/PDF）、`npm run check:ink`（标注）、`npm run check:frameworks`（Reveal.js、remark、impress.js、Marp、普通 slide 网页、协议示例）、`npm run check:console`（控制台排版、菜单、开始画面、浮动工具条）、`npm run check:start`（隐藏静音启动，逐个启动和 8 个同时启动）。
- 真实转换测试：`PRESENTER_CONVERT_IT=libreoffice npm test`（或 `powerpoint`；Mac 上用 `keynote`）。
- 压缩包：`npm run dist:win`（Windows）、`npm run dist:mac`（只能在 Mac 上运行）。没有 Mac 时，在 GitHub 上运行 **Build app zips** 工作流（`.github/workflows/build.yml`），它同时生成两个压缩包，并替换这个版本的 Releases 页（说明文字：`.github/release-notes.md`）。发新版本时先改 `package.json` 里的 `version`。图标源文件：`build/icon.svg`。
- 在维护者的电脑上，桌面图标启动的是源码版（`Start Presenter.bat`）：修改源码后必须运行 `npm run build`。
