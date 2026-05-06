# Document Upload Pipeline — API Rules

> **See also:** `web-document-upload.md` — frontend upload sequence, concurrency limit (5 concurrent files), polling behaviour, and folder tree loading. Read both before implementing either side.

## Overview

The document upload pipeline accepts files from the frontend, streams them to Blob Storage, records each document in SQL, and publishes a message to Service Bus for the Worker to process. The Document Set is always the required grouping container — every document belongs to one. The UI may surface this concept under any name (workspace, matter, project) but the container must exist before any upload can begin.

---

## Document Set

- `POST /document-sets` — create a named container. Assign a UUID, add the requesting user as the first owner. Return `documentSetId`.
- Every subsequent operation (batch, upload, status, folders) is scoped to a `documentSetId`.
- Verify ownership on every operation — if the requesting user is not an owner of the document set, return `403 Forbidden`.

---

## Batch

- `POST /document-sets/{documentSetId}/batches` — create one `UploadBatch` record against the document set. Return `batchId`.
- A batch represents only the documents being uploaded in this session — it is temporary context, not the document set itself.
- A document set can accumulate many batches over its lifetime.
- Verify ownership of the document set before creating the batch.

---

## File Upload

- `POST /documents` — one call per file, with `documentSetId` and `batchId` in the request body.
- **Stream directly to Blob Storage — never load the full file into API memory.** Use `Request.Body` or `IFormFile.OpenReadStream()` and pipe to `BlobClient.UploadAsync()`.
- Blob path format: `{documentSetId}/{batchId}/{documentId}/original/{fileName}`
- Create one `Document` row in SQL — status: `Pending`.
- **Immediately publish a `DocumentIndexMessage` to Service Bus** — do not wait for all files to be uploaded. Publish as each file lands.
- Return `202 Accepted` with `documentId`.

### DocumentIndexMessage contract
```csharp
public record DocumentIndexMessage(
    Guid DocumentId,
    Guid DocumentSetId,
    Guid BatchId,
    string BlobPath,
    string ContentType,
    string FileName,
    string ClassificationTier,
    bool CitationsEnabled
);
```

Carry `OperationId` and W3C trace context on every message:
```csharp
message.ApplicationProperties["operation_id"] = operationId;
message.ApplicationProperties["traceparent"] = Activity.Current?.Id;
message.ApplicationProperties["tracestate"] = Activity.Current?.TraceStateString;
```

---

## Complete Signal

- `POST /document-sets/{documentSetId}/batches/{batchId}/complete`
- One-time signal — means "all files have been submitted, nothing more is coming."
- On receipt: count `Document` rows linked to this batch → set `UploadBatch.TotalDocuments`, update status `Pending → InProgress`.
- Make idempotent — if already `InProgress` or beyond, return `200` without reprocessing.
- Verify ownership before accepting.

---

## Status Polling

- `GET /document-sets/{documentSetId}/batches/{batchId}/status`
- Returns batch status and per-document status.
- Response shape:
```json
{
  "batchId": "uuid",
  "status": "InProgress",
  "totalDocuments": 10,
  "documents": [
    { "documentId": "uuid", "fileName": "brief.pdf", "status": "Indexed" },
    { "documentId": "uuid", "fileName": "contract.pdf", "status": "Processing" }
  ]
}
```
- Documents that reach `Indexed` are immediately queryable — do not wait for the full batch.
- Terminal batch statuses: `Completed`, `CompletedWithErrors`. Frontend stops polling on either.

---

## Folder Tree

- `GET /document-sets/{documentSetId}/folders` — return all folders and subfolders in a single call.
- Documents within folders are loaded on demand — not returned with the folder tree.
- `GET /document-sets/{documentSetId}/folders/{folderId}/documents` — paginated, returns documents for a specific folder.

---

## Ownership Rule

Every endpoint that operates on a document set must verify the requesting user is an owner before proceeding. Return `403 Forbidden` if not. Never rely on the client to enforce this.

---

## Scaling

**API** — scales on HTTP traffic. Stateless — any replica handles any request. Peak load is during file upload (Step C). Default ceiling: 500 concurrent users unless the project-level CLAUDE.md specifies otherwise.

**Worker.Documents** — scales via KEDA on Service Bus queue depth.
- Trigger: `document-index-queue` message count
- Scale ratio: **1 replica per 5 queued messages** (template default — tune per project based on per-message processing time, AI service rate limits, and queue depth observed in load testing)
- Min replicas: **1** (template default — keeps one replica warm so the first message is picked up without cold-start delay; raise if cold-start is unacceptable, lower to 0 if cost is dominant and cold-start is tolerable)
- Set `max-replicas` based on downstream processing capacity — do not set it without knowing what the document processing service can absorb

---

## Error Handling

- If Blob Storage upload fails: do not create the `Document` row, do not publish to Service Bus. Return `502` with a ProblemDetails body.
- If SQL insert fails after a successful blob upload: attempt to delete the orphaned blob, return `500`.
- If Service Bus publish fails after SQL insert: mark the document `Failed` in SQL, return `202` — the frontend will see the failure in the status poll. Do not leave the document stuck in `Pending` indefinitely.
- A failed document does not block the batch — other documents continue processing. The batch completes as `CompletedWithErrors`.
