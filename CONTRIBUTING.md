# Contributing to Sentinel

Thanks for your interest in contributing. Here's how to get started.

## Development Setup

```bash
git clone https://github.com/YOUR_USERNAME/sentinel.git
cd sentinel
npm install
npm run dev
```

The dev server starts on **http://localhost:3333** with hot reload.

## Guidelines

- **Keep it simple.** Sentinel is a single-purpose tool. Features should serve the core use case: monitoring a server you're already on.
- **No external dependencies for data collection.** Everything should use Node.js built-ins (`os`, `child_process`) and standard system commands (`df`, `ss`, `lsof`, etc.).
- **Support both Linux and macOS.** Check `os.platform()` and handle both code paths.
- **Test on mobile.** The dashboard is used from phones over TailScale. Every change should look right at 375px.

## Adding a New Data Source

1. Add the TypeScript interface in `src/lib/types.ts`
2. Add the collection function in `src/app/api/system/route.ts`
3. Wire it into the `GET` handler's `Promise.all`
4. Add the UI in the appropriate page under `src/app/`

## Pull Requests

- Keep PRs focused — one feature or fix per PR
- Run `npm run build` before submitting to catch type errors
- Describe what you changed and why

## Reporting Bugs

Open an issue with:
- Your OS and version
- What you expected vs. what happened
- Any error messages from the browser console or terminal
