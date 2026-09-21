# Real images for validation

Put real photographs and screenshots here. This directory is git-ignored: the
images may show shops, packaging and your own surroundings, and none of that
belongs in the repository.

The validation harness posts the file you name to the running server's real
`/api/scan` endpoint — the same one the browser uses — and reports what the
model read, what Noura matched it to, and whether any analysis was produced.

    npm run dev
    npm run identify -- fixtures/real/yoghurt.png

A correct result is one where section 3 names the product actually in the image.
An analysis that describes anything else is a failure, however well researched.
