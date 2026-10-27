# Kripto Sohbet

End-to-end encrypted, real-time chat rooms that run in the browser. Messages are encrypted on your device before they leave it, so the server only ever stores ciphertext.

*"Kripto Sohbet" is Turkish for "crypto chat". The interface is in Turkish.*

## Features

- **End-to-end encryption.** AES-GCM via the Web Crypto API, with a fresh random IV for every message. The room key never reaches the server.
- **Real time.** New messages are pushed over Server-Sent Events. Typing indicators, presence, reactions, read receipts and deletes travel over Supabase Realtime broadcast.
- **Rich messages.** Text, photos and voice messages, plus replies, emoji reactions, a media gallery and message search.
- **Share by link.** Invite someone with a `?room=` link and send them the room key separately.
- **Quality of life.** Four themes, sound and browser notifications, and an unread counter with jump-to-latest.

## How it works

```
Browser A ──encrypt (AES-GCM)──▶ Express API ──SSE──▶ Browser B ──decrypt
                                     │
                                     └─ stores ciphertext + IV only
Supabase Realtime: typing · presence · reactions · receipts (no message content)
```

## Tech stack

React 19 · TypeScript · Vite · Tailwind CSS 4 · Express · Server-Sent Events · Supabase Realtime · Web Crypto API

## Run locally

```bash
npm install
npm run dev        # http://localhost:3000
```

Optional: set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env.local` to use your own Supabase project.

Production build:

```bash
npm run build
npm start
```

`render.yaml` deploys it to [Render](https://render.com) on the free plan.

## Security notes

The room key is derived from the shared passphrase with a single SHA-256 hash. Choose a long, random passphrase. Moving to a salted KDF such as PBKDF2 or Argon2 is on the roadmap. Messages are kept in a local JSON file on the server, which suits demos and small groups.
