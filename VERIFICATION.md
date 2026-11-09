# APEX Coach / personaltrainer — verificatie en verbeterpunten

[Handboek](HANDBOOK.md) · [Documentatie-index](DOCUMENTATION.md)

## Audit van 9 november 2026

Bron: default branch `claude/apex-coach-app-TWnT3`, commit `a6db9067b62f87c95e95717e64969b3c93bcce53`. Beoordeeld zijn de bestandsinventaris, onderstaande bronverwijzingen uit het handboek, bestaande start-/testcommando's en uitrolinstructies. Dit is een documentatie-audit, geen penetratietest, productiecertificering of volledige code-audit.

| Bewijsniveau | Betekenis |
| --- | --- |
| Bron bevestigd | Pad, script of instelling aanwezig in de genoemde snapshot |
| Gedocumenteerd | Bestaande README/handleiding beschrijft gedrag; runtime nog niet opnieuw bewezen |
| Live geverifieerd | Alleen gebruiken met echte waarneming, datum, omgeving en resultaat |
| Open | Benodigde controle of informatie ontbreekt |
| Historisch | Geldig als verslag van toen; niet automatisch actuele status |

## Open register

Prioriteiten: P1 = relevant voor correcte uitrol, databehoud of gebruikerswerking; P2 = onderhoud/duidelijkheid. Een prioriteit is geen incidentdiagnose of bewezen exploit.

| ID | Prioriteit | Bevinding | Afsluitcriterium | Status |
| --- | --- | --- | --- | --- |
| DOC-01 | P1 | Default branch heet claude/apex-coach-app-TWnT3, niet main. | Behoud deze branch bij checkout en noteer de gekozen productiebranch. | Open |
| DOC-02 | P1 | lint voert alleen vite build uit; er is geen testscript of GitHub Actions-workflow in deze snapshot. | Voeg echte regressietests toe bij functionele ontwikkeling; noem een build geen volledige lint/testdekking. | Open |
| DOC-03 | P1 | Netlify en Vercel zijn beide geconfigureerd; de actieve host is onbekend. | Leg één werkelijk gebruikte uitrolroute met releasebewijs vast. | Open |

## Release- en overdrachtsrecord

Gebruik onderstaand sjabloon voor toekomstige releases; lege velden zijn geen afgerond bewijs.

| Veld | Vast te leggen |
| --- | --- |
| Wijziging | Probleem, beoogd resultaat en betrokken bestanden |
| Bronversie | Commit en eventueel PR |
| Omgeving | Ontwikkeling, test of productie; geen credentials |
| Validatie | Exact commando/handeling, datum, resultaat en bewijslink |
| Datawijziging | Migratie/import of expliciet geen |
| Uitrol | Actieve versie en controle op doelomgeving |
| Herstel | Vorige versie, back-upreferentie en compatibiliteit |
| Beperkingen | Wat niet is getest en waarom |
| Afsluiting | Wie/wat vervolg oppakt en controleerbaar afsluitcriterium |

## Definitie van documentatie-compleet

- Doel, architectuur, installatie, configuratie en gebruik zijn vindbaar.
- Start-/testcommando's verwijzen naar werkelijk bestaande scripts.
- Uitrol, databehoud, terugdraaien en storingen hebben concrete instructies.
- Bekende gaten blijven zichtbaar met een afsluitcriterium.
- Operationeel bewezen wordt pas vermeld na werkelijke controle; onbekende hosting, rechten en restore-status worden niet ingevuld met aannames.

Deze update voltooit de beschreven documentatiestructuur. De open punten hierboven blijven open totdat hun eigen bewijs beschikbaar is.
