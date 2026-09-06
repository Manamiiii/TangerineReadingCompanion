import { useEffect, useRef } from 'react'
import { createAsyncTask } from './asyncTask.js'
import { platform } from './index.js'

export function useAsyncTask(context) {
  const task = useRef(null)
  if (!task.current) task.current = createAsyncTask()
  useEffect(() => {
    const owner = task.current
    const unsubscribe = platform.appLifecycle.subscribe(event => {
      if (event === 'exit') owner.cancel()
    })
    return () => { owner.cancel(); unsubscribe() }
  }, [context])
  return task.current
}
