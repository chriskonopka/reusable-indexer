---
name: api-add-document-upload
description: Scaffold the document upload pipeline — DocumentSets controller, Documents controller, batch management, Service Bus publishing, and status polling
---

# Add Document Upload Pipeline

## Required reading before executing this skill

Read these rule files in full before writing any code:

- `document-pipeline/api-document-upload.md` — blob path format, ownership (403), complete signal, error handling, Service Bus contract
- `document-pipeline/web-document-upload.md` — frontend upload sequence, concurrency limit (5 concurrent files), polling rules
- `document-pipeline/api-pipeline-error-handling.md` — error handling across the full pipeline
- `api-worker.md` — Service Bus message handling and Worker behaviour

---

Scaffold the full document upload pipeline: Document Set creation, batch management, file upload (streaming to Blob Storage), Service Bus publishing, complete signal, and status polling.

## Steps

1. Check whether `DocumentSetsController.cs` or `DocumentsController.cs` already exist in `Controllers/`. If either exists, stop and tell the user.
2. Check whether `DocumentIndexMessage.cs` already exists in `Messages/` or `Models/`. If it exists, stop and tell the user.
3. Scaffold the files below.
4. Register the required services in `Program.cs` or the DI extension method — see Registration section.
5. Tell the user what was created and which environment variables are required.

---

## Files to Create

### Messages/DocumentIndexMessage.cs
```csharp
namespace {{Namespace}}.Messages;

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

### Controllers/DocumentSetsController.cs
```csharp
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace {{Namespace}}.Controllers;

[ApiController]
[Authorize]
[Route("api/document-sets")]
public class DocumentSetsController(
    IDocumentSetService documentSetService,
    ILogger<DocumentSetsController> logger) : ControllerBase
{
    [HttpPost]
    public async Task<IActionResult> CreateDocumentSet(
        [FromBody] CreateDocumentSetRequest request,
        CancellationToken cancellationToken)
    {
        var userId = User.GetUserId(); // extension method — reads sub claim
        var result = await documentSetService.CreateAsync(request.Name, userId, cancellationToken);
        return CreatedAtAction(nameof(GetFolders), new { documentSetId = result.Id }, result);
    }

    [HttpPost("{documentSetId}/batches")]
    public async Task<IActionResult> CreateBatch(
        Guid documentSetId,
        CancellationToken cancellationToken)
    {
        var userId = User.GetUserId();
        var result = await documentSetService.CreateBatchAsync(documentSetId, userId, cancellationToken);
        return CreatedAtAction(nameof(GetBatchStatus), new { documentSetId, batchId = result.Id }, result);
    }

    [HttpPost("{documentSetId}/batches/{batchId}/complete")]
    public async Task<IActionResult> CompleteBatch(
        Guid documentSetId,
        Guid batchId,
        CancellationToken cancellationToken)
    {
        var userId = User.GetUserId();
        await documentSetService.CompleteBatchAsync(documentSetId, batchId, userId, cancellationToken);
        return Ok();
    }

    [HttpGet("{documentSetId}/batches/{batchId}/status")]
    public async Task<IActionResult> GetBatchStatus(
        Guid documentSetId,
        Guid batchId,
        CancellationToken cancellationToken)
    {
        var userId = User.GetUserId();
        var result = await documentSetService.GetBatchStatusAsync(documentSetId, batchId, userId, cancellationToken);
        return Ok(result);
    }

    [HttpGet("{documentSetId}/folders")]
    public async Task<IActionResult> GetFolders(
        Guid documentSetId,
        CancellationToken cancellationToken)
    {
        var userId = User.GetUserId();
        var result = await documentSetService.GetFoldersAsync(documentSetId, userId, cancellationToken);
        return Ok(result);
    }

    [HttpGet("{documentSetId}/folders/{folderId}/documents")]
    public async Task<IActionResult> GetFolderDocuments(
        Guid documentSetId,
        Guid folderId,
        [FromQuery] PagedRequest request,
        CancellationToken cancellationToken)
    {
        var userId = User.GetUserId();
        var result = await documentSetService.GetFolderDocumentsAsync(
            documentSetId, folderId, userId, request, cancellationToken);
        return Ok(result);
    }
}
```

### Controllers/DocumentsController.cs
```csharp
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace {{Namespace}}.Controllers;

[ApiController]
[Authorize]
[Route("api/documents")]
public class DocumentsController(
    IDocumentUploadService documentUploadService,
    ILogger<DocumentsController> logger) : ControllerBase
{
    [HttpPost]
    [RequestSizeLimit(104_857_600)] // 100 MB — adjust per project requirements
    public async Task<IActionResult> UploadDocument(
        [FromForm] UploadDocumentRequest request,
        CancellationToken cancellationToken)
    {
        var userId = User.GetUserId();
        var result = await documentUploadService.UploadAsync(request, userId, cancellationToken);
        return AcceptedAtAction(null, new { result.DocumentId });
    }
}
```

---

## Registration

Add to `Program.cs` or the DI extension method:

```csharp
// Blob Storage — Managed Identity
services.AddSingleton(sp =>
    new BlobServiceClient(
        new Uri(configuration["Azure:BlobStorage:ServiceUri"]!),
        new DefaultAzureCredential()));

// Service Bus — Managed Identity
services.AddSingleton(sp =>
    new ServiceBusClient(
        configuration["Azure:ServiceBus:Namespace"]!,
        new DefaultAzureCredential()));

services.AddSingleton(sp =>
    sp.GetRequiredService<ServiceBusClient>()
      .CreateSender(configuration["Azure:ServiceBus:DocumentQueueName"] ?? "document-index-queue"));

services.AddScoped<IDocumentSetService, DocumentSetService>();
services.AddScoped<IDocumentUploadService, DocumentUploadService>();
```

---

## Required Environment Variables

| Variable | Example value |
|---|---|
| `Azure__BlobStorage__ServiceUri` | `https://stmyapp.blob.core.windows.net` |
| `Azure__BlobStorage__ContainerName` | `documents` |
| `Azure__ServiceBus__Namespace` | `sb-myapp.servicebus.windows.net` |
| `Azure__ServiceBus__DocumentQueueName` | `document-index-queue` |

---

## Rules

- Replace `{{Namespace}}` with the project's root namespace
- All upload-pipeline rules — streaming to Blob, immediate Service Bus publish (no batch), `OperationId` + W3C trace context on every message, ownership verification with `403`, and pipeline error handling — are defined in `@.claude/rules/api-document-upload.md` and `@.claude/rules/api-pipeline-error-handling.md`. Verify the generated controllers and services comply.
