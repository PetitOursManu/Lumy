import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'

/** A throw-away folder filled with `files` ({ "path": "content" }). */
export async function tempSite(files) {
  const root = await mkdtemp(join(tmpdir(), 'lumy-test-'))
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true })
    await writeFile(join(root, path), content)
  }
  return { root, cleanup: () => rm(root, { recursive: true, force: true }) }
}

// A 1×1 PNG, 640×400 in its header (only the header is read).
export const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d4948445200000280000001900806000000000000000049454e44ae426082',
  'hex',
)

export const SAMPLE = {
  'lumy.config.json': JSON.stringify({
    title: 'Sample',
    languages: ['en', 'fr'],
    url: 'https://docs.example.com',
    logo: 'assets/logo.png',
    feedback: true,
    nav: [
      { group: { en: 'Start', fr: 'Démarrer' }, pages: ['index', 'install'] },
      { group: 'Reference', pages: ['glossary', 'missing-page'] },
    ],
    links: [{ label: 'Install', href: 'install' }],
  }),
  'docs/assets/logo.png': PNG,
  'docs/assets/screen.png': PNG,
  'docs/en/index.md': '---\ndescription: The home page.\n---\n# Welcome\n\nRead [the install guide](install.md#docker).\n\n![Screen](../assets/screen.png "The screen")\n',
  'docs/en/install.md':
    '# Install\n\n## Docker\n\nUse [[Muse]] here.\n\n:::tabs group=os\n@tab Linux\nL\n@tab Windows\nW\n:::\n\n:::vars\nport = 8080 | Port\n:::\n\n```bash\ncurl localhost:{{port}}\n```\n\n[Broken](nowhere.md)\n',
  'docs/en/glossary.md': '# Glossary\n\n## Muse {#muse}\n\nThe design switch.\n',
  'docs/fr/index.md': '# Bienvenue\n\nLisez [le guide](install.md).\n',
  'docs/fr/glossary.md': '# Glossaire\n\n## Muse {#muse}\n\nL’interrupteur de design.\n',
}
