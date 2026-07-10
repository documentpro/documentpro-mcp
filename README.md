# DocumentPro MCP Server

Connect an AI agent to DocumentPro's document extraction and classification
platform via the [Model Context Protocol](https://modelcontextprotocol.io) —
no parsing pipeline to build, no template guessing.

DocumentPro reads invoices, purchase orders, receipts, and tax forms and
returns typed JSON keyed to an exact field schema. The MCP server is a thin
layer over the same REST API used by DocumentPro's direct API customers —
same auth, same metering, same extraction pipeline. Anything an agent does
through MCP behaves identically to the REST API.

- **Endpoint:** `https://api.documentpro.ai/mcp`
- **Transport:** Streamable HTTP (stateless, JSON responses)
- **Auth:** DocumentPro API key in the `x-api-key` header — [create one free](https://app.documentpro.ai/sign-up)
- **Billing:** tool calls consume credits exactly like the equivalent REST calls, under your existing plan

## Connecting

### Claude Code

```bash
claude mcp add --transport http documentpro https://api.documentpro.ai/mcp \
  --header "x-api-key: YOUR_API_KEY"
```

### Claude Desktop / JSON-config clients

```json
{
  "mcpServers": {
    "documentpro": {
      "type": "http",
      "url": "https://api.documentpro.ai/mcp",
      "headers": { "x-api-key": "YOUR_API_KEY" }
    }
  }
}
```

### Python (MCP SDK)

```python
from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client

async with streamablehttp_client(
    "https://api.documentpro.ai/mcp",
    headers={"x-api-key": "YOUR_API_KEY"},
) as (read, write, _):
    async with ClientSession(read, write) as session:
        await session.initialize()
        tools = await session.list_tools()
```

## Tools

11 tools across four groups.

### Extraction

| Tool | Purpose |
|---|---|
| `extract_document` | Submit a document (`file_url` or `file_base64` ≤7 MB) for structured extraction against a template. Async — returns `request_id`. |
| `check_extraction_status` | Poll an extraction job. When `request_status` is `completed`, `results.data` holds the extracted fields. |
| `list_supported_formats` | File formats accepted by `extract_document` / `classify_document` (pdf, png, jpg, jpeg, tiff, tif, txt, doc, docx, html). |

### Templates (extraction schemas)

| Tool | Purpose |
|---|---|
| `list_templates` | List the extraction templates on the account (paginated, searchable). |
| `get_schema` | Get a template's field definitions — the exact field names extraction results use. |
| `create_template` | Create a new template from a title and field schema. Agents can define extraction schemas on the fly. |
| `update_template` | Replace a template's schema and/or rename it. |

Template schemas look like:

```json
{
  "fields": [
    {"name": "invoice_number", "type": "text", "description": "The invoice number"},
    {"name": "total", "type": "number"},
    {"name": "line_items", "type": "table", "subFields": [
      {"name": "description", "type": "text"},
      {"name": "amount", "type": "number"}
    ]}
  ]
}
```

Field names: lowercase letters/digits/underscores/spaces (max 50 chars,
unique). Types: `text`, `number`, `date`, `radio`, `checkbox`, `boolean`,
`object`, `table`. `table`/`object` require `subFields`. Every field is
nullable. Optional `description` (max 500 chars) and `enum` improve
accuracy.

### Classification

| Tool | Purpose |
|---|---|
| `classify_document` | Assign one of your labels to a document (inline `labels` or a saved `classifier_id`). Synchronous — returns label + confidence scores. |
| `create_classifier` | Save a reusable classifier (name + labels + optional page range). |
| `list_classifiers` | List saved classifiers with their labels. |

New documents are OCR'd automatically before classification;
`classify_document` waits briefly, and returns `DOCUMENT_NOT_READY` with a
`document_id` if OCR outlasts the wait — retry with that `document_id`
after ~15 seconds.

### Account

| Tool | Purpose |
|---|---|
| `get_credit_balance` | Check remaining plan and top-up credits before starting a batch job. |

## Example agent flows

**Extract:** `list_templates` → `get_schema` → `extract_document(file_url=...)`
→ poll `check_extraction_status(request_id)` until `completed`.

**Classify then route:** `create_classifier(labels=[invoice, purchase_order,
other])` once → for each inbound file, `classify_document(classifier_id=...,
file_url=...)` → pick the matching template → `extract_document`.

**Author a template from scratch:** `get_schema` on a similar template for a
worked example → `create_template(title, schema)` → `extract_document` with
the new `template_id` → inspect results → `update_template` to refine
fields.

## Errors

Tools return structured errors: `{"error_code": ..., "message": ...}`.

| Code | Meaning / agent action |
|---|---|
| `UNAUTHORIZED` | Missing/unknown API key — fix the `x-api-key` header. |
| `FORBIDDEN` | Resource belongs to another account. |
| `NOT_FOUND` | Bad id — re-list and retry with a valid id. |
| `INVALID_INPUT` | Input problem; message carries field-level detail — fix and retry. |
| `DOCUMENT_NOT_READY` | OCR in progress — retry with the returned `document_id` in ~15s. |
| `INSUFFICIENT_CREDITS` | Account out of credits — do not retry. Carries `credits_remaining` and `upgrade_url`. |
| `PAGE_LIMIT_EXCEEDED` | Document exceeds the page cap for this account. Carries `page_limit`. |
| `SCHEMA_UNAVAILABLE` | Stored template schema can't be rendered — choose another template. |
| `INTERNAL_ERROR` | Transient server error — retry once, then contact support. |

## Limits

- Inline `file_base64` uploads: 7 MB decoded max — host larger files and pass `file_url`.
- Extraction is asynchronous; classification is synchronous (after OCR).
- Tool calls are metered by your API key's usage plan, same as the REST API.

## Learn more

- [DocumentPro + MCP](https://documentpro.ai/mcp) — quickstart and setup for any MCP client
- [Full API documentation](https://docs.documentpro.ai) — REST reference, guides
- [Sign up](https://app.documentpro.ai/sign-up) — free tier, no credit card
- [Contact](https://documentpro.ai/contact) — custom templates, high-volume use

## License

MIT — see [LICENSE](./LICENSE). This repository documents the DocumentPro
MCP server; the server implementation itself is closed-source and hosted by
DocumentPro.
