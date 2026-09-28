#!/usr/bin/env node
/**
 * The lumy command.
 *
 *   lumy init [folder]            start a new documentation site
 *   lumy dev                      preview with live reload
 *   lumy build                    write the static site to dist/
 *   lumy serve                    serve the site with its dashboard, assistant and MCP
 *   lumy check                    report broken links, missing images, unknown blocks
 *   lumy translations [--stamp]   what is missing or out of date in each language
 *   lumy mcp                      let an AI assistant read and write the docs (MCP, stdio)
 *   lumy import docsify <folder>  convert a Docsify site
 */
import { resolve, join } from 'node:path'
import { mkdtemp, mkdir, rm, cp, readFile, writeFile, rename } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { loadConfig, ConfigError } from '../src/config.js'
import { build, lumyVersion, LUMY_ROOT } from '../src/build.js'
import { dev, serve } from '../src/server.js'
import { translationReport, stampTranslations, printReport } from '../src/translations.js'
import { runMcp } from '../src/mcp.js'
import { importDocsify } from '../src/import-docsify.js'
import { exists } from '../src/util.js'

const HELP = `
  Lumy — light, multilingual, interactive documentation

  Usage
    lumy init [folder] [--lang en,fr] [--title "My app"]
    lumy dev [--root .] [--port 4000] [--host 127.0.0.1]
    lumy build [--root .] [--out dist]
    lumy serve [--root .] [--port 4000] [--host 127.0.0.1] [--watch] [--no-build]
    lumy check [--root .]
    lumy translations [--root .] [--stamp all | <lang> | <lang>/<page>]
    lumy mcp [--root .]
    lumy import docsify <docs-folder> --out <site-folder> [--lang en,fr] [--title "My app"]
                        [--why "Why it works this way,Pourquoi c'est ainsi"] [--layout root]

  Every command reads lumy.config.json from --root (default: the current folder).
`

function parseArgs(argv) {
  const args = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=')
      if (v !== undefined) args[k] = v
      else if (argv[i + 1] && !argv[i + 1].startsWith('--')) args[k] = argv[++i]
      else args[k] = true
    } else if (a === '-h') args.help = true
    else if (a === '-v') args.version = true
    else args._.push(a)
  }
  return args
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const [command, ...rest] = args._
  const root = resolve(args.root || '.')

  if (args.version) return console.log(await lumyVersion())
  if (!command || args.help || command === 'help') return console.log(HELP)

  switch (command) {
    case 'init': {
      const target = resolve(rest[0] || '.')
      if (await exists(join(target, 'lumy.config.json'))) throw new Error(`${target} already has a lumy.config.json.`)
      await cp(join(LUMY_ROOT, 'templates', 'init'), target, { recursive: true, errorOnExist: false, force: false })
      // npm leaves ".gitignore" out of packages, so the template ships it without the dot.
      if (!(await exists(join(target, '.gitignore')))) await rename(join(target, 'gitignore'), join(target, '.gitignore'))
      else await rm(join(target, 'gitignore'), { force: true })
      const configFile = join(target, 'lumy.config.json')
      const config = JSON.parse(await readFile(configFile, 'utf8'))
      if (args.title) config.title = String(args.title)
      if (args.lang) {
        config.languages = String(args.lang).split(',').map((s) => s.trim()).filter(Boolean)
        const [source, ...others] = config.languages
        // The starter pages become the source language's; the others start
        // empty and show the source pages until they are translated.
        if (source !== 'en' && !(await exists(join(target, 'docs', source)))) await rename(join(target, 'docs', 'en'), join(target, 'docs', source))
        for (const lang of others) await mkdir(join(target, 'docs', lang), { recursive: true })
      }
      await writeFile(configFile, JSON.stringify(config, null, 2) + '\n')
      console.log(`\n  New Lumy site in ${target}\n\n  Next:\n    cd ${rest[0] || '.'}\n    npx lumy dev\n`)
      return
    }
    case 'dev':
      await dev(root, { port: Number(args.port) || 4000, host: args.host || '127.0.0.1' })
      return
    case 'build': {
      const config = await loadConfig(root)
      const result = await build(config, { outDir: args.out ? resolve(args.out) : undefined })
      if (args.strict && result.warnings.length) process.exitCode = 1
      return
    }
    case 'serve':
      await serve(root, { port: Number(args.port) || 4000, host: args.host || '127.0.0.1', watch: Boolean(args.watch), build: !args['no-build'] })
      return
    case 'check': {
      const config = await loadConfig(root)
      const out = await mkdtemp(join(tmpdir(), 'lumy-check-'))
      try {
        const result = await build(config, { outDir: out, quiet: true })
        console.log(`\n  ${result.pages} pages checked.`)
        if (!result.warnings.length) console.log('  No problems found.')
        const byFile = new Map()
        for (const w of result.warnings) byFile.set(w.file, [...(byFile.get(w.file) || []), w.message])
        for (const [file, list] of byFile) {
          console.log(`\n  ${file}`)
          for (const m of list) console.log(`    · ${m}`)
        }
        printReport(await translationReport(config, result.site))
        if (result.warnings.length) process.exitCode = 1
      } finally {
        await rm(out, { recursive: true, force: true })
      }
      return
    }
    case 'translations': {
      const config = await loadConfig(root)
      if (args.stamp) {
        const stamped = await stampTranslations(config, args.stamp === true ? 'all' : args.stamp)
        console.log(stamped.length ? `\n  Marked up to date: ${stamped.join(', ')}\n` : '\n  Nothing to stamp.\n')
        return
      }
      printReport(await translationReport(config))
      return
    }
    case 'mcp':
      await runMcp(root)
      return
    case 'import': {
      const [kind, src] = rest
      if (kind !== 'docsify' || !src) throw new Error('Usage: lumy import docsify <docs-folder> --out <site-folder> [--lang en,fr]')
      if (!args.out) throw new Error('Choose where the new site goes with --out <folder>.')
      const langs = args.lang ? String(args.lang).split(',').map((s) => s.trim()) : ['en']
      const why = args.why ? String(args.why).split(',').map((s) => s.trim()).filter(Boolean) : []
      await importDocsify(resolve(src), resolve(args.out), { langs, why, layout: args.layout === 'root' ? 'root' : 'folders', title: args.title ? String(args.title) : 'Documentation' })
      return
    }
    default:
      console.log(`  Unknown command "${command}".`)
      console.log(HELP)
      process.exitCode = 1
  }
}

main().catch((err) => {
  console.error(`\n  ${err instanceof ConfigError ? '' : 'Error: '}${err.message}\n`)
  if (process.env.LUMY_DEBUG) console.error(err.stack)
  process.exitCode = 1
})
