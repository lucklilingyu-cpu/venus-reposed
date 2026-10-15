# 2026-10-15：8018 分类音乐与 60 秒版本发布

以 8018 实际服务目录为源，已完整备份；与远程最新 b064e983b6c6acdb9d12c82ae2bb5956b178162d 基础文件 Git blob 哈希核对一致。保留队友已合入的展示模式和两秒日记指引。仅加入分类选曲、统一 60 秒上限、缓存标识及相关检查记录，不调整视觉。六分类 84 首分别组成 45/24/15 三个池；详细规则和验证限制见 [分类音乐](docs/分类音乐.md)。

最终部署工作流、提交 SHA 和线上下载核对结果由发布完成后的本地 RELEASE_RESULT.md 记录。下方为此前发布历史，其中 30 秒为旧版本说明，不是当前运行配置。

---

# Venus 随机音乐发布记录 — 2026-10-15

源预览：http://127.0.0.1:8017/venus-reposed/ ，实际目录 venus-random-music-20261015/site；不是 8016 历史预览。
基线：ac2dd8c2a372682c3e45dbcf7ab1c02556c07aa0；发布前远程 main 与该基线一致，基础文件 Git blob 哈希逐项匹配。
备份：本机临时目录 venus-music-release-20261015/preview-backup；另保留原 backup-before-music 与 backup-before-camera。

已完成：图片、文字、Camera 复用单一 HallMusic 播放器及六分类 84 首去重曲目。真正棋盘移动回调触发音乐，从实际 playing 起最多 30 秒；下一有效输入取消旧任务和计时；摄像头保留原 2 秒确认及去抖。关闭 Camera 只清理其拥有的任务；旧权限和识别/播放回调受会话与任务令牌保护。原背景音与新音乐互斥，操作声音入口保留。播放被浏览器阻止时显示“开启声音”，网络失败有界重试。

本次不改变模型、材质、透明度、马赛克地面、雕塑位置、界面或棋盘路径/时序。保留 Surface、Atlas、日记、丝带及队友已合入的其他功能。沿用内容哈希扫描模型、配置、材质策略及本地 Draco 路径；为修改模块与音乐清单增加内容哈希查询版本，防止旧脚本缓存混用。

发布前检查：84/84 公共 HTTPS 音频在无登录、无 Cookie、无临时令牌条件下返回真实媒体字节；无本机或历史目录 URL。图片/文字实际业务函数与棋盘首帧测试、Camera 确认/去抖/切换/过期回调测试、30 秒可控时钟测试、授权失败及音效互斥检查通过。20 模块生产/调试转换解析、棋盘及日记指引检查通过。静态站点无打包步骤。

实机限制：没有可用浏览器（apps: [], browsers: []）。真人摄像头识别、实际试听和浏览器内三种输入端到端播放仍未验证；模拟测试及媒体 HTTP 检查不等于实机验证。

GitHub Pages 部署及线上资源校验结果由发布执行结束时另存于本地 RELEASE_RESULT.md，最终回复提供提交 SHA、明确部署状态与正式链接。

Concurrent update: main advanced to 62eaf89ab37fe27c34a4291b49432a6d057553b8 while publishing. Merged its diary display modes, labels, styles, lighting and instructions; retained both music input listeners and diary mode listeners. Commit is based on this new head; no branch rollback or force update.
