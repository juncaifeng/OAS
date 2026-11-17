import { Component, type ErrorInfo, type ReactNode } from "react"

interface Props {
  children: ReactNode
}

interface State {
  error?: Error
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = {}

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("OAS frontend render error", error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-8 text-foreground">
        <section className="w-full max-w-xl rounded-xl border bg-card p-8 shadow-lg">
          <p className="text-sm font-medium text-primary">OAS</p>
          <h1 className="mt-3 text-2xl font-semibold">界面暂时无法显示</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            前端组件发生异常。请重新加载界面；若问题持续出现，请将下方错误信息提交给开发者。
          </p>
          <pre className="mt-5 max-h-48 overflow-auto rounded-md bg-background p-4 text-xs whitespace-pre-wrap text-destructive">
            {this.state.error.message}
          </pre>
          <button
            className="mt-6 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            onClick={() => window.location.reload()}
          >
            重新加载
          </button>
        </section>
      </main>
    )
  }
}
