-- One-off (2026-11-04): fill «Active by device» app history from earlier app sign-ins, so «All time» shows every member
-- who ever used the app. One row per member, sign-in day and last-use day (Amman), platform from the sign-in's push
-- device (or the member's newest one), APP_OTHER when unknown. Safe to re-run (duplicates are skipped).
INSERT INTO activity_days ("userId", day, source)
SELECT DISTINCT s."userId", d.day,
  CASE coalesce(
         (SELECT p.platform FROM push_devices p WHERE p."mobileSessionId" = s.id ORDER BY p."updatedAt" DESC LIMIT 1),
         (SELECT p.platform FROM push_devices p WHERE p."userId" = s."userId" ORDER BY p."updatedAt" DESC LIMIT 1))
    WHEN 'android' THEN 'APP_ANDROID' WHEN 'ios' THEN 'APP_IOS' ELSE 'APP_OTHER' END
FROM mobile_sessions s
CROSS JOIN LATERAL (VALUES
  ((s."createdAt" + interval '3 hours')::date),
  ((coalesce(s."lastUsedAt", s."createdAt") + interval '3 hours')::date)) AS d(day)
JOIN users u ON u.id = s."userId" AND u.role = 'USER'
ON CONFLICT DO NOTHING;
