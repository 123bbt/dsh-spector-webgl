# @dsh-external/spector-webgl

DeepSeek Harness (DSH) 插件：**WebGL 性能/着色器检查器封装**。

封装上游开源项目 [BabylonJS/Spector.js](https://github.com/BabylonJS/Spector.js)：
面向 WebGL/WebGL2 开发者的帧级检查器——捕获一帧内的全部 GL 命令、着色器源码、
纹理/缓冲区/上下文状态与 GPU 耗时，兼容所有引擎（Babylon.js、Three.js 等）与原生 WebGL。
发行形态为浏览器扩展（Chrome/Firefox）+ 单文件 UMD bundle。

## 工具

| 工具 | 说明 |
|---|---|
| `spector_bundle` | 定位本地 `spector.bundle.js`（自动探测离线缓存 / `node_modules/spectorjs`），报告路径/大小/sha256；可带 `outputDir` 拷贝到目标工程；本地缺失时给出 CDN 备用。 |
| `spector_snippets` | 生成集成代码片段：`embed`（script 引用）、`ui`（displayUI）、`capture`（captureCanvas + onCapture 导出 JSON）、`spy`（spyCanvases 全量追踪）、`metadata`（__SPECTOR_Metadata 自定义对象名）；`scenario` 可指定类别，缺省全部。 |
| `spector_check_project` | 扫描 Web 工程目录（html/js/ts/jsx/tsx/vue/svelte，跳过 node_modules/.git/dist），按五类标记（library/ui/capture/spy/metadata）报告集成状态与缺口。 |

## 部署

### 1. 本地 bundle 来源（任意其一，`spector_bundle` 自动探测）

- **离线缓存**（本仓库开发环境内置）：`G:\mcpskill\mcp\.deps\spector-study\package\dist\spector.bundle.js`
  （spectorjs@0.9.30，682,744 B）——生产环境将 bundle 拷到 `node_modules/spectorjs/dist/` 即可被探测
- `npm i spectorjs`（装到目标工程后 `node_modules/spectorjs/dist/`）
- 插件配置 `bundleDir` 指向含 `dist/spector.bundle.js` 的包目录
- 探测顺序：工具参数 `sourceDir` → 配置 `bundleDir` → 进程 cwd 与 `DSH_WORKSPACE` 环境变量下的
  `.deps/spector-study/package` 与 `node_modules/spectorjs`
- 宿主 cwd 通常不是工作区，**建议显式传 `sourceDir` 或配置插件**；缺失时工具给出 CDN 备用

### 2. 安装插件（两种方式）

**方式 A：注入器免重启**（需 dsh-super-injector）：

```text
dev_inject_plugin dir=G:\mcpskill\mcp\spector-webgl
```

**方式 B：正式装配**（写入 profile，重启后由 bundles 自动加载）：

```text
dev_install_package dir=G:\mcpskill\mcp\spector-webgl
```

### 3. 使用示例

```text
spector_bundle(sourceDir="<含 dist/spector.bundle.js 的包目录>")
spector_bundle(sourceDir="...", outputDir="<目标工程>")       # 拷贝 bundle 到工程
spector_snippets(scenario="embed,ui,capture")                # 取集成片段
spector_check_project(projectDir="<目标 Web 工程>")            # 检查集成状态与缺口
```

集成到页面后按 `spector_snippets` 引导使用：`displayUI()` 显示检查器、
`captureCanvas(canvas)` + `onCapture` 导出 JSON、`spyCanvases()` 全量追踪、
`__SPECTOR_Metadata` 给 GL 对象命名便于识别。

## 从源码构建（干净环境，标准 npm 流程）

```bash
git clone <本仓库> spector-webgl
cd spector-webgl
npm install        # 安装 devDependencies（typescript/@types/node + @deepseek-ai 类型链）
npm run build      # tsc -p tsconfig.json → 产物 lib/
```

- `devDependencies` 完整声明了编译所需类型链（`@deepseek-ai/dsh-tools@^0.1.0-rc.6` 等的 npm 完整包，含 .d.ts），
  **不依赖任何本机手工 junction 环境**，clone 后 `npm install && npm run build` 即可编译。
- `peerDependencies`（`@deepseek-ai/cordis` / `@deepseek-ai/dsh-tools` / `@deepseek-ai/schemastery`）
  为运行时宿主依赖，由 DSH 宿主提供。
- 常见注意：npm 默认缓存目录若不可写，加 `--cache <可写目录>`。

## DSH 启动装配（标准 bundle 声明）

本插件是 DSH **bundle 插件**，启动装配依赖 package.json 中的**标准启动声明**：
`"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`，配套的 `cordis.patch.yml` 自引用自身包名，
让 DSH Desktop 把它识别为 profile 层并执行 `apply()` 注册工具。

DSH 启动时（`dsh-app-boot` 的 `loadBundleLayerSafe`）会检查每个 `dsh.profile.bundles` 里的包是否声明
`dsh.bundle.patch`。**若缺失该声明，插件会被判定「非 dsh 插件 bundle」而跳过并从 bundles 移除**（并可能触发
DSH 的 fail-loud 恢复：备份 manifest 后按模板重建）。因此发布或手动装配时**务必保留**：

```
cordis.patch.yml        # 装配自身：{ insert: [{ id, name: '@dsh-external/spector-webgl' }] }
package.json            # dsh.bundle.patch 声明 + files 含 cordis.patch.yml
```

## 架构

`src/index.ts` 单文件：`resolveBundle`（探测/拷贝 bundle + sha256）、五类 `SNIPPETS`（真实 API 片段）、
`collectProjectFiles` + 五类 `MARKERS`（工程扫描）。三个工具全部挂 `ctx.effect`
（热重载/卸载自动清理）。bundle 默认值来源：spectorjs@0.9.30 npm 发行物（upstream 打包产出）。

## 引用的上游仓库

| 项目 | 地址 | 用途 |
|---|---|---|
| BabylonJS/Spector.js | https://github.com/BabylonJS/Spector.js | 被封装的上游项目（WebGL 检查器） |
| spectorjs (npm) | https://www.npmjs.com/package/spectorjs | 上游的 npm 发行物（`dist/spector.bundle.js` UMD bundle） |
| Spector CDN | https://spectorcdn.babylonjs.com/spector.bundle.js | 官方 CDN 备用引用 |

## 协议

本插件代码遵循 **BSD-3-Clause**（与上游一致）。上游项目版权归 BabylonJS/Spector.js 贡献者所有。