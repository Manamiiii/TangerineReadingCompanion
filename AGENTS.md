# Tangerine Reading Companion · Codex Agent Instructions

## 跨项目共同规范

- 本项目属于通用开源工具：保留独立 Windows x64 交付和 GPL v3 分享定位，不新增账户、云同步、遥测、广告或付费能力；保持本项目现有技术栈和数据契约。
- 若父目录存在适用于本项目的 `../AGENTS.md`，开始工作及交付前读取其“共享开发规范”和本项目类别的产品、发布边界；同时读取本项目已有的本机附加约束。父目录统筹会话的“只读复核”不限制本项目已获授权的开发，分支、提交、推送和必跑检查仍按本项目规则执行。
- 父目录文件不是构建或运行依赖。独立克隆或 CI 中缺失时，按本文件及仓库文档继续，不阻塞构建、不下载私有规则、不写入机器绝对路径。
- 保护未提交改动和真实数据；自动化使用隔离临时数据与替身，保留稳定身份、数据兼容和恢复记录。超时或通信失败不等于未执行，核对结果后再重试；维护前确认进程、路径、快捷方式和注册项归属，不接管其他实例。
- 保留项目安全检查和许可声明，提交前检查实际暂存内容，打包时检查真实载荷；不以关闭保护或强制升级依赖消除失败。不绕过审批拒绝。
- 按实际版本报告源码、成品、测试身份安装、正式身份安装、干净系统和真实设备/服务的验证范围；不适用则说明。CI 包与本地包、模拟与真机、fixture 升级与历史迁移不能互相替代。
- README 和专题文档说明当前行为，长期规则放在本文件；保留必要的来源、兼容与验证证据。发现共同方向的偏差时，在本项目授权范围内修正并报告跨项目影响，不擅自修改其他仓库或向其他会话发指令。
- 完成交接说明结果、验证、未完成事项和下一步；能自主完成的检查自行完成，确需用户操作时给最少步骤与预期结果。源码推送不等于发布授权；未经明确授权，不创建 Release、上传或替换公开资产、启用新部署或接入签名服务。


## Positioning

This repository is a local-first personal reading companion built with Vite, React 19, Dexie.js and Leaflet. It is a static frontend with no backend. It preserves reading progress, reader-confirmed memories and personal map positions while enforcing spoiler boundaries.

## Required reading

Before code changes, inspect the current branch, working tree and latest commit, then read:

- `docs/system-capabilities.md` for implemented scope and non-goals.
- `docs/data-sync.md` before changing IndexedDB, backup, import or migration behavior.
- `docs/product-and-architecture.md` before changing books, progress, maps, OCR or spoiler controls.
- `docs/model-prompts.md` before changing prompts or model data permissions.

## Main branch workflow

- New sessions work directly on `main` by default. Before changes, inspect the working tree, run `git switch main`, and synchronize with `git pull --ff-only origin main`.
- Preserve any existing user changes. If the working tree is dirty, `main` cannot be selected safely, or the pull is not a fast-forward, stop and report the condition instead of discarding or rewriting work.
- Do not create feature branches, worktrees or pull requests unless the user explicitly requests them.
- After a verified development batch, stage only the scoped files, create an intentional commit on `main`, and push with `git push origin main`.
- Push to the HTTPS `origin` through Git Credential Manager (`credential.helper=manager` on Windows). Let GCM obtain and cache credentials; never embed access tokens in remote URLs, commands, files or logs. If GCM is unavailable or authentication fails, stop and report the issue instead of switching to inline credentials.
- Never force-push `main`, rewrite published history or bypass branch protection. If direct push is rejected, report the protection or permission requirement and wait for user direction.

## Hard boundaries

- Do not change the Dexie schema version unless the user explicitly requests it.
- Backup import is merge-by-key. Missing local records remain; do not implement clear-and-replace.
- Do not persist pasted excerpts, screenshots, OCR text, model contents or spoiler authorization.
- Formal packages use staging, preview and explicit apply. Do not publish unaudited facts or guess reveal boundaries.
- Fictional or ambiguous places must not receive fabricated precise coordinates.
- Runtime models may create bounded candidates and explanations only; they cannot publish formal facts.
- API keys remain in session storage and must not enter exports, logs or source control.
- Machine-specific paths, credentials, shortcuts, personal backups and local reports must not be committed. Resolve installation paths at runtime; keep optional local files in ignored `.private/`, never under `public/`. Run `npm run check:privacy` before committing; it reports locations without printing matched values. CI is a second check, not protection against secrets already pushed into history.

## Verification

Use Node.js `^20.19.0 || >=22.12.0`. Run checks relevant to the change:

```bash
npm run lint
npm test
npm run build
git diff --check
```

For package work also run `npm run check:packages`; use `npm run check:preset` before a formal apply.

## Documentation and delivery

- README is the authoritative command and structure map.
- Topic documents describe current behavior, provenance, active constraints and unresolved decisions.
- Generated reports belong in ignored `artifacts/`.
- Avoid transition diaries; Git history records implementation history.
- After a verified development batch, commit and push `main`, report the commit and push status, and include a short next step.
