# Backend DringDring

API FastAPI gérant la logique métier, la tarification et la sécurité de DringDring.

## Installation

```bash
pip install -r requirements.txt
```

## Développement

Lancer le serveur de dev :

```bash
uvicorn app.main:app --reload
```

## Tests

Lancer la suite de tests (`pytest`) :

```bash
python -m pytest tests -v
```

## Seeding (Données de test)

Pour peupler la base de données avec des utilisateurs et des configurations de test :

```bash
python scripts/seed.py
```

### Utilisateurs créés
Tous les mots de passe sont : `password`

| Rôle | Email | Contexte |
|------|-------|----------|
| **Super Admin** | `superadmin@dringdring.ch` | Accès total |
| **Admin Région** | `admin_vs@dringdring.ch` | Vélocité Valais |
| **Ville** | `sion@dringdring.ch` | Commune de Sion |
| **HQ** | `migros@dringdring.ch` | Migros Valais |
| **Shop** | `shop_metropole@dringdring.ch` | Migros Métropole (Sion) |
| **Shop (Indé)** | `shop_mario@dringdring.ch` | Chez Mario (Sion, sans HQ) |
| **Client** | `client@dringdring.ch` | Client final (Vue perso) |

## Database migrations

Recommended order for a fresh database (includes latest billing + stats work):

1. `backend/generated_schema.sql`
2. `backend/migrations/update_schema_v2.sql`
3. `backend/migrations/update_schema_v3.sql`
4. `backend/migrations/update_schema_dispatch_v4.sql`
5. `backend/migrations/update_client_v5.sql`
6. `backend/migrations/update_security_v6.sql`
7. `backend/migrations/update_security_v10.sql`
8. `backend/migrations/update_delivery_status_v11.sql`
9. `backend/migrations/update_delivery_status_history_v12.sql`
10. `backend/migrations/update_shop_fields_v13.sql`
11. `backend/migrations/update_delivery_logistics_short_code_v14.sql`
12. `backend/migrations/update_admin_region_fields_v15.sql`
13. `backend/migrations/update_security_v16.sql`
14. `backend/migrations/update_customer_link_v17.sql`
15. `backend/migrations/update_security_v18.sql`
16. `backend/migrations/update_security_v19.sql`
17. `backend/migrations/update_cantons_v20.sql`
18. `backend/migrations/update_security_v21.sql`
19. `backend/migrations/update_security_v22.sql`
20. `backend/migrations/update_security_v23.sql`
21. `backend/migrations/update_tariff_share_v24.sql`
22. `backend/migrations/update_tariff_constraints_v25.sql`
23. `backend/migrations/update_security_v26.sql`
24. `backend/migrations/update_security_v27.sql`
25. `backend/migrations/update_billing_period_pdf_generated_at_v28.sql`
26. `backend/migrations/update_billing_period_frozen_comment_v29.sql`
27. `backend/migrations/update_geo_distance_v30.sql`
28. `backend/migrations/update_city_fields_v31.sql`
29. `backend/migrations/update_city_hierarchy_v32.sql`
30. `backend/migrations/update_security_v33.sql`
31. `backend/migrations/update_hq_fields_v34.sql`
32. `backend/migrations/update_billing_period_comment_v35.sql`
33. `backend/migrations/update_settings_v36.sql`
34. `backend/migrations/update_billing_documents_v37.sql`
35. `backend/migrations/update_security_v38.sql`
36. `backend/migrations/update_admin_region_billing_v39.sql`
37. `backend/migrations/update_billing_documents_v40.sql`
38. `backend/migrations/update_admin_region_logo_v41.sql`
39. `backend/migrations/update_security_v42.sql`
40. `backend/migrations/update_admin_region_internal_billing_v43.sql`
41. `backend/migrations/update_admin_region_internal_logo_v44.sql`
42. `backend/migrations/update_billing_documents_v45.sql`
43. `backend/migrations/update_billing_views_v46.sql`
44. `backend/migrations/update_delivery_logistics_basket_value_v47.sql`
45. `backend/migrations/update_delivery_financial_cms_subsidy_v48.sql`
46. `backend/migrations/update_courier_dispatch_v1.sql`
47. `backend/migrations/update_client_email_v49.sql`
48. `backend/migrations/update_billing_indexes_v49.sql`
49. `backend/migrations/update_security_v45.sql`
50. `backend/migrations/update_security_v46.sql`

Notes:
- There are two migrations with suffix `v49` (`update_client_email_v49.sql` and `update_billing_indexes_v49.sql`).
- On an existing DB, run both once; they touch different objects.

Legacy tariff upgrade (only if your DB still has `public.tariff` + `tariff_version.tariff_id`):

1. `backend/migrations/update_tariff_grid_v7.sql`
2. `backend/migrations/update_tariff_cleanup_v8.sql`
3. `backend/migrations/update_tariff_drop_v9.sql`
4. Re-run `backend/migrations/update_security_v6.sql`
5. `backend/migrations/update_security_v10.sql`
6. `backend/migrations/update_delivery_status_v11.sql`
7. `backend/migrations/update_delivery_status_history_v12.sql`
8. `backend/migrations/update_shop_fields_v13.sql`
9. `backend/migrations/update_delivery_logistics_short_code_v14.sql`
10. `backend/migrations/update_admin_region_fields_v15.sql`
11. `backend/migrations/update_security_v16.sql`
12. `backend/migrations/update_customer_link_v17.sql`
13. `backend/migrations/update_security_v18.sql`
14. `backend/migrations/update_security_v19.sql`

Rollback helpers:
- `backend/migrations/rollback_tariff_grid_v7.sql`
- `backend/migrations/rollback_tariff_cleanup_v8.sql`
- `backend/migrations/rollback_tariff_drop_v9.sql`

One-off maintenance:
- `backend/scripts/backfill_app_metadata.sql` (sync auth.app_metadata from public.profiles)
  - Users must refresh tokens after backfill (logout/login) for JWT claims to include the new metadata.
- `backend/scripts/backfill_app_metadata.py` (CLI runner for the same backfill)
