# Document Upload Reference

This folder contains rule files for an opt-in document upload + RAG (retrieval-augmented generation) reference implementation. These rules describe a specific product domain: streaming uploads to Blob Storage, indexing through a Service Bus worker, vector search, citations, and conversation history.

## When to keep this folder

Keep these rules if your project ships any of:

- File upload to Azure Blob Storage with batch grouping
- Document text extraction (Azure Document Intelligence or similar)
- Vector search / embeddings for RAG
- LLM Q&A with citations against uploaded documents
- Conversation history with token-budget trimming

## When to delete it

If your project does not ship a document/RAG pipeline, delete this folder and the matching skill folder:

```
rm -rf .claude/rules/document-pipeline
```

You can also strip the `Document upload`, `Document processing`, `Vector search`, `Citations`, and `Conversation history` rows from the rule tables in the root `CLAUDE.md` and `api/CLAUDE.md`. The rest of the template stands on its own.

## Files in this bundle

| File                             | What it covers                                                                                                    |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `api-document-upload.md`         | API side: blob path format, batch lifecycle, complete signal, ownership (403), Service Bus contract, KEDA scaling |
| `web-document-upload.md`         | Web side: upload sequence, concurrency window, status polling, folder tree loading                                |
| `api-document-processing.md`     | Worker pipeline stages: extract → history → route → cite → stream → vector search                                 |
| `api-pipeline-error-handling.md` | Cross-pipeline error handling: blob fail, SQL fail, Service Bus fail, dead-letter, retry classes                  |
| `api-pipeline-tests.md`          | Test requirements for pipeline / worker / Service Bus code                                                        |
| `api-extraction.md`              | Document Intelligence extraction, normalisation, token-limit checks                                               |
| `api-vector-search.md`           | Chunking, embeddings, similarity search, over-limit routing                                                       |
| `api-citations.md`               | Citation building, bounding boxes, response shape                                                                 |
| `api-conversation-history.md`    | History trimming budget, append-with-ETag, blob storage layout                                                    |

The matching skill is `api-add-document-upload` (skill folder retained at its original path).
