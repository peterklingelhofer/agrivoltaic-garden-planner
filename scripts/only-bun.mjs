// An npm or yarn install here silently replaces bun's node_modules with a different tree, leaving
// no resolvable binaries, so guard the install rather than debugging it again
const agent = process.env.npm_config_user_agent ?? ''
const manager = agent.split('/')[0]

const LOCKFILES = { yarn: 'yarn.lock', npm: 'package-lock.json', pnpm: 'pnpm-lock.yaml' }

if (manager && manager !== 'bun') {
  const lockfile = LOCKFILES[manager] ?? 'the lockfile it wrote'
  console.error(
    `\nThis project uses bun. You ran ${manager}.\n` +
      `Delete ${lockfile} if it was created, then run: bun install\n`,
  )
  process.exit(1)
}
