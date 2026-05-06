# Document Upload Pipeline — Frontend Rules

> **See also:** `api-document-upload.md` — backend blob path format, error handling, ownership enforcement (403 not 404), Service Bus contract, and KEDA scaling rules. Read both before implementing either side.

## Overview

The frontend drives the upload pipeline in a fixed sequence. Its job is to create the grouping container, submit files, signal completion, and then track progress. It does not wait for processing to finish before moving on.

The Document Set is always required before any upload begins. The UI may surface this under any name (workspace, matter, project) but it must be created first and its ID must be held for the duration of the session.

---

## Sequence

### 1. Create the Document Set
- Call `POST /document-sets` with a name.
- Store the returned `documentSetId` — every subsequent call in this session uses it.

### 2. Create the Batch
- Call `POST /document-sets/{documentSetId}/batches`.
- Store the returned `batchId` — used for the complete signal and status polling.
- The batch is session-scoped context only. Do not persist it beyond this upload session.

### 3. Upload Files
- Iterate through the file list and upload each file individually.
- Upload **up to 5 files concurrently** (template default — tune per project based on average file size, network conditions, and API replica capacity). This is a network efficiency measure, not a grouping concept. All files belong to the same batch.
- **Fire and forget per file** — do not wait for one upload to finish before starting the next (within the concurrency limit).
- Collect the `documentId` returned per file but take no further action on them at this stage.
- The frontend's only job here is to loop through the files and send them.

### 4. Signal Complete
- Once all files have been submitted, call `POST /document-sets/{documentSetId}/batches/{batchId}/complete`.
- This is a **single call**, not per-file.
- Send it immediately after the last file is submitted — do not wait for processing to begin.

### 5. Poll for Status (parallel with step 6)
- Poll `GET /document-sets/{documentSetId}/batches/{batchId}/status` every few seconds.
- Display per-document status as it updates — documents move from `Pending → Processing → Indexed` in real time.
- Documents that reach `Indexed` are immediately queryable — reflect this in the UI without waiting for the full batch.
- Stop polling when the batch status reaches `Completed` or `CompletedWithErrors`.
- On `CompletedWithErrors`, show which documents failed and why — the status response includes per-document failure reasons.

### 6. Load Folder Tree (parallel with step 5)
- At the same time as polling begins, load the folder and document structure.
- Call `GET /document-sets/{documentSetId}/folders` — returns all folders and subfolders in one call. Display immediately.
- Load documents within folders **on demand** as the user navigates — not all at once.
- As processing completes and documents move to `Indexed`, reflect their updated status in the tree.

Steps 5 and 6 run in parallel — do not block one on the other.

---

## Rules

- Never block the upload loop waiting for a previous file to be processed — upload and processing are decoupled.
- Never call `/complete` until all files have been successfully submitted.
- If an individual file upload fails, surface the error per-file — do not abort the remaining uploads.
- Do not re-upload files that have already been submitted in this session.
- The folder tree and status poll are independent — a failure in one must not stop the other.
