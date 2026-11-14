# Movie identity and player return audit — 2026-11-14

The watch page must play the movie identified by the selected card, including its edition year. A remake, original and numbered sequel must never share a title-normalized source bucket.

## Scope and findings

The metadata and all 27 movie source files were inspected as one snapshot:

| Check | Result |
| --- | ---: |
| Movie metadata rows | 40,098 |
| Distinct TMDB movie IDs | 24,900 |
| Source rows | 28,440 |
| Title groups with different movie IDs after removing the year | 1,356 |
| Source rows with ambiguous metadata identity | 9 |
| Relay occurrences declaring the wrong TMDB movie ID | 648 |
| Opaque source URLs claimed by different movies | 755 |

The prior parser stripped `(1980)` and `(2009)` and appended both sets of Friday the 13th sources to one bucket. Another path stopped at the first yearless title match. The legacy `Sexta.Feira.13 -6` metadata also incorrectly declared the 2009 remake's ID.

## Changes

- Preserve the original `catalogTitle` independently of presentation text and route aliases.
- Prefer exact route IDs, then explicit type and TMDB identity. No yearless cross-type fallback.
- Index source aliases by their matching movie ID. Retain the year for title-only lookups.
- Reject contradictory relay IDs and ambiguous source ownership. A fingerprint-only snapshot quarantine also covers conflicts spread over different alphabet files and providers, without persisting tokenized source URLs in the repository.
- Correct the legacy sixth-part alias to movie 10225; reject its incorrectly advertised 13207 relays.
- Select title-search results only when the exact title and any supplied year identify one movie. Do not use the first popular result.
- Keep the dubbed-only source and recovery policy.
- Start the controls timer on playback/fullscreen entry, not only on pointer movement: 1,200ms fullscreen, 2,200ms inline. Pause/buffering and open settings/source menus keep controls available.
- Release native fullscreen and the owned orientation lock on unmount. Save progress and pause immediately on close.
- Share a bounded five-minute movie-details cache between the card and watch routes. Render the card independently of the slower source-discovery request.

## Evidence and limits

Regression fixtures isolate Friday the 13th 1980 (4488) from 2009 (13207), and The Thing 1982 from 2011, preserve old route IDs, reject conflicting streams and ambiguous search results, and test synchronous metadata reuse on return.

The complete source snapshot has **zero shared source URLs between Friday the 13th 1980 and 2009** after identity indexing. The browser workflow uses a generated test clip to verify playback recovery, fullscreen controls timing, HQ continuity and immediate player cleanup on desktop and mobile viewports.

This is a catalogue/source-association audit, not a viewing of all 24,900 movies. Opaque files cannot prove their actual content from an HTTP success or quality label. Sources claimed by different films are withheld rather than assigned an invented identity; other independent sources remain eligible. Supplier files can change and should be re-audited when a new mismatch is reported.

To reproduce: download `fichas.txt`, `indice.txt` and all `filmes-*.txt` files into a private local snapshot folder named `fichas`, `indice`, `filmes-#`, `filmes-A` ... `filmes-Z`, then run `bun scripts/audit-movie-identity.mjs <snapshot-directory>`. Use `--write-quarantine` to regenerate the reviewed fingerprint list. Do not commit the raw source snapshots or media access URLs.
