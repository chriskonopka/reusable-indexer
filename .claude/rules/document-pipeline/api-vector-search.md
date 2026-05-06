# Vector Search — .claude/vector-search.md
> See `api-llm-auth.md` for routing

## Where this fits
Called on Path 3 only — when `doc.TokenCount` exceeds the selected model's
context window limit. The routing threshold is the model's context window read
at runtime from provider metadata — see `api-llm-auth.md` for the source of
truth. Never hardcode a number here. Receives `NormalisedDocument` from
extraction, chunks it, embeds each chunk, stores in Azure AI Search, and at
query time retrieves the most relevant chunks to pass to the LLM.

## Chunking
Use ADI paragraph-level chunks from `NormalisedDocument.Pages`. Each ADI paragraph
is a chunk. The chunk-size limit (a different concept from the routing threshold
above — this one bounds an individual chunk's character count, not the document
total) is **800 characters**. If a paragraph exceeds 800 characters, split at
sentence boundaries into sub-chunks — do not split mid-sentence.

Each chunk carries: `chunk_id`, `document_id`, `document_type`, `section_heading`,
`page` (page number), `line_start` (first line index on page), `line_end` (last line
index on page), `bbox` (bounding box of the chunk region, PDF points), `char_offset_start`,
`char_offset_end`, `chunk_sequence`, `total_chunks_in_document`, `classification_tier`.

`classification_tier` is inherited from the document — never inferred from chunk text.

## Embedding
Model: `text-embedding-3-small` via `IEmbeddingService` (OpenAI SDK). Fixed for the
index lifetime — never switch per session or per provider. The same model must be used
at indexing time and query time. An OpenAI API key outage affects search for all
provider sessions, including Claude.

## Indexing — Azure AI Search
Store each chunk with its vector and all metadata fields as filterable attributes.
The `dimensions` value for `text-embedding-3-small` is set at index creation and is
immutable — changing it requires re-indexing all documents.

## Query time — hybrid search
Embed the user query using the same `text-embedding-3-small` model. Run BM25 + vector
hybrid search scoped to the attached document:
```
filter: document_id eq '{id}' AND classification_tier le '{userTier}'
```
Retrieve top-k chunks (default k=8). Return in `chunk_sequence` order — document
reading order, not relevance order. Pass chunk text and `bbox` coordinates to llm-auth.md.
