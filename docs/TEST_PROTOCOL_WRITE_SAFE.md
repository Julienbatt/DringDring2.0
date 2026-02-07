# Protocole de test "write-safe" (sans impact metier)

Objectif: valider la stabilite backend/frontend et les parcours critiques sans creer/modifier de donnees metier en staging.

## 1) Ce qui est 100% sans ecriture

1. Qualite code locale
- Backend:
  - `python3 scripts/check_migrations.py`
  - `python3 -m compileall -q app`
  - `PYTHONPATH=. python -m pytest tests -q`
- Frontend:
  - `npm run lint`
  - `npm run build`

2. Smoke API read-only (staging)
- Login (obtenir un token)
- Appels `GET` uniquement sur endpoints critiques:
  - `/health`
  - `/me`
  - `/clients/admin`
  - `/couriers`
  - `/cities`
  - `/shops/admin`
  - `/dispatch/deliveries`
  - `/billing/documents`
  - `/stats/*`

3. Verification UI sans mutation
- Navigation role par role.
- Filtres, pagination, tri, tabs, recherche.
- Ouverture modales en mode lecture.

## 2) Limite importante

Les scenarios "creation/modification/suppression" ne peuvent pas etre verifies a 100% sans ecriture quelque part.

Pour etre "write-safe", on doit isoler:
- soit une base sandbox dediee,
- soit des donnees taguees test + cleanup automatique.

## 3) Strategie recommandee pour les tests d'ecriture

## 3.1 Environnement
- Garder staging "business" pour demo/UAT.
- Ajouter un environnement "staging-sandbox" (copie conf + DB dediee).

## 3.2 Jeu de donnees test
- Prefixer toutes les donnees de test: `E2E_YYYYMMDD_*`.
- Stocker les IDs crees dans un rapport JSON de run.

## 3.3 Cleanup garanti
- Etape de cleanup obligatoire en fin de run:
  - suppression des livraisons de test,
  - suppression clients/shops/hq/villes de test,
  - reset des liens et statuts de test.

## 3.4 Garde-fous
- Abort immediat si env != sandbox.
- Abort si endpoint API ne contient pas `-staging` ou `sandbox`.
- Dry-run par defaut, write mode explicite seulement.

## 4) Scenarios metier a couvrir en sandbox

1. Admin region
- creer/modifier/supprimer client
- creer commande
- affecter coursier
- changer statut course
- recalcul facturation mensuelle (preview)

2. Shop
- creer client depuis shop
- creer commande avec heure precise
- verifier impact facturation shop

3. Dispatch / coursier
- prise course
- collecte
- livre
- annulation
- synchro desktop/mobile

4. Facturation
- recalcul mois
- export CSV/PDF
- verification coherence montants/lignes

## 5) Definition of Done "stabilite"

- Backend tests: pass
- Frontend lint/build: pass
- Smoke read-only staging: pass
- Scenarios write en sandbox: pass + cleanup pass
- Zero erreur bloquante dans logs backend/frontend sur le run

## 6) Commande rapide read-only

Voir script:
- `backend/scripts/smoke_readonly_staging.sh`

