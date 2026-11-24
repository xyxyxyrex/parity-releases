const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const http = require('node:http')
const path = require('node:path')
const { evaluate, launch, until } = require('./verify-updater.cjs')

const port = 39320
const ids = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002']
const users = ids.map((id, index) => ({ id, email: `account-${index}@example.test`, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() }))
const userFor = user => ({ ownerKey: `parity:${user.id}`, authUserId: user.id, email: user.email, name: user.email })
const tokens = new Map()
let signInAs = 0
const report = { image: process.env.ImageVersion, auth: 'local synthetic account service', checks: [] }

function createSession(user) {
  const expiration = Math.floor(Date.now() / 1000) + 3600
  const token = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({sub:user.id,email:user.email,exp:expiration})).toString('base64url')}.fixture`
  tokens.set(token, user)
  return { access_token: token, refresh_token: `fixture-${user.id}`, expires_in: 3600, token_type: 'bearer', user }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1')
  const reply = (value, status = 200) => response.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(value))
  if (url.pathname === '/auth/v1/settings') return reply({ external: { google: true } })
  if (url.pathname === '/auth/v1/authorize') {
    const destination = 'http://127.0.0.1:51848/account/oauth/callback'
    if (url.searchParams.get('redirect_to') !== destination) return reply({}, 400)
    return response.writeHead(302, { Location: `${destination}?code=fixture-code` }).end()
  }
  if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'pkce') return reply(createSession(users[signInAs]))
  if (url.pathname === '/auth/v1/logout') return reply({})
  const user = tokens.get((request.headers.authorization || '').replace('Bearer ', ''))
  if (!user) return reply({ message: 'Unauthorized' }, 401)
  if (url.pathname === '/auth/v1/user') return reply(user)
  if (url.pathname === '/functions/v1/parity-account-v2') {
    let text = ''
    for await (const chunk of request) text += chunk
    const { action } = JSON.parse(text)
    if (action === 'status' || action === 'initialize') return reply({ user: userFor(user) })
    return reply({ error: 'Fixture only implements account identity' }, 404)
  }
  reply({ error: 'Fixture route not found' }, 404)
})

const api = (method, ...args) => evaluate(port, `window.electronAPI.${method}(...${JSON.stringify(args)})`)
const request = (owner, command) => api('searchInsights.request', command, owner)
const kill = async child => {
  const exited = new Promise(resolve => child.once('exit', resolve))
  if (child.exitCode === null && child.signalCode === null) { child.kill(); await exited }
}

async function main() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const options = {
    executable: path.join(process.env.RUNNER_TEMP, 'Parity Recovery Test', 'Parity.exe'),
    env: {
      ...process.env,
      VITE_SUPABASE_URL: `http://127.0.0.1:${server.address().port}`,
      VITE_SUPABASE_ANON_KEY: 'parity-fixture-key'
    }
  }
  const ready = () => until(() => api('getUpdateStatus'), '1.6.5 installed renderer starts')
  let child
  try {
    child = launch(port, options)
    assert.equal((await ready()).currentVersion, '1.6.5')
    const first = (await api('accountLoginGoogle')).user.ownerKey
    assert.equal(first, userFor(users[0]).ownerKey)
    const site = await request(first, { action: 'save-site', site: { name: 'Recovery fixture', url: 'https://example.test', projectIds: [] } })
    const [keyword] = await request(first, { action: 'save-keywords', siteId: site.id, keywords: ['fixture query'], location: 2608, device: 'desktop', language: 'en', tags: [] })
    const observation = await request(first, { action: 'serp-import', siteId: site.id, keywordId: keyword.id, label: 'Synthetic installed recovery fixture', text: JSON.stringify({ depth: 10, maxPages: 1, items: [{ type: 'organic', rank_group: 1, rank_absolute: 1, page: 1, url: 'https://example.test/page', title: 'Fixture', description: '' }] }) })
    assert.ok(observation.id)
    report.checks.push('Saved synthetic organic evidence through installed Search Insights IPC.')
    await kill(child)
    child = launch(port, options)
    await ready()
    assert.equal((await api('accountStatus')).user.ownerKey, first)
    const reopened = await request(first, { action: 'serp-observation', siteId: site.id, observationId: observation.id })
    assert.deepEqual(reopened, observation)
    report.checks.push('Encrypted fixture identity and exact observation survived forced desktop exit.')
    await api('accountSignOut')
    signInAs = 1
    const second = (await api('accountLoginGoogle')).user.ownerKey
    assert.equal(second, userFor(users[1]).ownerKey)
    await assert.rejects(request(first, { action: 'serp-observation', siteId: site.id, observationId: observation.id }))
    await assert.rejects(request(second, { action: 'serp-observation', siteId: site.id, observationId: observation.id }))
    report.checks.push('Switched to a second fixture account and refused both stale-owner and cross-account evidence access.')
    report.result = 'passed'
  } catch (error) {
    report.result = 'failed'
    report.error = error.message
    throw error
  } finally {
    if (child) await kill(child)
    server.closeAllConnections()
    server.close()
    await fs.writeFile(path.join(process.env.RUNNER_TEMP, 'parity-installed-recovery.json'), JSON.stringify(report, null, 2) + '\n')
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
