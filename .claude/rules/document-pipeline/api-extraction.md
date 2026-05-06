# Document Extraction — .claude/extraction.md
> See `api/CLAUDE.md` for pipeline overview

Downloads the document from Blob Storage and extracts text using Azure Document
Intelligence. Produces `NormalisedDocument` passed to all downstream stages.

## ADI model
Use `prebuilt-layout` for native-text documents (PDF, Word, Excel, HTML).
Use `prebuilt-read` for scanned, image-only, or handwritten documents.
For PDFs with embedded images, run `prebuilt-layout` on the document then
`prebuilt-read` on each extracted image separately.
Pin API version `2024-11-30`. Always pass bytes via `Base64Source` — never use `StartAnalyzeDocumentFromUri`.

## Citations flag
Check `CitationsEnabled` before calling ADI. When true, map `BoundingPolygon`
(8-float array, PDF points, origin top-left) from ADI onto every `NormalisedLine`.
When false, leave `BoundingPolygon` null — no coordinate data stored, no extra processing.

`NormalisedDocument` contains: `DocumentId`, `ClassificationTier`, `CitationsEnabled`,
`FullText` (all pages, reading order, `\n\n` between pages), `Pages`, `TokenCount`,
`ExtractionStatus`, and `ConvertedPdfBlobPath` (set for Word/Doc only — UI uses this for highlighting).

`NormalisedLine` contains: `LineId` (`p{page}_l{seq:D3}`), `Text`, `Role`
(heading / paragraph / subheading / footnote), `BoundingPolygon?`, `CharOffsetStart`, `CharOffsetEnd`, `Confidence`.

## Token limit and routing
After extraction, count tokens using the selected provider's tokeniser.
Compare against the model's own context limit (retrieved at runtime from the provider — do not use a fixed config threshold).
Within limit → pass `NormalisedDocument` to llm-auth.md.
Exceeds model context limit → pass to vector-search.md.
Cache `TokenCount` on the SQL document record to avoid recalculating on repeat requests.
