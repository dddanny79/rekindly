/** `/api/docs`: the OpenAPI document as one readable, self-contained HTML page. */
import { APP_NAME } from '@app/shared';

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

type Doc = {
  info: { title: string; version: string; description: string };
  paths: Record<string, Record<string, Record<string, unknown>>>;
};

const json = (value: unknown) => `<pre>${escape(JSON.stringify(value, null, 2))}</pre>`;

export function docsHtml(doc: Doc): string {
  const byTag = new Map<string, string[]>();
  for (const [path, methods] of Object.entries(doc.paths)) {
    for (const [method, o] of Object.entries(methods)) {
      const tag = (o.tags as string[])[0]!;
      const params =
        (o.parameters as
          { name: string; in: string; required: boolean; schema: unknown }[] | undefined) ?? [];
      const body = o.requestBody as { content: Record<string, { schema: unknown }> } | undefined;
      const responses = o.responses as Record<
        string,
        { description: string; content?: Record<string, { schema: unknown }> }
      >;
      const [status, ok] = Object.entries(responses).find(([key]) => key !== 'default')!;
      const id = `${method}-${path}`.replace(/[^\w-]/g, '-');
      const html = `
<section class="op" id="${id}">
  <h3><span class="method ${method}">${method.toUpperCase()}</span> <code>${escape(path)}</code></h3>
  <p>${escape(String(o.summary))} <span class="token">Token: ${escape(String(o['x-api-token']))}</span></p>
  ${params.length ? `<table><tr><th>Parameter</th><th>In</th><th>Schema</th></tr>${params.map((p) => `<tr><td><code>${escape(p.name)}</code>${p.required ? ' *' : ''}</td><td>${p.in}</td><td><code>${escape(JSON.stringify(p.schema))}</code></td></tr>`).join('')}</table>` : ''}
  ${
    body
      ? Object.entries(body.content)
          .map(
            ([type, c]) =>
              `<details><summary>Request body <code>${escape(type)}</code></summary>${json(c.schema)}</details>`,
          )
          .join('')
      : ''
  }
  <details><summary>Response ${escape(status)} ${
    ok.content
      ? Object.keys(ok.content)
          .map((t) => `<code>${escape(t)}</code>`)
          .join(' ')
      : `– ${escape(ok.description)}`
  }</summary>${
    ok.content
      ? Object.values(ok.content)
          .map((c) => json(c.schema))
          .join('')
      : ''
  }</details>
</section>`;
      byTag.set(tag, [...(byTag.get(tag) ?? []), html]);
    }
  }
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(doc.info.title)}</title>
<style>
:root { --bg: #faf8f4; --fg: #1a1a1a; --muted: #5c5a55; --line: #ddd8cf; --code: #f0ece4; --accent: #b0341f; }
@media (prefers-color-scheme: dark) { :root { --bg: #151515; --fg: #ece9e3; --muted: #a8a49c; --line: #34322e; --code: #22211f; --accent: #e06a52; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.5 system-ui, sans-serif; }
main { max-width: 960px; margin: 0 auto; padding: 24px 16px 64px; }
h1 { font-family: Georgia, serif; font-weight: 500; font-size: 2rem; margin: 0 0 4px; }
h2 { margin: 40px 0 8px; padding-bottom: 4px; border-bottom: 2px solid var(--fg); font-size: 0.8rem; letter-spacing: 0.12em; text-transform: uppercase; }
h3 { margin: 0; font-size: 0.95rem; font-weight: 600; word-break: break-all; }
.op { padding: 12px 0; border-bottom: 1px solid var(--line); }
.op p { margin: 4px 0; color: var(--muted); }
.method { display: inline-block; min-width: 4.5em; font-size: 0.75rem; font-weight: 700; }
.get { color: #2f6f3e; } .post { color: #2b4f8a; } .put, .patch { color: #8a5a00; } .delete { color: var(--accent); }
.token { font-size: 0.8rem; margin-left: 8px; }
code { font-family: ui-monospace, monospace; font-size: 0.85em; }
pre { background: var(--code); padding: 8px; overflow-x: auto; font-size: 0.8rem; max-height: 400px; }
table { border-collapse: collapse; margin: 6px 0; font-size: 0.85rem; width: 100%; }
td, th { border-bottom: 1px solid var(--line); padding: 3px 6px; text-align: left; vertical-align: top; }
td code { word-break: break-all; }
summary { cursor: pointer; font-size: 0.85rem; color: var(--muted); }
a { color: inherit; }
nav a { margin-right: 12px; }
</style>
</head>
<body>
<main>
<h1>${escape(doc.info.title)}</h1>
<p>${escape(APP_NAME)} ${escape(doc.info.version)} · <a href="/api/openapi.json">openapi.json</a></p>
<p>${escape(doc.info.description).replace(/`([^`]+)`/g, '<code>$1</code>')}</p>
<nav>${[...byTag.keys()].map((tag) => `<a href="#${escape(tag)}">${escape(tag)}</a>`).join('')}</nav>
${[...byTag].map(([tag, ops]) => `<h2 id="${escape(tag)}">${escape(tag)}</h2>${ops.join('')}`).join('\n')}
</main>
</body>
</html>`;
}
