# Orphix 🕵️‍♂️

<div align="left">
  <!-- Library Status Badges -->
  <a href="https://www.npmjs.com/package/orphix"><img src="https://img.shields.io/npm/v/orphix?style=for-the-badge&color=007acc" alt="npm version"/></a>
  <a href="https://www.npmjs.com/package/orphix"><img src="https://img.shields.io/npm/dm/orphix?style=for-the-badge&color=44cc11" alt="npm downloads"/></a>
  <a href="https://github.com/sudhanshu0716/Orphix"><img src="https://img.shields.io/github/stars/sudhanshu0716/Orphix?style=for-the-badge&color=ffcc00" alt="GitHub stars"/></a>
  <a href="LICENSE"><img src="https://img.shields.io/npm/l/orphix?style=for-the-badge&color=ff69b4" alt="License"/></a>
</div>

---

Find unused files, exports, functions, components, APIs, and imports before they become technical debt.

Orphix uses static analysis and AST parsing via Babel to construct your project's dependency graph, identify orphaned files, discover unused module exports, locate dead local functions/React components, map dead API routes, identify unused npm package dependencies, and clean up the code automatically.

---

## 🚀 Features

- **📂 Unused File Detection**: Identifies files that are completely unreachable from your entry points.
- **📤 Unused Export Detection**: Flags module exports that are never imported anywhere in the project.
- **⚡ Unused Function & Component Detection**: Finds functions and React components declared but never invoked or rendered.
- **📥 Unused Imports Detection**: Identifies imported bindings that are never referenced in the declaring file.
- **📦 Unused npm Dependencies**: Flags third-party npm packages declared in `package.json` dependencies list that are never imported anywhere in the project.
- **💼 Monorepo & Client/Server Support**: Auto-groups workspaces containing separate sub-projects (e.g. `client` and `server` directories) and runs entrypoint auto-detection per-project root to prevent cross-deletions.
- **🔍 Path Alias Resolution (`@/`)**: Automatically resolves `@/` imports relative to the nearest project root's `src` directory.
- **⚙️ CommonJS & ES Modules**: Full compatibility parsing for both standard ESM (`import`/`export`) and CommonJS (`require` / `module.exports`).
- **🔗 Template-Literal Dynamic Imports**: Traces and resolves template-literal dynamic imports (e.g. `import(\`./pages/\${page}\`)`), automatically marking the target folders as reachable.
- **🧠 Framework Awareness**: Out-of-the-box entrypoint auto-detection for **Next.js** (pages, layouts, API routes) and **Vite**.
- **🛢️ Barrel File / Re-export Propagation**: Follows re-exports (e.g. `export { x } from './module'`) to trace usage back to its origin file correctly.
- **📡 Dead API Route Tracing**: Extracts Next.js API endpoints and scans string/template literals across the project to flag unused endpoints.
- **🧹 Automatic Code Cleanup (`--clean`)**: Rewrites files using Babel-traverse codemods to delete orphaned files, strip unused imports, and demote/remove unused exports.
- **🕒 Git History Integration**: Attaches the last modification date and author to unused items to help coordinate cleanups.
- **🧪 CI/CD Integration**: Supports pipeline failures via the `--fail-on-dead-code` exit flag.
- **📦 Babel AST Support**: Out-of-the-box support for modern JavaScript, JSX, TypeScript, and TSX.
- **🛡️ Authoritative & Safe**: Safe path validations prevent deletion of files outside the scan workspace boundary, and Code formatting preservation minimises Git diff lines.

---

## 📦 Installation

Run Orphix directly without installation using `npx`:

```bash
npx orphix
```

Or install it globally:

```bash
npm install -g orphix
```

Or install it locally in your project:

```bash
npm install --save-dev orphix
```

---

## 🛠️ CLI Options

Running `npx orphix --help` outputs:

```bash
Usage: orphix [options] [dir]

Find unused files, exports, functions, and components in your JS/TS codebase

Arguments:
  dir                       directory to scan (default: ".")

Options:
  -V, --version             output the version number
  --json                    output result in JSON format (default: false)
  --verbose                 detailed logs (default: false)
  --fail-on-dead-code       exit with code 1 if dead code is found (default: false)
  --git                     extract git history metadata (last edit date/author) (default: false)
  --ignore <patterns...>    glob patterns of files to ignore
  --entry <entryPoints...>  explicit entry point files
  --clean                   automatically delete unused files and clean up dead code (default: false)
  -h, --help                display help for command
```

---

## ⚙️ Configuration (`orphix.config.json`)

You can define a configuration file named `orphix.config.json` in the root of your target directory. It merges seamlessly with command-line options.

```json
{
  "entryPoints": ["src/index.js", "src/admin.js"],
  "ignore": ["**/tests/**", "**/*.test.js"],
  "git": true,
  "failOnDeadCode": false,
  "verbose": false,
  "json": false
}
```

---

## 📁 Examples

### Basic Scan
Scan the current directory (auto-detecting entry points):
```bash
npx orphix
```

### Specify Target Directory
Scan a specific folder:
```bash
npx orphix src/
```

### Specify Entry Point
Instruct Orphix to trace dependencies starting from custom entry points:
```bash
npx orphix src/ --entry src/main.tsx src/admin.tsx
```

### Enable Git Integration
Retrieve information about when the files were last modified and by whom:
```bash
npx orphix --git
```

### Ignore Directories
Specify custom patterns to ignore:
```bash
npx orphix --ignore "**/tests/**" "**/mock/**"
```

### Fail Build in CI/CD
Exits with exit code `1` if any unused files, exports, or functions are detected:
```bash
npx orphix --fail-on-dead-code
```

### JSON Format
Print results in raw JSON format (ideal for custom pipelines and automated tools):
```bash
npx orphix --json
```

### Automatic Code Cleanup
Automatically delete unused files, strip unused imports, and clean up exports/functions:
```bash
npx orphix --clean
```

---

## ⚙️ How It Works

1. **Scanner**: Scans the targeted folder using `fast-glob`. It respects default rules (ignores `node_modules`, `.git`, `dist`, etc.) and automatically parses `.gitignore` file patterns if present.
2. **Parser**: Translates source code into Abstract Syntax Trees (AST) using `@babel/parser` supporting TypeScript and JSX.
3. **Graph Builder**: Traces static imports, dynamic imports, and CommonJS `require()` calls to determine reachable code paths.
4. **Analyzer**: Cross-references imported specifiers and internal references to detect dead exports, unused imports, dead API endpoints, and propagates barrel re-exports.
5. **Cleaner**: Modifies the file ASTs using `@babel/traverse` and `@babel/generator` to prune unused code, strip `export` keywords, remove empty import statements, and delete orphaned files.
6. **Reporter**: Displays detailed colorized summaries on stdout.

---

## 📄 License

MIT


