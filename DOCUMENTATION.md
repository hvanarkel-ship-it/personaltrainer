# APEX Coach / personaltrainer — documentatie

## Snel naar de juiste informatie

| Vraag | Document |
| --- | --- |
| Wat doet dit project en hoe begin ik? | [README](README.md) |
| Hoe werkt installatie, configuratie en beheer? | [Projecthandboek](HANDBOOK.md) |
| Wat is bewezen en wat staat open? | [Verificatie en verbeterpunten](VERIFICATION.md) |

Geïnventariseerd op 9 november 2026 vanaf commit `a6db9067b62f`. Bestaande inhoud en historische dossiers zijn behouden. Een datum in een bestandsnaam maakt de inhoud niet automatisch actueel.

## Configuratie en uitvoering

- [package.json](package.json)
- [server.ts](server.ts)
- [src/api.js](src/api.js)
- [netlify.toml](netlify.toml)
- [vercel.json](vercel.json)
- [.env.example](.env.example)
- [database/schema.sql](database/schema.sql)

## Beschikbare scripts

Bron: [package.json](package.json). De tabel beschrijft de huidige opdrachten en is geen instructie om ze allemaal uit te voeren. Database-, seed-, reset-, clean-, import- en publicatiecommando's kunnen data of bestanden wijzigen.

| Script | Werkelijke opdracht |
| --- | --- |
| `dev` | `tsx server.ts` |
| `build` | `vite build` |
| `lint` | `vite build` |
| `start` | `tsx server.ts` |
| `preview` | `vite preview` |

## GitHub-workflows

Geen GitHub Actions-workflow gevonden in deze bronsnapshot.

Een workflowbestand bewijst configuratie, geen geslaagde uitvoering. Lees padfilters en triggers voordat een documentatiepush als deploymentbewijs wordt gebruikt.

## Bestaande documentatie

Er waren buiten de README geen Markdown-/MDX-documenten in deze snapshot.
