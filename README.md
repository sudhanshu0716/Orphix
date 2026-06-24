# Orphix 🕵️‍♂️

Find unused files, exports, functions, components, and APIs before they become technical debt.

Orphix uses static analysis and AST parsing via Babel to construct your project's dependency graph, identify orphaned files, discover unused module exports, and locate dead local functions and React components.

---

## Features

- **Unused File Detection**: Identifies files that are completely unreachable from your entry points.
- **Unused Export Detection**: Flags module exports that are never imported anywhere in the project.
- **Unused Function & Component Detection**: Finds functions and React components declared but never invoked or rendered.
- **Git History Metadata**: Retrieves the last modification date and author of unused items to help prioritize cleanups.
- **CI/CD Integration**: Supports pipeline failures via the `--fail-on-dead-code` exit flag.
- **Babel AST Support**: Out-of-the-box support for modern JavaScript, JSX, TypeScript, and TSX.

---

## Installation

You can run Orphix directly without installation using `npx`:

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

## CLI Options

```bash
Usage: orphix [options] [dir]

Arguments:
  dir                      Directory to scan (default: ".")

Options:
  -v, --version            output the version number
  --json                   output result in JSON format (default: false)
  --verbose                detailed logs (default: false)
  --fail-on-dead-code      exit with code 1 if dead code is found (default: false)
  --git                    extract git history metadata (last edit date/author) (default: false)
  --ignore <patterns...>   glob patterns of files to ignore
  --entry <entryPoints...> explicit entry point files
  --clean                  automatically delete unused files and clean up dead code
  -h, --help               display help for command
```

---

## Examples

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
Automatically delete unused files, strip unused imports, and remove dead exports from the codebase:
```bash
npx orphix --clean
```

---

## How It Works

1. **Scanner**: Scans the targeted folder using `fast-glob`. It respects default rules (ignores `node_modules`, `.git`, `dist`, etc.) and automatically parses `.gitignore` file patterns if present.
2. **Parser**: Translates source code into Abstract Syntax Trees (AST) using `@babel/parser` supporting TypeScript and JSX.
3. **Graph Builder**: Traces static imports, dynamic imports, and CommonJS `require()` calls to determine reachable code paths.
4. **Analyzer**: cross-references imported specifiers and internal references to detect dead exports or functions.
5. **Reporter**: Displays detailed colorized summaries on stdout.

---

## License

MIT
