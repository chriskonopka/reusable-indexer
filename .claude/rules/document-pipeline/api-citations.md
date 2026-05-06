# Citation Pattern — .claude/citations.md
> See `api/CLAUDE.md` for pipeline overview

If `CitationsEnabled` is false, skip this file entirely — no bounding boxes were extracted,
no prompt labels are added, and no citation parsing is needed.

## How it works
During extraction, ADI returns an 8-float bounding polygon per line `[x1,y1,x2,y2,x3,y3,x4,y4]`
stored on `NormalisedLine.BoundingPolygon` (extraction.md). The prompt builder converts this
to a rectangle before labelling: `x = min(x1,x4)`, `y = min(y1,y2)`, `w = max(x2,x3)-x`,
`h = max(y3,y4)-y`. Each line is then labelled as `[N] (page, x, y, w, h) "text..."` so
the LLM can reference lines by number. The system prompt instructs the LLM to embed `[cite:N]`
markers inline in its answer and return a `citations` array with coordinates for each marker.
`CitationBuilderSkill` parses the response and attaches coordinates before streaming to the API.
The UI draws highlight rectangles at those coordinates in the document viewer.
Works the same on both Path 2 (full text) and Path 3 (chunks).

## Response shape
`CitationResponse` contains `Answer` (full text with inline `[cite:N]` markers) and
`Citations` (list of `Citation` records). Each `Citation` has `Marker` (the N value),
`Page` (1-based), `X`, `Y`, `W`, `H` (PDF points, origin top-left).

Hallucinated markers with no matching line are silently discarded.
Coordinates are passed as-is — the UI applies the render scale factor to convert to screen pixels.
