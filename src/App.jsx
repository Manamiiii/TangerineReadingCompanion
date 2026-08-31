import { ReaderTool } from './features/reading-companion/index.js'
import { OfflineStatus } from './components/OfflineStatus.jsx'
import { ReadingDataManager } from './components/ReadingDataManager.jsx'

export default function App() {
  return <div className="app-shell reader-app-shell">
    <header className="app-header reader-app-header">
      <div><strong className="app-brand reader-app-brand">Tangerine Reading Companion</strong><span className="reader-app-subtitle">橘子阅读伴侣</span></div>
      <ReadingDataManager />
    </header>
    <OfflineStatus />
    <main className="app-main reader-app-main"><ReaderTool /></main>
  </div>
}
