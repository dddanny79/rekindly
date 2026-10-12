# AI features

Optional, **off by default**. Settings → **AI**.

## Providers

- **OpenAI-compatible** — any server with `/v1/chat/completions`:
  - **LM Studio** (Developer → Start server, enable “Serve on Local Network”):
    `http://<computer>:1234/v1`
  - **Ollama**: `http://<computer>:11434/v1` (set `OLLAMA_HOST=0.0.0.0` to reach it
    from another machine)
  - OpenAI `https://api.openai.com/v1`, OpenRouter `https://openrouter.ai/api/v1`
    (with API key)
  - The address must be reachable **from the server** (the container), not only from
    your browser. In Docker, `localhost` is the container itself.
- **Anthropic** — API key; model default `claude-sonnet-5-5`.

Reasoning models (Qwen3, DeepSeek-R1, Gemma with thinking, …) work: the app sets no
token limit for OpenAI-compatible servers and removes the `<think>` part. If such a
model runs into its context limit while thinking, the error says so — raise the
context length in LM Studio/Ollama or pick a model without reasoning.

The API key is stored encrypted with the instance key (`APP_SECRET` or
`DATA_DIR/secret.key`), never returned by the API and not part of exports or backups.
**Test connection** sends only a fixed test prompt, no personal data.

A provider counts as **local** when its address is `localhost`, a private network
(10/8, 172.16/12, 192.168/16), Tailscale (100.64/10) or `*.local`. Anything else is
**cloud**: every AI button then says where the data goes before you use it.

## What the AI may see

Only people in spaces with **“AI allowed”** (Settings → Spaces, off by default).
For anything else the server refuses before contacting the provider (`403
ai_not_allowed`) — tested by a check that no request reaches the provider. Questions
on the search page only use people of released spaces as context.

## Features

- **Summarize** (person page, briefing): 3–6 bullet points from facts, details and the
  recent timeline.
- **Suggest facts** (timeline entry, ✨): lasting facts about the people of a note
  (family, preferences, job, dates); each suggestion is added only when you confirm
  it. Facts already known are left out.
- **Ask a question** (search page), in two steps: the AI first turns the question
  into search words and synonyms (only the question is sent), the search index finds
  the most relevant people of released spaces, and their briefings go as numbered
  notes into the answer, which cites them as [1], [2] with links. If nothing matches,
  the app says so without a second call.

API: `GET`/`PUT /api/v1/ai`, `POST /api/v1/ai/test`,
`POST /api/v1/ai/people/{id}/summary`, `POST /api/v1/ai/entries/{id}/facts`,
`POST /api/v1/ai/ask`.
