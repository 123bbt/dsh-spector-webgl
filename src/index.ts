/**
 * @dsh-external/spector-webgl — 封装 BabylonJS/Spector.js（WebGL 性能/着色器检查器）。
 *
 * Spector.js 是浏览器端 WebGL/WebGL2 调试工具：捕获一帧内的全部 GL 命令、
 * 着色器源码、纹理/缓冲/状态与 GPU 耗时。分发形态为 UMD bundle（spector.bundle.js），
 * 可作 script 引用或 npm 模块（npm 包名 spectorjs）。
 *
 * 本插件在桌面/Node 侧提供三类能力：
 *   1. spector_bundle        —— 定位本地 spector.bundle.js（或给出 CDN 备用），可拷贝到目标工程
 *   2. spector_snippets      —— 生成常用集成代码片段（注入/UI/捕获/追踪/元数据）
 *   3. spector_check_project —— 扫描目标 Web 工程文件，报告 Spector 集成状态与缺口
 *
 * 规范：资源注册必须挂 ctx.effect（热重载/卸载自动清理）。
 * 性能：工具 schema 精简，description 短句点明用途，细节放 result。
 */
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import z from '@deepseek-ai/schemastery'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as crypto from 'node:crypto'

export const name = '@dsh-external/spector-webgl'
export const inject = ['tools']

export interface Config {
  /** 本地 spectorjs 包所在目录（含 dist/spector.bundle.js），缺省自动探测 */
  bundleDir: string
}

export const Config = z.object({
  bundleDir: z.string().default(''),
})

const CDN_URL = 'https://spectorcdn.babylonjs.com/spector.bundle.js'
const NPM_PACKAGE = 'spectorjs'

/** 探测本地 spector.bundle.js：参数 → 配置 → cwd/DSH_WORKSPACE 相关路径 */
export function resolveBundle(requested: string | undefined, configDir: string): string | null {
  const ws = process.env.DSH_WORKSPACE
  const candidates: string[] = []
  if (requested) candidates.push(path.join(requested, 'dist', 'spector.bundle.js'), path.join(requested, 'spector.bundle.js'))
  if (configDir) candidates.push(path.join(configDir, 'dist', 'spector.bundle.js'), path.join(configDir, 'spector.bundle.js'))
  candidates.push(
    path.join(process.cwd(), '.deps', 'spector-study', 'package', 'dist', 'spector.bundle.js'),
    path.join(process.cwd(), 'node_modules', NPM_PACKAGE, 'dist', 'spector.bundle.js'),
  )
  if (ws) {
    candidates.push(
      path.join(ws, '.deps', 'spector-study', 'package', 'dist', 'spector.bundle.js'),
      path.join(ws, 'node_modules', NPM_PACKAGE, 'dist', 'spector.bundle.js'),
    )
  }
  for (const c of candidates) {
    try {
      if (fs.statSync(c).isFile()) return c
    } catch { /* 不存在，继续 */ }
  }
  return null
}

/** sha256 */
export function sha256File(p: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')
}

export const SNIPPETS: Record<string, { title: string; lang: string; code: string }> = {
  embed: {
    title: 'script 引用（CDN）',
    lang: 'html',
    code: '<script type="text/javascript" src="https://spectorcdn.babylonjs.com/spector.bundle.js"></script>',
  },
  ui: {
    title: '页内显示检查器 UI',
    lang: 'javascript',
    code: 'var spector = new SPECTOR.Spector();\nspector.displayUI();',
  },
  capture: {
    title: '捕获一帧并导出 JSON（onCapture 回调）',
    lang: 'javascript',
    code: 'var spector = new SPECTOR.Spector();\n' +
      'spector.onCapture.add((capture) => {\n' +
      '    // Do something with capture.\n' +
      '    var myEvent = new CustomEvent("SpectorOnCaptureEvent", { detail: { captureString: JSON.stringify(capture) } });\n' +
      '    document.dispatchEvent(myEvent);\n' +
      '});\n\n' +
      'var canvas = document.getElementById("renderCanvas");\n' +
      'spector.captureCanvas(canvas);',
  },
  spy: {
    title: '全量追踪 gl 调用（捕获前的内存/纹理输入监控）',
    lang: 'javascript',
    code: 'var spector = new SPECTOR.Spector();\nspector.spyCanvases();',
  },
  metadata: {
    title: '自定义对象名（__SPECTOR_Metadata，便于识别 buffer/纹理）',
    lang: 'javascript',
    code: 'var cubeVerticesColorBuffer = gl.createBuffer();\n' +
      'cubeVerticesColorBuffer.__SPECTOR_Metadata = { name: "cubeVerticesColorBuffer" };',
  },
}

export const MARKERS: { pattern: RegExp; label: string }[] = [
  { pattern: /spectorjs|spector\.bundle|SPECTOR\.Spector/g, label: 'library' },
  { pattern: /displayUI/g, label: 'ui' },
  { pattern: /captureCanvas/g, label: 'capture' },
  { pattern: /spyCanvases/g, label: 'spy' },
  { pattern: /__SPECTOR_Metadata/g, label: 'metadata' },
]

export const PROJECT_EXTS = ['.html', '.htm', '.js', '.mjs', '.cjs', '.ts', '.jsx', '.tsx', '.vue', '.svelte']

/** 递归扫描项目文件（跳过 node_modules/.git/dist 等） */
export function collectProjectFiles(root: string, depth: number): string[] {
  const out: string[] = []
  const skip = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.nuxt'])
  const walk = (dir: string, d: number): void => {
    if (d > 12) return
    let entries: fs.Dirent[]
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (!skip.has(e.name)) walk(path.join(dir, e.name), d + 1)
      } else if (e.isFile() && PROJECT_EXTS.includes(path.extname(e.name).toLowerCase())) {
        out.push(path.join(dir, e.name))
      }
    }
  }
  walk(root, 0)
  return out.sort()
}

export function apply(ctx: any, config: Config): void {
  // ① bundle 定位/拷贝
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'spector_bundle',
    description: '定位或拷贝 Spector.js bundle（spector.bundle.js），附路径/大小/sha256 与 CDN 备用',
    parameters: {
      outputDir: { type: 'string', description: '把 bundle 拷贝到的目标目录（可选；缺省只报告位置）' },
      sourceDir: { type: 'string', description: '本地 spectorjs 包目录（可选，覆盖 config.bundleDir 探测）' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args: unknown, value: unknown) => [{ type: 'text', text: String(value) }],
    },
    async execute(args: { outputDir?: string; sourceDir?: string }) {
      const src = resolveBundle(args.sourceDir, config.bundleDir)
      const lines: string[] = []
      let out: string | null = null
      if (src) {
        const st = fs.statSync(src)
        lines.push(`本地 bundle: ${src}`, `大小: ${st.size} B`, `sha256: ${sha256File(src)}`)
        if (args.outputDir) {
          out = path.join(args.outputDir, 'spector.bundle.js')
          fs.mkdirSync(path.dirname(out), { recursive: true })
          fs.copyFileSync(src, out)
          lines.push(`已拷贝 → ${out}（${fs.statSync(out).size} B）`)
        }
        lines.push(`集成方式: <script src="${out ?? src.replace(/\\/g, '/')}"></script> 或 npm i ${NPM_PACKAGE}`)
      } else {
        lines.push(`未找到本地 bundle；请先 npm i ${NPM_PACKAGE}（拷贝到 node_modules 后自动探测）`)
        lines.push(`或直接用 CDN: <script src="${CDN_URL}"></script>`)
      }
      return lines.join('\n')
    },
  })), '@dsh-external/spector-webgl: bundle')

  // ② 集成代码片段
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'spector_snippets',
    description: '生成 Spector.js 集成代码片段（script 引用/UI/捕获 JSON/全量追踪/自定义元数据）',
    parameters: {
      scenario: {
        type: 'string',
        description: '片段类别（可选）：embed|ui|capture|spy|metadata，缺省 all 输出全部',
      },
    },
    output: {
      schema: { type: 'string' },
      render: (_args: unknown, value: unknown) => [{ type: 'text', text: String(value) }],
    },
    async execute(args: { scenario?: string }) {
      const want = args.scenario ? args.scenario.split(',') : Object.keys(SNIPPETS)
      const out: string[] = []
      for (const key of want) {
        const s = SNIPPETS[key]
        if (!s) { out.push(`[未知片段: ${key}（可选: ${Object.keys(SNIPPETS).join('|')}）]`); continue }
        out.push(`## ${s.title}（${s.lang}）\n\`\`\`${s.lang}\n${s.code}\n\`\`\``)
      }
      return out.join('\n\n')
    },
  })), '@dsh-external/spector-webgl: snippets')

  // ③ 项目集成检查
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'spector_check_project',
    description: '扫描 Web 工程目录，检查 Spector.js 集成状态（引用/UI/捕获/追踪/元数据五类标记）',
    parameters: {
      projectDir: { type: 'string', required: true, description: '目标工程根目录' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args: unknown, value: unknown) => [{ type: 'text', text: String(value) }],
    },
    async execute(args: { projectDir: string }) {
      if (!fs.existsSync(args.projectDir) || !fs.statSync(args.projectDir).isDirectory()) {
        throw new Error(`目录不存在: ${args.projectDir}`)
      }
      const files = collectProjectFiles(args.projectDir, 0)
      const hits: Array<{ file: string; line: number; label: string }> = []
      for (const f of files) {
        let lines: string[]
        try { lines = fs.readFileSync(f, 'utf8').split('\n') } catch { continue }
        for (let i = 0; i < lines.length; i++) {
          for (const m of MARKERS) {
            if (m.pattern.test(lines[i])) hits.push({ file: path.relative(args.projectDir, f), line: i + 1, label: m.label })
          }
        }
      }
      const labels = new Set(hits.map((h) => h.label))
      const out: string[] = [`扫描目录: ${args.projectDir}`, `扫描文件: ${files.length} 个（html/js/ts/vue 等）`]
      if (hits.length === 0) {
        out.push('结论: 未检测到任何 Spector.js 引用（集成缺失）')
        out.push('建议: 运行 spector_snippets 取 embed 片段，或 spector_bundle 取本地/CDN bundle')
      } else {
        out.push(`命中: ${hits.length} 处（${[...labels].join(', ')}）`)
        for (const h of hits.slice(0, 60)) out.push(`  ${h.file}:${h.line} [${h.label}]`)
        if (hits.length > 60) out.push(`  … 其余 ${hits.length - 60} 处省略`)
        const missing = (['library', 'ui', 'capture', 'spy', 'metadata'] as const).filter((l) => !labels.has(l))
        if (missing.length === 0) {
          out.push('结论: Spector.js 集成完整（库 + UI + 捕获 + 追踪 + 元数据）')
        } else if (labels.has('library')) {
          out.push(`结论: 已引入库但缺: ${missing.join(', ')}（可用 spector_snippets 补齐）`)
        } else {
          out.push(`结论: 仅有片段引用，未引入 spector 库本体（需 spector_bundle 或 CDN script）`)
        }
      }
      return out.join('\n')
    },
  })), '@dsh-external/spector-webgl: check-project')
}