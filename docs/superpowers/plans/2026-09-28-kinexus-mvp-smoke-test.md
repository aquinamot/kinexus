# Kinexus MVP — Manual Smoke Test

Run through this once after every deploy to production, using the real deployed URL.

- [ ] Open the deployed URL — redirected to `/login`, all 3 users listed.
- [ ] Click a user, enter the wrong PIN 5 times — 6th attempt (even correct PIN) is rejected for ~30s.
- [ ] Enter the correct PIN — redirected to the dashboard.
- [ ] Reload the browser — still logged in (session cookie persisted).
- [ ] Go to "Importar treino", paste a JSON workout using the documented schema — preview shows matched/unmatched exercises correctly.
- [ ] Confirm the import — redirected to "Meus treinos", plan and exercises appear.
- [ ] Return to the dashboard — "Treino A" card appears with an "Iniciar treino" button.
- [ ] Click "Iniciar treino" — button changes to "Finalizar treino".
- [ ] Click "Finalizar treino" — today's date shows as trained on the calendar.
- [ ] Import a second workout — first plan is replaced, "Meus treinos" shows the new one only.
