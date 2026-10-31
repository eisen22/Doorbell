# Old design (v1) backup

The look Doorbell had before the October 2026 redesign: Plus Jakarta Sans, pastel lime / peach / lavender tiles,
white app frame floating on a light-blue background, lime bell logo.

* `tokens.css`, `app.css`, `admin.css`, `index.html`: the old style files, exactly as they were.
* `logo.svg`: the old logo.
* `screenshots/`: how the pages looked.

## Bring the old look back

The whole old version is also saved as the git tag **`design-v1`**:

```bash
git checkout design-v1 -- web/src/styles web/index.html web/src/components/ui.tsx
```

or just copy the three `.css` files from this folder back into `web/src/styles/`.
