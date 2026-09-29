# SongForge Studio

A one-page web app for the [Suno API](https://docs.sunoapi.org/): paste your API key and create full songs, lyrics, remixes and sounds.

## Features
- **Key gate**: the key is checked against the credits endpoint and stored only in your browser (local or session storage).
- **Create**: Simple mode (describe a song, add optional image/video/audio references) and Custom mode (title, style, lyrics, styles to avoid, voice, instrumental, length, style adherence, weirdness, audio weight, variety, persona).
- **Models**: V6, V6 Wild, V6 Mini, plus the deprecated legacy models.
- **Lyrics studio**: AI lyric drafts that you can send straight into Custom mode.
- **Remix lab**: Upload & cover, upload & extend, add vocals, add instrumental, mashup. Files upload through the Suno file API.
- **Sounds**: loops and ambiences with BPM, key, loop and lyric-capture options.
- **Track actions**: extend, replace a section, stem separation (2 stems, 12 stems, or one instrument), WAV export, MP4 music video, AI cover art, personas, and sing-along lyrics with timestamps.
- **Library**: kept in the browser, with search and task-ID import. Suno keeps files for about 14 days.
- **Themes**: light, dark and system.

## Deploy
Static site with no build step. On Netlify, connect the repo; `netlify.toml` publishes the root and deploys
`netlify/functions/suno-callback.js`, a no-op endpoint used as the required `callBackUrl` (the app polls for results).
