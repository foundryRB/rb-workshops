---
title: Brand
id: DOC-BRAND-001
type: Standard
status: Active
updated: "2026-10-06"
summary: The Vodafone Portugal Digital identity across the application and its documentation.
---

The application and its documentation wear the Vodafone Portugal Digital identity: a
near-black stage in Dark and paper in Light, the lockup (speechmark, "Digital
Engineering" over "Vodafone Portugal", the flag) as the one mark, the brand's red as
the primary, the Vodafone face for text and Cascadia Code for identifiers.

## Application

`frontend/src/styles/theme.css` owns the palette in both appearances, the type roles
and the lockup's layout; `frontend/src/styles/fonts.css` self-hosts the Vodafone face
from `frontend/public/fonts`. The rail carries the lockup above the product name.
`frontend/public/brand/logo-mark.svg` is the speechmark used as the browser mark; the
documentation keeps the same bytes in `docs/src/assets/brand/logo-mark.svg`.

A Light / Dark / System selector controls the whole application. The preference is
saved per application origin and applied before first paint. Forms, menus and
editors keep solid, readable surfaces. Keyboard focus stays visible in both
appearances. Outcome colours keep their labels and semantic meanings; state always
carries text, never colour alone.

## Documentation

`docs/src/components/SiteTitle.astro` draws the lockup as the site title and
`docs/src/styles/vodafone.css` sets the face and the red over the shared Starlight
theme. Starlight's own appearance control serves the documentation.

## Workshops

Exported workshops are rendered from the canonical template pinned by
`renderer.lock`. That template carries its own palette, faces, mark and decoration;
the application embeds the artifact without restyling it.
