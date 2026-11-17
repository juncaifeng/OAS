if (process.env.GITHUB_ACTIONS !== "true") {
  console.error("禁止在本地构建或打包。请推送 dev 或 v* 标签，由 GitHub Actions 生成发布产物。")
  process.exit(1)
}
