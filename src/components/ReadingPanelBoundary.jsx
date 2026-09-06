import { Component, Suspense } from 'react'
import { platform } from '../platform/index.js'

// Keep ReaderTool and its ephemeral input mounted when an old lazy chunk is gone.
export class ReadingPanelBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() { return { failed: true } }

  render() {
    if (!this.state.failed) return <Suspense fallback={this.props.fallback}>{this.props.children}</Suspense>
    return <section className="reader-empty-state" role="alert">
      <strong>此面板暂时无法加载</strong>
      <p>可以返回阅读输入继续使用当前内容，或联网后刷新页面。</p>
      <button type="button" className="btn" onClick={() => platform.appLifecycle.reload()}>刷新页面（清空当前临时输入）</button>
    </section>
  }
}
