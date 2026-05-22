# Vendored: @hankswang123/realtime-api-beta

This directory is a **vendored copy** of the `@hankswang123/realtime-api-beta`
library, with surgical patches to drop the OpenAI Realtime Beta API
handshake (subprotocol + header), which OpenAI disabled.

**Do not refactor casually.** Patches against the upstream baseline are
intentional. See:

- `docs/superpowers/specs/2026-05-22-realtime-ga-migration-design.md`
- The PR titled "fix(realtime): migrate to OpenAI Realtime GA via in-tree fork"

If you need to change behaviour here, scope it narrowly and document the
reason in the same style.
