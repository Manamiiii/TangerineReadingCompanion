import path from 'node:path'
import { readFileSync } from 'node:fs'

const { version, build } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))
export const release = path.resolve(build.directories.output.replace('${version}', version))
export const setupPath = path.join(release, `TangerineReadingCompanion-${version}-win-x64-Setup.exe`)
export const appDirectory = path.join(release, 'win-unpacked')
export const appExecutable = path.join(appDirectory, build.win.executableName + '.exe')
