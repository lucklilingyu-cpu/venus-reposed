# Venus, Re-posed · 网站代码

Bartlett B-Pro Architectural Design · Workshop 7（V&A Cast Courts）小组项目的虚拟展厅和作品平台。

展厅石膏升级（2026-10-14）：开场序列中 20 件雕塑从本地原件按来源哈希重新匹配并生成更高面数模型，最高 36 万三角面；统一采用暖白哑光石膏，增加细微孔隙、移除陶瓷清漆反射。详见 [石膏精细模型](docs/石膏精细模型.md)。

2026-10-14 已同步新版图谱：118 件作品，117 件精细网格。展厅所有雕塑自动分批加载精细版，图谱单件也使用精细版，统一白色陶瓷渲染；详见 [图谱同步说明](docs/图谱同步.md)。运行 `node tools/check_atlas.mjs` 可校验所有网格及源文件哈希。新增模型编号请从 119 起使用，避免覆盖已同步的 106–118。

顶部「夜晚 / 白天」按钮可切换粉蓝夜景与日光展厅，带约 2.6 秒灯光渐变，自动记住这台设备的选择。详见 [昼夜灯光说明](docs/昼夜灯光.md)。

图谱已补齐 16 个空白作品名称，补充缺失年代并修正公元前年份；未确认的年代显示 `unknown`，原作与复制品年代分别说明。核查来源见 [图谱资料补充](docs/图谱资料补充.md)。

雕塑与底座的移动范围限制在水池外围绿色地砖内。重新生成序列会换用同姿势的其他雕塑，未使用雕塑随机交换剩余位置，带抬升光圈与落地脉冲；详见 [雕塑移动说明](docs/雕塑移动.md)。

- **网址**：https://lucklilingyu-cpu.github.io/venus-reposed/
  - 旧网址 venus-reposed.netlify.app 会自动跳转到这里。
- **代码仓库**：https://github.com/lucklilingyu-cpu/venus-reposed

在网站里点“步行”或直接按 W A S D，可以像游戏一样在展厅里走动、抬头看穹顶。

雕塑像国际象棋一样交错排在水面的棋盘格上（默认 21 件，各不相同）。生成新的一天时，底座按序列顺序一个接一个像棋子一样移到新格子（每步 2–3 秒），雕塑再碎片化生成。序列栏右上角可以切换排布轨迹：“第一个动作的骨架”或“S 形”。

这个仓库就是网站本身。提交到 `main` 分支的修改，大约 1 分钟后自动上线。不需要构建，也不需要 Netlify 或 Claude 账号。

---

## 两种“修改”，先分清

| 想做的事 | 在哪里改 | 需要什么 |
|---|---|---|
| 上传作品、写笔记、放模型、设默认序列 | 直接在网站的 **小组 GROUP** 里 | 什么都不需要 |
| 改网页本身：布局、颜色、文字、功能 | 改这个仓库里的代码 | 一个 GitHub 账号，并被邀请加入仓库 |

---

## 第一次：拿到修改代码的权限

1. 注册一个免费的 GitHub 账号：https://github.com/signup
2. 把你的 GitHub **用户名**发给仓库主人（lucklilingyu-cpu）。
3. 你会收到一封邀请邮件，点 **Accept invitation** 接受。
   - 也可以直接打开 https://github.com/lucklilingyu-cpu/venus-reposed/invitations

接受以后，就可以用下面任意一种软件修改。

---

## 选一种方式来改

### A. 只用浏览器（什么都不用装）

1. 打开仓库页面 https://github.com/lucklilingyu-cpu/venus-reposed ，在键盘上按 `.`（句号）。
   - 会打开网页版的 VS Code 编辑器。
2. 在左边找到要改的文件，直接修改（每个文件是做什么的，见下面的“文件在哪里”）。
3. 点左边的 **Source Control**（源代码管理）图标，就是三个圆点连线的那个。
4. 写一句说明，比如“展厅墙面换成暖白色”，然后点 **Commit & Push**。
5. 大约 1 分钟后，刷新网站就能看到。

只改一个文件时更简单：在仓库里点开那个文件 → 点右上角的铅笔图标 → 改完点 **Commit changes**。

### B. ChatGPT 里的 Codex（不用装软件，用中文说要改什么）

1. 打开 https://chatgpt.com/codex ，按提示连接 GitHub，选择仓库 `lucklilingyu-cpu/venus-reposed`。
2. 用中文描述想改什么，例如：“手机上把顶部按钮缩小一点。”
3. Codex 改完后，点 **Create PR**（创建拉取请求）。
4. 在 GitHub 上打开这个 PR，看一下改动，点 **Merge pull request**。大约 1 分钟后上线。

Codex 会自动读仓库里的 `AGENTS.md`，里面写清楚了这个项目的结构和规矩。

### C. 在自己电脑上改：终端 Codex、Claude Code、Cursor、VS Code 等

需要先装 **Git**（https://git-scm.com ）和 **Python 3**（https://python.org ，Windows 安装时勾选 “Add Python to PATH”）。

1. 第一次，把代码下载到电脑上：
   ```
   git clone https://github.com/lucklilingyu-cpu/venus-reposed.git
   cd venus-reposed
   ```
2. 用你喜欢的工具打开这个文件夹，比如：
   - 终端里运行 `codex` 或 `claude`，然后用中文说要改什么
   - 或者用 Cursor、VS Code 打开这个文件夹
3. 在本地预览：
   ```
   python -m http.server 8000
   ```
   然后用浏览器打开 http://localhost:8000 。
   - Mac 上如果 `python` 不行，就用 `python3`。
   - 不能直接双击 `index.html`，一定要像上面这样打开。
4. 改好后上线：
   ```
   git add -A
   git commit -m "写一句改了什么"
   git pull --rebase
   git push
   ```
   第一次 `push` 时会弹出 GitHub 登录窗口，登录一次就行。
5. 以后每次开始改之前，先运行 `git pull`，拿到别人的最新修改。

提交前可以检查一下有没有语法错误（需要 Node.js）：`node tools/check.mjs`

### D. GitHub Desktop（不想用终端）

1. 安装 https://desktop.github.com ，登录你的 GitHub 账号。
2. **File → Clone repository**，选 `lucklilingyu-cpu/venus-reposed`。
3. 用任何编辑器修改文件夹里的文件。
4. 回到 GitHub Desktop：
   - 写一句说明，点 **Commit to main**
   - 再点 **Push origin**
5. 每次开始改之前，先点 **Fetch origin / Pull origin**。

---

## 文件在哪里

| 位置 | 用途 |
|---|---|
| `index.html` | 页面结构：所有面板、按钮、弹窗的文字和排列 |
| `style.css` | 样式：颜色、字体、大小、手机版排版（`@media (max-width:760px)` 部分） |
| `js/01-data.js` | 姿势分类、示例日记、图谱数据载入 |
| `js/02-pose.js` | 火柴人姿势图标 |
| `js/04-scene.js` | 三维场景：灯光、材质、Cast Courts 展厅建筑（绿墙、柱廊、回廊、玻璃拱顶、日光） |
| `js/04b-casts.js` | 图拉真柱（两半、浮雕基座）和荣耀门廊复制品 |
| `js/05-seq.js` | 雕塑模型、白色陶瓷材质、展厅位置、替换规则、视图、镜头 |
| `js/05b-ribbons.js` | 表皮：石膏丝带。每件雕塑自己的姿态丝带，以及按序列缠绕雕塑的巨大丝绸丝带（一条宽主丝带 + 两条细丝带，起伏生长动画） |
| `js/06-ui.js` | 序列卡片、右侧资料面板、提示信息 |
| `js/06b-atlas.js` | “图谱 ATLAS” 浮层 |
| `js/07-inputs.js` | 文字日记解析、摄像头、视频 / 照片识别姿势 |
| `js/08-sound.js` | 声音 |
| `js/09-export.js` | 导出 |
| `js/09b-group.js` | “小组 GROUP”：数据库连接、作品列表、上传和编辑 |
| `js/09c-walk.js` | 步行模式：W A S D 行走、鼠标环顾、碰撞 |
| `js/10-main.js` | 按钮事件、漫游、启动 |
| `config.js` | 数据库地址和编辑码 |
| `data/`、`m/`、`t/` | 图谱的雕塑：数据、模型、缩略图（105 件 + 新收录；`data/atlas-extra.json` 是手动修正的姿势分类和新收录的模型） |
| `img/sketch.jpg` | 概念草图（目前没有挂在展厅里） |
| `supabase/setup.sql` | 数据库脚本（已经运行过，不用再运行） |
| `tools/` | 检查语法 `check.mjs`；重新生成图谱数据 `build_atlas.py`；加入一件新收录的扫描模型 `add_model.py` |
| `AGENTS.md` | 写给 Codex 等 AI 工具的项目说明 |

注意：

- **新建 js 文件**：要把文件名加进 `index.html` 最下面的 `PARTS` 列表，否则不会运行。
- **不要直接改 `m/` 和 `t/`**：它们由 `tools/build_atlas.py` 生成。新收录的模型用 `python tools/add_model.py 模型.stl 107` 生成，再把它打印出的记录填好、放进 `data/atlas-extra.json` 的 `records`（只收版权允许公开展示的模型，写上来源和署名）。

---

## 多人一起改的规矩

1. **先拿最新版**：开始改之前先 `git pull`。用网页版的话，每次从仓库页面重新按 `.` 打开。
2. **一次一件事**：一次只改一件事，提交说明写清楚改了什么。
3. **先打招呼**：两个人同时改同一个文件，可能会冲突。改大的东西前，先在群里说一声。
4. **大改动走 PR**：改动比较大时，用 Codex 的 PR，或者自己开一个分支提 PR，请另一位组员看过再合并。

## 上线了没有？

打开仓库的 **Actions** 标签，看最上面的 **pages build and deployment**：

- **绿色对勾**：已经上线，刷新网站即可（必要时按 Ctrl+F5 强制刷新）。
- **黄色圆点**：还在上线中。
- **红叉**：上线失败。多半是网络问题，点进去再点 **Re-run jobs**。

## 改坏了怎么办

- **每次提交都有记录**，任何旧版本都能找回。组员上传的作品存在数据库里，改代码不会删掉它们。
- **网站打不开或报错时**，打开浏览器的开发者工具（F12 → Console）看错误信息，然后撤销出问题的那次修改：
  - **如果是合并的 PR**：在那个 PR 页面点 **Revert**，再合并自动生成的新 PR。
  - **如果是直接提交**：让 Codex 帮忙，比如说“撤销最近一次提交”；或者在自己电脑上运行：
    ```
    git revert <提交编号>
    git push
    ```

---

## 数据库和编辑码

- **作品数据**：作品、署名、默认序列存在 Supabase 项目 `venus-reposed` 里（仓库主人的 Supabase 账号）。
- **谁能编辑作品**：由 `config.js` 里的 `editCode` 决定。
  - **现在填着**：任何打开网址的人，都能在网站里添加、修改作品。
  - **删掉这一行**：改回“组员登录”模式，要输入编辑码才能编辑。
- **仓库是公开的**：`config.js` 和 `supabase/setup.sql` 里的编辑码，任何人都能看到。
  - 如果以后改回“组员登录”模式，要同时换一个新编辑码。
  - 新编辑码只在 Supabase 的 SQL Editor 里运行，不要写进仓库。
  - 运行这一句（把引号里的内容换成新编辑码）：
    ```sql
    insert into public.settings (id, code_hash)
    values (1, extensions.crypt('新的编辑码', extensions.gen_salt('bf', 8)))
    on conflict (id) do update set code_hash = excluded.code_hash;
    ```
- **免费额度**（以 Supabase 官网为准）：
  - 数据库 500 MB
  - 文件存储 1 GB
  - 单个文件最大 50 MB
- **项目暂停**：免费项目连续一周没人使用会被暂停。登录 Supabase 打开项目，点 **Restore** 就能恢复，数据不会丢。

从零重新搭一套（新的数据库和网址），见 `docs/重新搭建.md`。
