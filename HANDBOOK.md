# APEX Coach / personaltrainer — projecthandboek

[Documentatie-index](DOCUMENTATION.md) · [Verificatie en verbeterpunten](VERIFICATION.md) · [README](README.md)

| Documentbeheer | Waarde |
| --- | --- |
| Beoordeeld | 9 november 2026 |
| Repository | `hvanarkel-ship-it/personaltrainer` |
| Branch | `claude/apex-coach-app-TWnT3` |
| Bronsnapshot | [`a6db9067b62f`](https://github.com/hvanarkel-ship-it/personaltrainer/commit/a6db9067b62f87c95e95717e64969b3c93bcce53) |
| Scope | Bron- en documentatiecontrole; geen nieuwe runtime-, herstel- of gebruikersacceptatietest |

## Doel en gebruik

Sportcoach-app met dashboard, training, voeding, doelen, lichaamsmetingen, profiel en coachchat. Bronbestanden bevatten aansluitingen voor Garmin, Intervals en Runalyze; werkende accountsynchronisatie is niet aangetoond door deze documentatiecontrole.

Meld aan en controleer eerst dashboard en profiel. Test training/voeding/doelen met testdata. Verbind wearables pas met de juiste providerconfiguratie en bevestig daarna dat nieuwe gegevens daadwerkelijk worden teruggelezen. Een connect-handler is geen bewijs van complete synchronisatie.

## Architectuur en afhankelijkheden

React/Vite-interface → /api → Express-bridge in server.ts → handlers in netlify/functions. Dezelfde handlers worden aangeboden via Netlify; Vercel gebruikt api/index.ts. Databasebestanden bevatten schema en wearable-migraties.

**Runtime:** Netlify-configuratie gebruikt Node 22. package.json bevat npm-scripts; bun.lock is aanwezig, een package-lock.json niet.

**Technische ingang:** [server.ts](server.ts). Bestaande productspecificaties en AGENTS-instructies blijven leidend; dit handboek beschrijft de aangetroffen inrichting.

## Installatie en lokale start

Installeer met `npm install` (er is geen npm-lockfile voor npm ci), kopieer `.env.example` naar `.env` en vul uitsluitend waarden voor je eigen ontwikkelomgeving in. Controleer database/schema.sql en migraties vóór toepassing op een lege testdatabase. Start met `npm run dev`; server.ts luistert op poort 3000.

De genoemde commando's zijn afgeleid van repositorybestanden. Ze zijn in deze documentatie-update niet uitgevoerd tegen productie. Database-inrichting, migraties, seed/import en accountkoppelingen wijzigen gegevens en vereisen de juiste doelomgeving.

## Configuratie

De volgende **namen** zijn aangetroffen in [`.env.example`](.env.example). Het voorbeeld is geen volledige garantie dat alle runtimevariabelen hierin staan. Benodigde waarden hangen af van ingeschakelde functies.

- `ANTHROPIC_API_KEY`
- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `JWT_SECRET`
- `RESEND_API_KEY`
- `RESEND_FROM`
- `GARMIN_CONSUMER_KEY`
- `GARMIN_CONSUMER_SECRET`

Bewaar geheime waarden buiten Git. Een clientconfiguratie of publiek project-ID vervangt geen toegangsregels. Gebruik voor tests synthetische gegevens en een afgescheiden omgeving.

## Controles vóór een functionele release

Bestaande controlecommando's (voer ieder vanuit de repositoryroot uit, tenzij het commando zelf van map wisselt):

```sh
npm run build 
```

Een vermeld commando is geen geslaagd testresultaat. Leg uitvoerdatum, commit, omgeving, exitstatus en eventuele beperkingen vast.

1. Aanmelden, afmelden en geweigerde toegang zonder sessie.
2. Dashboard en opgeslagen trainings-/voedingsrecord teruglezen.
3. API-health en foutafhandeling bij onbereikbare database.
4. Elke gebruikte provider apart verbinden en synchronisatie verifiëren.

## Uitrol en releasebewijs

Er zijn twee hostingconfiguraties: netlify.toml bouwt dist en publiceert netlify/functions; vercel.json bouwt dist en herschrijft /api naar de API-entry. Welke host werkelijk actief is, is niet geverifieerd. Bij een lokale productie-start moet NODE_ENV=production zijn gezet na de build; npm start alleen schakelt niet automatisch naar productiemodus.

Bewaar bij een release de broncommit, uitgevoerde checks, doelomgeving, actieve versie, verificatiedatum en herstelreferentie. “In GitHub”, “build geslaagd” en “operationeel” zijn verschillende statussen.

## Back-up en herstel

Bewaar databaseback-up, schemaversie en het exact gebruikte appcommit. Providercredentials en authenticatiesleutels blijven in de secretstore. Herstel eerst zonder automatische synchronisatie; activeer providers één voor één om dubbele import te herkennen.

Een herstelprocedure is pas bewezen na een geslaagde terugleestest. Noteer wat is hersteld, welke data-ouderdom resteert en of writes/backgroundtaken tijdens herstel waren gestopt. In deze audit is geen recovery time of recovery point objective gemeten of gegarandeerd.

## Storingswijzer

| Symptoom | Eerste controle |
| --- | --- |
| Frontend werkt maar /api geeft 404 | Controleer hostingvariant en rewrites; Vite preview is geen volledige backendtest. |
| Productiestart toont ontwikkelgedrag | Controleer NODE_ENV=production in de hostconfiguratie. |
| Geen wearablegegevens | Controleer providerrechten, serverlogs en datums; beweer geen geslaagde sync op basis van de knop alleen. |

## Onderhoud

Werk documentatie bij in dezelfde wijziging als scripts, configuratie, schema, providercontracten of deploymentgedrag veranderen. Gebruik het verificatieregister voor bewijs en beperkingen; beschrijf historische resultaten met hun eigen datum. Controleer vóór een functionele release de bovenstaande acceptatiepunten en relevante bestaande CI.

## Bronverwijzingen

- [package.json](package.json)
- [server.ts](server.ts)
- [src/api.js](src/api.js)
- [netlify.toml](netlify.toml)
- [vercel.json](vercel.json)
- [.env.example](.env.example)
- [database/schema.sql](database/schema.sql)
