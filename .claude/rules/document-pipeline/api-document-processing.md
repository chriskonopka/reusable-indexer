Document processing lives in a `DocumentProcessing/` folder inside the ASP.NET Core API project. The API owns the upload — it streams to Blob Storage, publishes to Service Bus, and returns 202. The Worker owns the token check and decides whether to chunk. The API routes Q&A requests based on `HasVectorIndex` read from SQL.

**Blob Storage access** — use `BlobServiceClient` authenticated via `DefaultAzureCredential` (Managed Identity). Obtain a `BlobClient` from the container and call `DownloadContentAsync()` to retrieve raw bytes. Convert the bytes to Base64 and pass via `Base64Source` to Azure Document Intelligence — never use `StartAnalyzeDocumentFromUri`. The file is always stored in Blob Storage first — never pass file bytes in memory through the pipeline. `blobPath` is what travels through the system.

### Entry point — upload and route

```
Client uploads file (multipart POST)
  → API streams to Blob Storage → creates SQL Document (status: Pending)
  → API publishes DocumentIndexMessage to Service Bus
  → Returns 202 Accepted + documentId

Worker (async):
  → Extracts document → checks TokenCount against model context limit
  → Within limit  → stores extracted text to Blob Storage, saves blob path in SQL, sets HasVectorIndex = false, status = Ready
  → Exceeds limit → chunks → embeds → indexes, sets HasVectorIndex = true, status = Ready

Client polls GET /documents/{id}/status until Ready, then sends Q&A request

Q&A request:
  → API reads Document.HasVectorIndex from SQL

  IF false (within limit):
    → load extracted text from Blob Storage → inline pipeline (stages 1–5) → SSE stream back to client

  IF true (over limit):
    → vector search path (stage 6) → SSE stream back to client
```

### Pipeline stages — see the linked rule for each stage
1. Extract document and check token limit → `document-pipeline/api-extraction.md`
2. Load conversation history and token budget → `document-pipeline/api-conversation-history.md`
3. Route and call LLM provider → `api-llm-auth.md`
4. Build citations if enabled → `document-pipeline/api-citations.md`
5. Stream response to client → `api-streaming.md`
6. Vector search / chunking / embeddings → `document-pipeline/api-vector-search.md` *(over-limit path only — Worker pre-indexes, API queries)*

### Conventions
- `ClassificationTier` is always known at entry. Pass through every stage unchanged. Never infer from content.
- Check `CitationsEnabled` before extraction — it controls whether bounding boxes are extracted.
- Every LLM call must include conversation history regardless of path or provider.
- All external calls (ADI, OpenAI, Claude) follow the outbound-throttling rule in `api-performance.md` — SDK built-in retry where available, `AddStandardResilienceHandler()` otherwise.
- The token check is a routing decision made by the Worker, not the upload API — never return an error solely because the token limit is exceeded.

### Skills — named entry points for each pipeline stage
Skills are service classes with a fixed method signature. Use these — do not invent alternatives.

- `DocumentExtractionSkill.ExtractAsync(blobPath, citationsEnabled, classificationTier, ct)` → `NormalisedDocument`
- `LlmRoutingSkill.RouteAsync(question, doc, history, provider, citationsEnabled, ct)` → `IAsyncEnumerable<LlmToken>`
- `CitationBuilderSkill.BuildAsync(rawLlmResponse, doc.Pages, ct)` → `CitationResponse`
- `ConversationHistorySkill.LoadAsync(conversationId, ct)` → `(Messages, ActiveDocumentIds)`
- For SSE format, event multiplexing, and disconnection handling → `api-streaming.md`

### Related rules (read on demand)
- `document-pipeline/api-pipeline-error-handling.md`
- `document-pipeline/api-pipeline-tests.md`
