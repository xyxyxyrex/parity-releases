const assert = require('node:assert/strict')
const { createHash } = require('node:crypto')
const { createReadStream } = require('node:fs')
const fs = require('node:fs/promises')
const path = require('node:path')
const http = require('node:http')
const { execFileSync, spawn } = require('node:child_process')
const { setTimeout: delay } = require('node:timers/promises')

const temp = process.env.RUNNER_TEMP
const location = path.join(temp, 'Parity Update Test')
const exe = path.join(location, 'Parity.exe')
const profile = path.join(process.env.APPDATA, 'Parity')
const marker = path.join(profile, 'updater-profile-marker.txt')
const candidate = path.join(temp, 'Parity-Setup-1.6.5.exe')
const report = { windows: process.env.ImageVersion, checkResults: [], source: 'loopback test feed' }
const kids = new Set()
const requests = []

async function until(action, description, timeout = 60_000) {
  const deadline = Date.now() + timeout
  let lastError
  while (Date.now() < deadline) {
    try { const result = await action(); if (result) return result } catch (error) { lastError = error.message }
    await delay(500)
  }
  throw Error(`Timed out: ${description}${lastError ? ` (${lastError})` : ''}`)
}

function launch(port, settings = {}) {
  const child = spawn(settings.executable ?? exe, [`--remote-debugging-port=${port}`, '--remote-debugging-address=127.0.0.1'], {
    env: settings.env ?? process.env,
    windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']
  })
  for (const stream of [child.stdout, child.stderr]) stream.on('data', data => {
    for (const line of data.toString().split(/\r?\n/)) {
      if (/install|updat|elevat|spaw[nw]/i.test(line) && !/token|authorization|credential|password/i.test(line))
        console.log(line.replace(/https?:\/\/\S+/g, '[url]').slice(0, 300))
    }
  })
  kids.add(child)
  child.once('exit', () => kids.delete(child))
  child.once('error', () => kids.delete(child))
  return child
}

async function evaluate(port, expression) {
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(3000) })).json()
  const tab = tabs.find(item => item.type === 'page' && item.url.startsWith('file:') && item.url.includes('/renderer/index.html'))
  if (!tab) throw Error('Installed Parity renderer is unavailable')
  const socket = new WebSocket(tab.webSocketDebuggerUrl)
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => finish(Error('Installed renderer evaluation timed out')), 180_000)
    function finish(error, value) {
      clearTimeout(timeout)
      socket.close()
      if (error) reject(error)
      else resolve(value)
    }
    socket.addEventListener('open', () => socket.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, returnByValue: true, awaitPromise: true } })))
    socket.addEventListener('error', () => finish(Error('Renderer debugging connection failed')))
    socket.addEventListener('close', () => finish(Error('Renderer debugging connection closed')))
    socket.addEventListener('message', ({ data }) => {
      const message = JSON.parse(data)
      if (message.id !== 1) return
      if (message.error || message.result?.exceptionDetails) finish(Error(message.result?.exceptionDetails?.exception?.description || 'Installed renderer evaluation failed'))
      else finish(null, message.result.result.value)
    })
  })
}

async function main() {
  const manifest = await fs.readFile(path.join(temp, 'latest.yml'))
  const bytes = await fs.readFile(candidate)
  const digest = createHash('sha512').update(bytes).digest('base64')
  assert.match(manifest.toString(), /^version: 1\.6\.5\r?$/m)
  assert.ok(manifest.toString().includes(digest))
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1').pathname
    if (url === '/latest.yml') { requests.push(url); response.end(manifest); return }
    if (url === '/Parity-Setup-1.6.5.exe') {
      requests.push(url)
      response.writeHead(200, { 'Content-Length': bytes.length })
      createReadStream(candidate).pipe(response)
      return
    }
    response.writeHead(404).end()
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    const originalConfig = await fs.readFile(path.join(location, 'resources/app-update.yml'), 'utf8')
    assert.match(originalConfig, /repo: parity-releases/)
    await fs.writeFile(path.join(location, 'resources/app-update.yml'), `provider: generic\nurl: http://127.0.0.1:${server.address().port}/\nupdaterCacheDirName: parity-installed-updater-test\n`)
    await fs.mkdir(profile, { recursive: true })
    await fs.writeFile(marker, 'persisted profile')
    const original = launch(39319)
    const status = await until(() => evaluate(39319, 'window.electronAPI?.getUpdateStatus?.()'), 'Parity 1.6.4 startup')
    assert.equal(status.currentVersion, '1.6.4')
    report.checkResults.push('Public 1.6.4 desktop launched on the clean runner.')
    const result = await evaluate(39319, 'window.electronAPI.checkForUpdates()')
    assert.equal(result.state, 'available', JSON.stringify(result))
    assert.equal(result.version, '1.6.5')
    const downloaded = await evaluate(39319, 'window.electronAPI.downloadUpdate()')
    assert.equal(downloaded.state, 'downloaded', JSON.stringify(downloaded))
    assert.ok(requests.includes('/latest.yml') && requests.includes('/Parity-Setup-1.6.5.exe'))
    report.checkResults.push('Installed app discovered and downloaded exact 1.6.5 bytes via a loopback feed.')
    const acceptedInstall = await evaluate(39319, 'window.electronAPI.installUpdate()').catch(error => {
      if (!error.message.includes('connection closed')) throw error
    })
    if (acceptedInstall) assert.equal(acceptedInstall.success, true, JSON.stringify(acceptedInstall))
    await until(() => original.exitCode !== null, '1.6.4 exits to run the updater')
    const installed = path.join(location, 'resources/search-insights-collector/THIRD-PARTY-NOTICES.txt')
    await until(async () => createHash('sha256').update(await fs.readFile(installed)).digest('hex') === process.env.PARITY_NATIVE_NOTICES_SHA256, '1.6.5 installer finishes', 210_000)
    await until(async () => (await fs.readFile(path.join(location, 'resources/app-update.yml'), 'utf8')).includes('repo: parity-releases'), 'public feed restored by installed 1.6.5')
    assert.equal(await fs.readFile(marker, 'utf8'), 'persisted profile')
    report.checkResults.push('Updater installed 1.6.5, restored the shipped public feed and preserved the profile marker.')
    report.result = 'passed'
  } catch (error) {
    report.result = 'failed'
    report.error = error.message
    try {
      const diagnostics = execFileSync('pwsh', ['-NoProfile','-Command', `
        $processes = @(Get-Process -ErrorAction SilentlyContinue | Where-Object ProcessName -Match 'Parity|nsis' | Select-Object Id,ProcessName,Path,MainWindowTitle)
        $uninstall = @(Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*' -ErrorAction SilentlyContinue | Where-Object DisplayName -eq 'Parity' | Select-Object DisplayVersion,InstallLocation,UninstallString)
        @{processes=$processes;uninstall=$uninstall} | ConvertTo-Json -Depth 4
      `], { encoding: 'utf8', windowsHide: true, timeout: 15000 })
      report.diagnostics = JSON.parse(diagnostics)
    } catch (diagnosticsError) { report.diagnosticError = diagnosticsError.message }
    throw error
  } finally {
    for (const child of kids) child.kill()
    server.closeAllConnections()
    server.close()
    report.requests = [...new Set(requests)]
    await fs.writeFile(path.join(temp, 'parity-installed-updater.json'), JSON.stringify(report, null, 2) + '\n')
  }
}

module.exports = { evaluate, launch, until }
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1 })
