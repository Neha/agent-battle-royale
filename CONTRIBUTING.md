# Contributing

Thanks for helping improve Agent Battle Royale.

## Setup

1. Fork the repository and clone your fork.
2. Install dependencies and start the app using the steps in the [README](README.md#install).
3. Create a branch for your change.

## What to change

- Keep the TypeSafe API key and Sites project id in `.env.local`. Do not commit secrets, `.env.local`, or build archives.
- UI and routing live in `app/page.tsx`. The Jev call lives in `app/api/decision/route.ts` and must stay on the server.
- Run `pnpm lint` before you open a pull request.

## Pull requests

- Open the pull request against `main`.
- Describe what changed and how you checked it.
- Include a screenshot when the change affects the interface.

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
