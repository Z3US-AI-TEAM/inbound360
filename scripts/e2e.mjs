// Roteiro ponta a ponta (Playwright) · exige VITE_* apontando para um projeto Supabase com o seed e um usuário admin.
// Uso: E2E_URL=http://localhost:4173 E2E_EMAIL=... E2E_PASSWORD=... node scripts/e2e.mjs
import { chromium } from "playwright";
const url = process.env.E2E_URL || "http://localhost:4173";
const b = await chromium.launch(); const pg = await b.new_page({ viewport: { width: 1366, height: 900 } });
const errors = []; pg.on("pageerror", (e) => errors.push(String(e)));
await pg.goto(url + "/login"); await pg.waitForTimeout(1500);
if (process.env.E2E_EMAIL) {
  await pg.fill('input[type="email"]', process.env.E2E_EMAIL); await pg.fill('input[type="password"]', process.env.E2E_PASSWORD || "");
  await pg.click('button[type="submit"]'); await pg.waitForURL("**/app/hoje", { timeout: 15000 });
  for (const r of ["/app/hoje", "/app/chegadas", "/app/portaria", "/app/horizonte", "/app/zeus", "/app/regras", "/portal", "/config/usuarios", "/config/engajamento", "/tv"]) {
    await pg.goto(url + r); await pg.waitForTimeout(1200); await pg.screenshot({ path: `shots/e2e${r.replace(/\//g, "_")}.png`, fullPage: true });
  }
}
await b.close();
console.log(errors.length ? errors : "NO ERRORS");
