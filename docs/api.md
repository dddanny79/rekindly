# API, tokens and MCP

## API

Everything the web app does goes through the public API under `/api/v1`.

- **Description:** `/api/openapi.json` (OpenAPI 3.1, generated from the Zod schemas
  in `packages/shared`) and a readable page at **`/api/docs`**.
- **Authentication:** the session cookie (web app), or an API token:
  `Authorization: Bearer rkt_…`.

## API tokens

**Settings → API & MCP → API tokens.** A token has a name, an access level and a
validity (30 days, 90 days, 1 year, or until revoked). It is shown once; only its
hash is stored. Revoking takes effect immediately.

- **Read only:** `GET` requests.
- **Read and write:** also creating and changing.
- Tokens reach people, organizations, timeline, follow-ups, catalog (spaces, tags,
  relationship types, custom fields), files, search, Today and duplicates — not the
  account, passkeys, other tokens, device passwords, calendar links, backups,
  export/import or the trash (`403 token_not_allowed`). In `/api/docs`, every
  operation says what it needs (`x-api-token`).

```sh
curl -H "Authorization: Bearer rkt_…" https://people.example.com/api/v1/people
```

## MCP (Claude Code, Claude Desktop)

The app is an MCP server (Streamable HTTP, stateless) at **`/mcp`**, authenticated
with an API token. Tools:

| Tool                  | What it does                                                                                                       | Token |
| --------------------- | ------------------------------------------------------------------------------------------------------------------ | ----- |
| `search_people`       | Find people by name, organization or words from notes                                                              | read  |
| `get_person_briefing` | Everything known about a person: organizations, contact details, facts, follow-ups, relationships, recent timeline | read  |
| `get_today`           | Due follow-ups, birthdays, people overdue to contact                                                               | read  |
| `log_interaction`     | Add a note, call, meeting or message to a person's timeline                                                        | write |
| `add_follow_up`       | Create a follow-up for a person                                                                                    | write |

**Only spaces with “AI allowed”** (Settings → Spaces, off by default) are visible
through MCP: what a tool returns goes to the assistant's AI provider. People in other
spaces do not exist for MCP, also not in search results.

### Claude Code

```sh
claude mcp add --transport http rekindly https://people.example.com/mcp \
  --header "Authorization: Bearer rkt_…"
```

Then ask, for example, “What do I know about Jana Berger?”.

### Claude Desktop

Settings → Developer → Edit Config (`claude_desktop_config.json`), add the server and
restart Claude. Claude Desktop connects through `mcp-remote` (needs Node.js):

```json
{
  "mcpServers": {
    "rekindly": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://people.example.com/mcp",
        "--header",
        "Authorization:${AUTH_HEADER}"
      ],
      "env": { "AUTH_HEADER": "Bearer rkt_…" }
    }
  }
}
```

The settings page shows both snippets with the address and token filled in right
after creating a token.

claude.ai (web and mobile apps) needs OAuth for custom connectors; that is not
supported yet.
