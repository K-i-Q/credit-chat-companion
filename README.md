# Credit Chat Companion

A React + Vite app for the Credit Chat Companion experience.

## Getting started

Requirements: Node.js 18+ and npm.

```sh
npm install
```

## OpenAI setup

Create a `.env` file at the project root:

```sh
OPENAI_API_KEY=your_api_key_here
OPENAI_MODEL=gpt-4o-mini
PORT=3001
CORS_ORIGIN=http://localhost:5173
```

Start the API proxy and the Vite dev server (two terminals):

```sh
npm run dev:server
npm run dev
```

Or run both in one command:

```sh
npm run dev:full
```

## Useful scripts

- `npm run dev` - start the dev server
- `npm run dev:server` - start the OpenAI proxy server
- `npm run dev:full` - start both servers
- `npm run build` - build for production
- `npm run preview` - preview the production build
- `npm run lint` - run ESLint

## Tech stack

- Vite
- React
- TypeScript
- Tailwind CSS
- shadcn-ui
