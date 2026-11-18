# Tauri 桌面端与发布流程

## 架构

- `desktop/`：React、Vite、TypeScript、Tailwind 与 shadcn/ui。
- `desktop/src-tauri/`：Tauri v2，负责 FastAPI 子进程的启动、状态查询、重启和退出回收。
- `server.py` / `module/server/`：现有 FastAPI 后端，新增 `/api/health` 健康检查。
- `scripts/ci/prepare_windows_runtime.py`：只在 CI 中组装 Windows Python 运行时。

开发模式下 Tauri 使用 `uv run --frozen python server.py`。发布模式下使用安装包内的
`runtime/python/python.exe`，该 Python 由 uv 下载，解释器来自 **python-build-standalone**。
FastAPI 源码、任务资源及锁定依赖分别放在 `runtime/app` 和独立 Python 中，用户不需要安装 Python。

打包版的配置、日志及错误截图写入 Tauri 用户数据目录；图片模板等只读资源仍从应用目录加载。

## 本地联调（不构建发布产物）

```bash
uv sync --frozen
uv run --frozen python server.py --host 127.0.0.1 --port 22267
cd desktop
npm ci
npm run dev
```

然后访问 `http://127.0.0.1:1420`。纯类型检查可以运行：

```bash
cd desktop
npm run typecheck
```

**禁止在本地执行生产构建或打包。** `desktop/package.json` 中的 `build` 与
`desktop:build` 均带 CI 环境保护，非 GitHub Actions 环境会直接退出。

## CI 与 Release

### dev 分支

`.github/workflows/desktop-dev.yml` 在每次推送到 `dev` 时触发：

1. 前端依赖安装及 TypeScript 检查。
2. uv 锁定依赖安装及 Python 测试。
3. 准备 python-build-standalone 运行时。
4. 构建 Windows x64 NSIS 安装包。
5. 上传 Actions Artifact，并发布独立的 **prerelease**，标签为
   `dev-<run_number>-<run_attempt>`。

每次推送使用独立的提交并发组；连续提交会并行生成各自的 prerelease，不会被后续提交取消。

### 标签发布

`.github/workflows/desktop-tag.yml` **只监听 `v*` 标签推送**，例如：

```bash
git tag v0.2.0
git push origin v0.2.0
```

该流程复用完全相同的 `.github/workflows/desktop-build.yml`，但发布为正式 Release，
并标记为 latest。标签中的前导 `v` 不会写入应用语义化版本号。

两个工作流都只需要仓库自带的 `GITHUB_TOKEN`，并已声明 `contents: write`。

## 后端载荷（backend payload）

同一次 CI 构建还会产出可独立更新的后端载荷：

- `oas-backend-<version>.zip`：`server.py`、`script.py`、`module/`、`tasks/`、
  `assets/`、`deploy/`、`config/template.json`、`config/findjade/` 和 `bin/`。
- `oas-backend-<version>.manifest.json`：版本、channel、sha256、文件数、
  `min_shell_version`、`config_schema`、签名。

载荷**不包含**用户配置（`config/oas*.json`、`deploy.yaml`）、日志、测试、
Tauri 壳和 Python 运行时，安装时写入独立版本目录并由壳原子切换。

签名算法为 Ed25519，使用的仓库 secret 是 `BACKEND_SIGNING_KEY`
（32 字节种子的 base64，或 PEM 私钥）。签名对象为 `"<version>:<sha256>"`。
未配置 secret 时 manifest 的 `signature` 为 `null`，仅用于开发构建；
正式发布应配置该 secret 并校验签名。

PR 检查会以仓库源码执行一次 dry-run（`scripts/ci/build_backend_payload.py`）
验证打包规则；正式载荷只由 `desktop-build.yml` 在 GitHub Actions 中生成。
