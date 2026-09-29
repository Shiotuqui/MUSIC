# Songsmith Studio

A one-page AI music studio for the [Suno API](https://docs.sunoapi.org/). Paste your API key and start creating. There's no build step and no backend to run.

## Features

- **API key gate**: the key is checked against the credits endpoint and stored only in your browser. You choose whether it's remembered.
- **Create**
  - *Simple mode*: describe a song, pick a vibe (or hit 🎲 Surprise me), and optionally add image, audio or video references.
  - *Custom mode*: title, style tags, a lyrics editor with section tags ([Verse], [Chorus]…), vocal gender, target length, style adherence, weirdness, audio weight, variety, exclude-styles and Persona / Voice ID.
  - **Model picker**: V6 (default), V6 Wild and V6 Mini, plus the legacy V5.5, V5, V4.5+, V4.5 All, V4.5 and V4 models.
- **Live progress**: jobs show when they're queued, when lyrics are written, when the first take can be played and when they're done. The first take can be streamed while the second finishes. Jobs keep running after a page reload.
- **Lyric lab**: AI-written lyric drafts. Send any draft to Custom mode with one click.
- **Remix**: upload a file or paste a URL, then:
  - **Cover** it in a new style
  - **Add vocals** to an instrumental
  - **Add an instrumental** to a vocal
- **Library**: search, favourites and MP3 download. Each track can also be:
  - **Extended** from any point
  - **Split into stems**: vocals + instrumental, a full stem split, or one isolated instrument
  - Converted to **WAV**
  - Rendered as an **MP4 music video**
  - Played as **sing-along karaoke** with timestamped lyrics
  - Used as the source for a cover, or as the starting style for a new song
- **Player**: a persistent player bar with seek, next/previous, keyboard (space) control and Media Session support.
- **Themes**: light, dark and system.
- Works on phones as well as desktops.

## Deploying on Netlify

Connect this repo in Netlify. You don't need build settings, because `netlify.toml` already configures:

- `/suno/*` → `https://api.sunoapi.org/*`, a same-origin proxy so the browser doesn't hit CORS errors
- `/upload/*` → the Suno file-upload service
- `/callback` → a tiny function (`netlify/functions/callback.mjs`) that acknowledges task callbacks. The app gets results by polling task status.

## Local development

```sh
python3 -m http.server 8080   # then open http://localhost:8080
```

If the proxy isn't available, the app calls `https://api.sunoapi.org` directly.
