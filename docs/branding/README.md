# Docktor Branding

Fünf Container bilden ein medizinisches Kreuz – im mittleren schlägt der Puls deiner Apps.

## Dateien

| Datei | Verwendung |
| --- | --- |
| `docktor-logo.svg` | Logo (Marke + Schriftzug) für helle Hintergründe |
| `docktor-logo-light.svg` | Logo für dunkle Hintergründe |
| `docktor-mark.svg` / `docktor-mark-light.svg` | Nur Bildmarke (hell / dunkel) |
| `docktor-wordmark.svg` / `docktor-wordmark-light.svg` | Nur Schriftzug |
| `docktor-icon.svg` | App-Icon (abgerundetes Quadrat) |
| `social-preview.svg` | GitHub Social Preview, 1280×640 |
| `png/` | PNG-Exporte der obigen Dateien (2× bzw. 512/1024 px) |

Favicons und PWA-Icons liegen in `client/public/` (`favicon.svg`, `favicon.ico`,
`apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `site.webmanifest`).

Alle SVGs sind schriftunabhängig (Schriftzug als Pfade) und haben einen
transparenten Hintergrund; Rillen und Puls sind echte Aussparungen.

## Farben

| Name | Hex |
| --- | --- |
| Ink | `#0F1A1F` |
| Mint (Akzent) | `#2FD1A0` |
| Mist | `#E8EEF0` |

## README-Einbindung (hell/dunkel automatisch)

```html
<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/branding/docktor-logo-light.svg">
    <img src="docs/branding/docktor-logo.svg" alt="Docktor" height="80">
  </picture>
</p>
```

## Favicon im Client (`client/index.html`)

```html
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<meta name="theme-color" content="#0F1A1F">
```
