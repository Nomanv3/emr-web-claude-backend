# Phase 4 Step E — Parity Report

**Date:** 2026-04-19
**Method:** Captured every read-only `/api` endpoint twice — once with `USE_MYSQL=false`
(MongoDB Atlas shah cluster) and once with `USE_MYSQL=true` (MySQL `emrdevtestingdb`).
Compared by shape (object-key paths + JS types), not value, because the two datastores
hold different source data (MySQL was migrated from a different Mongo cluster).

## Result

| Metric | Count |
|--------|------:|
| Endpoints captured | 38 |
| Endpoints with identical shape | 34 |
| Endpoints with shape differences | 4 |
| Real parity bugs | **0** |

## The 4 differing files — all benign

### `22_patients_by_id` — data divergence, not code
Mongo first patient (Sharukh Khan) has a `patient_medical_history` doc;
MySQL first patient (Kavita Nair) has no corresponding row. Both controllers
correctly return `medicalHistory: {...}` when it exists and `medicalHistory: null`
when it doesn't. They just picked different patients.

Same-patient spot-check: `GET /api/patients/213b0341-…` against either backend
returns the same shape.

### `20_patients_list` / `25_patient_appointments` / `32_appointments_list` — MySQL returns superset
MySQL includes columns with `null` values (e.g. `appointmentTime: null`, `tags: null`,
`parentAppointmentId: null`, `alternatePhone: null`). Mongoose omits undefined-valued
fields from JSON serialization by default.

**Why safe:** the MySQL shape is a strict superset of the Mongo shape for the same
record. Every field Mongo provides with the same type is provided by MySQL; MySQL
additionally returns null-valued optional fields. Frontend code uses `obj.field ?? default`
patterns uniformly, so the extra null fields are invisible.

## Scripts

- `parity-step-e-capture.cjs` — hits 38 endpoints, scrubs volatile fields (tokens, `_id`,
  `createdAt`/`updatedAt`), writes normalized JSON to `baseline-mongo/` or `baseline-mysql/`.
- `parity-step-e-shape-diff.cjs` — compares both dirs by object-key paths + types;
  reports every path-level shape divergence.

## Rerunning

```bash
# From backend/:
# 1. Ensure USE_MYSQL=false, restart backend, capture:
node scripts/phase4/parity-step-e-capture.cjs --out baseline-mongo

# 2. Stop backend, flip USE_MYSQL=true in .env, restart backend, capture:
node scripts/phase4/parity-step-e-capture.cjs --out baseline-mysql

# 3. Compare:
node scripts/phase4/parity-step-e-shape-diff.cjs
```

## Conclusion

Phase 4 cut-over is parity-safe. The frontend does not need changes when
`USE_MYSQL` is flipped to `true`. Ready for Step F (cleanup: remove Mongoose
imports, drop mongoose package, update docs).
