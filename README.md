# Credit Chat Companion

A React + Vite app for the Credit Chat Companion experience.

## Getting started

Requirements: Node.js 18+ and npm.

```sh
npm install
```

## Supabase Edge Functions setup

Create a `.env` file at the project root:

```sh
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here
```

Set secrets for Edge Functions:

```sh
supabase secrets set OPENAI_API_KEY="your_api_key" \
OPENAI_MODEL="gpt-4o-mini" \
SERVICE_ROLE_KEY="your_service_role_key"
```

Deploy the functions:

```sh
supabase functions deploy chat
supabase functions deploy admin-users
supabase functions deploy admin-role
supabase functions deploy admin-credits
supabase functions deploy admin-users-delete
supabase functions deploy admin-invites
supabase functions deploy admin-invites-delete
supabase functions deploy invite-redeem
```

## Useful scripts

- `npm run dev` - start the dev server
- `npm run dev:full` - alias for `npm run dev`
- `npm run build` - build for production
- `npm run preview` - preview the production build
- `npm run lint` - run ESLint

## Tech stack

- Vite
- React
- TypeScript
- Tailwind CSS
- shadcn-ui
