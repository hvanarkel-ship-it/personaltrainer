# APEX Coach / personaltrainer

Sportcoach-app met dashboard, training, voeding, doelen, lichaamsmetingen, profiel en coachchat. Bronbestanden bevatten aansluitingen voor Garmin, Intervals en Runalyze; werkende accountsynchronisatie is niet aangetoond door deze documentatiecontrole.

<!-- documentation-hub:start -->
## Projectdocumentatie

[Documentatie-index](DOCUMENTATION.md) · [Installatie en beheer](HANDBOOK.md) · [Verificatie en open punten](VERIFICATION.md)

Bijgewerkt op 9 november 2026. Het handboek onderscheidt bronconfiguratie, historische informatie en nog te verifiëren werking.
<!-- documentation-hub:end -->

## Lokaal starten

Installeer met `npm install` (er is geen npm-lockfile voor npm ci), kopieer `.env.example` naar `.env` en vul uitsluitend waarden voor je eigen ontwikkelomgeving in. Controleer database/schema.sql en migraties vóór toepassing op een lege testdatabase. Start met `npm run dev`; server.ts luistert op poort 3000.

## Techniek

React/Vite-interface → /api → Express-bridge in server.ts → handlers in netlify/functions. Dezelfde handlers worden aangeboden via Netlify; Vercel gebruikt api/index.ts. Databasebestanden bevatten schema en wearable-migraties.

## Kwaliteitscontrole

- `npm run build`

Zie het handboek voor configuratie, uitrol, back-up en concrete beperkingen. Deze README claimt geen actuele productie-uitrol.
