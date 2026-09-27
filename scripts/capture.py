"""Walkthrough ponta a ponta no ambiente local (PostgREST) com sessão injetada.
Gera capturas 1920x1080 em shots/ e lista erros de console e de página."""
import asyncio, json, sys, pathlib
from datetime import datetime
from playwright.async_api import async_playwright

BASE = "http://127.0.0.1:4173"
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "shots"; OUT.mkdir(exist_ok=True)
session = json.load(open("/home/claude/pgrst/session_ana.json"))
KEY = "sb-localhost-auth-token"

async def main():
    errors = []
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width": 1920, "height": 1080}, device_scale_factor=2, locale="pt-BR", timezone_id="America/Sao_Paulo")
        await ctx.add_init_script(f"try{{localStorage.setItem({json.dumps(KEY)}, {json.dumps(json.dumps(session))}); localStorage.setItem('z3_theme','dark');}}catch(e){{}}")
        pg = await ctx.new_page()
        await pg.clock.set_fixed_time(datetime(2026, 9, 25, 10, 24, 0))  # sexta-feira, dia útil do seed
        pg.on("pageerror", lambda e: errors.append(("pageerror", str(e))))
        pg.on("console", lambda m: errors.append(("console", m.text)) if m.type == "error" else None)
        boxes = {}
        async def click(sel, key=None, wait=0):
            loc = pg.locator(sel).first
            bb = await loc.bounding_box()
            sy = await pg.evaluate("window.scrollY")
            if bb: boxes[key or sel] = {"x": bb["x"], "y": bb["y"] + sy, "w": bb["width"], "h": bb["height"], "scrollY": sy}
            await loc.click()
            if wait: await pg.wait_for_timeout(wait)
        async def shot(name, full=False, wait=1400, both=True):
            await pg.wait_for_timeout(wait)
            await pg.screenshot(path=str(OUT / f"{name}.png"), full_page=full)
            if both and not full and not name.endswith("_full"):
                await pg.screenshot(path=str(OUT / f"{name}_full.png"), full_page=True)
            print("shot", name)

        # login neutro e com marca (sem sessão): contexto separado
        ctx2 = await b.new_context(viewport={"width": 1920, "height": 1080}, device_scale_factor=2, locale="pt-BR")
        p2 = await ctx2.new_page()
        await p2.goto(BASE + "/login"); await p2.wait_for_timeout(2500); await p2.screenshot(path=str(OUT / "00_login_neutro.png"))
        await p2.goto(BASE + "/t/pg"); await p2.wait_for_timeout(2500); await p2.screenshot(path=str(OUT / "00_login_tenant.png"))
        await ctx2.close()

        await pg.goto(BASE + "/app/hoje"); await pg.wait_for_url("**/app/hoje"); await shot("01_hoje", wait=2500)
        # simular fornecedor agendando
        try:
            await click("text=Simular fornecedor agendando", "hoje.simular", 2500); await shot("02_hoje_simulado", wait=300)
        except Exception as e: errors.append(("step", "simular: " + str(e)))
        # abrir um agendamento (drawer)
        try:
            await click("button[title*='A caminho'] >> nth=0", "hoje.appt"); await shot("03_hoje_drawer")
            await pg.keyboard.press("Escape"); await pg.wait_for_timeout(300)
        except Exception as e: errors.append(("step", "drawer: " + str(e)))
        # aprovar na fila
        try:
            await click("text=Aprovar >> nth=0", "hoje.aprovar"); await shot("03b_hoje_aprovado", wait=1200)
        except Exception as e: errors.append(("step", "aprovar: " + str(e)))
        # propor janelas aos brokers
        try:
            await click("text=Propor janelas", "hoje.propor", 2500); await shot("04_hoje_liberados", wait=300)
        except Exception as e: errors.append(("step", "propor: " + str(e)))
        await pg.goto(BASE + "/app/chegadas"); await shot("05_chegadas")
        await click("text=Todas", "chegadas.todas"); await shot("05_chegadas_todas", wait=800)
        await pg.goto(BASE + "/app/portaria"); await shot("06_portaria")
        try:
            await click("[data-sim-plate] >> nth=0", "portaria.chip"); await shot("07_portaria_leitura")
            await click("text=Liberar entrada com evidência", "portaria.liberar"); await shot("08_portaria_liberado", wait=1500)
        except Exception as e: errors.append(("step", "portaria: " + str(e)))
        await pg.goto(BASE + "/app/horizonte"); await shot("09_horizonte", wait=2000)
        await click("text=Simular pico sazonal", "horizonte.pico"); await pg.evaluate("window.scrollTo(0,0)"); await shot("10_horizonte_pico", wait=600)
        await pg.goto(BASE + "/app/zeus"); await pg.wait_for_timeout(1500)
        await click("text=Quanto de demurrage tenho em risco esta semana?", "zeus.q1", 2500)
        await click("text=Quem está atrasado agora?", "zeus.q2", 2500); await shot("11_zeus", wait=300)
        await pg.goto(BASE + "/app/regras"); await shot("12_regras")
        await pg.goto(BASE + "/app/ondas"); await shot("13_ondas")
        await pg.goto(BASE + "/tv"); await shot("14_tv", wait=2500)
        # portal do fornecedor (visto como Química Serrana)
        await pg.goto(BASE + "/portal"); await shot("15_portal", wait=2000)
        await pg.goto(BASE + "/portal/agendar"); await pg.wait_for_timeout(1500)
        try:
            await click("button.chip.mono >> nth=0", "portal.po"); await shot("16_portal_po", wait=300)
            await click("text=Continuar", "portal.cont1", 500)
            await click("text=Paletizada · carreta", "portal.carga"); await shot("17_portal_carga", wait=300)
            await click("text=Continuar", "portal.cont2", 500)
            await click("button:has-text('amanhã')", "portal.amanha", 700); await shot("18_portal_janelas", wait=300)
            await click(".mono.rounded-sm >> nth=0", "portal.janela", 300)
            await click("text=Continuar", "portal.cont3", 500)
            _bb = await pg.locator("input[placeholder='ABC1D23']").bounding_box(); boxes["portal.placa"] = {"x": _bb["x"], "y": _bb["y"], "w": _bb["width"], "h": _bb["height"], "scrollY": 0}; await pg.fill("input[placeholder='ABC1D23']", "FBS4A77"); await shot("19_portal_veiculo", wait=300)
            await click("text=Confirmar janela", "portal.confirmar"); await shot("20_portal_confirmado", wait=2000)
        except Exception as e: errors.append(("step", "portal: " + str(e)))
        await pg.goto(BASE + "/portal/agendamentos"); await shot("21_portal_meus")
        # portal no celular (mesma sessão, viewport de telefone)
        ctx3 = await b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True, locale="pt-BR", timezone_id="America/Sao_Paulo")
        await ctx3.add_init_script(f"try{{localStorage.setItem({json.dumps(KEY)}, {json.dumps(json.dumps(session))}); localStorage.setItem('z3_theme','dark');}}catch(e){{}}")
        p3 = await ctx3.new_page(); await p3.clock.set_fixed_time(datetime(2026, 9, 25, 10, 24, 0))
        await p3.goto(BASE + "/portal"); await p3.wait_for_timeout(2500); await p3.screenshot(path=str(OUT / "m15_portal.png")); print("shot m15_portal")
        await p3.goto(BASE + "/portal/agendamentos"); await p3.wait_for_timeout(2000); await p3.screenshot(path=str(OUT / "m21_portal_meus.png")); print("shot m21_portal_meus")
        await p3.goto(BASE + "/portal/agendar"); await p3.wait_for_timeout(2000); await p3.screenshot(path=str(OUT / "m16_portal_agendar.png")); print("shot m16_portal_agendar")
        await ctx3.close()
        # configurações
        for r in ["usuarios", "tenant", "unidades", "cadastros", "billing", "engajamento", "danger", "chamados", "faq", "guias"]:
            await pg.goto(BASE + "/config/" + r); await shot("22_config_" + r, wait=1800)
        # simular inadimplência (barra) e voltar
        try:
            await pg.goto(BASE + "/config/danger"); await pg.wait_for_timeout(1200)
            await click("text=Simular atraso de 8 dias", "danger.simular", 1500)
            await pg.goto(BASE + "/app/hoje"); await shot("23_hoje_barra_vermelha", wait=2200)
            await pg.goto(BASE + "/config/danger"); await pg.wait_for_timeout(1200); await pg.click("text=Limpar"); await pg.wait_for_timeout(800)
        except Exception as e: errors.append(("step", "danger: " + str(e)))
        # tema claro (white label demo)
        await pg.goto(BASE + "/app/hoje"); await pg.wait_for_timeout(1500); await click("button[aria-label='Alternar tema']", "tema"); await shot("24_hoje_claro", wait=800)
        await pg.click("button[aria-label='Alternar tema']"); await pg.wait_for_timeout(300)
        json.dump(boxes, open(OUT / "boxes.json", "w"), indent=1)
        await ctx.close(); await b.close()
    bad = [e for e in errors if "ERR_TUNNEL" not in e[1] and "functions/v1" not in e[1] and "503" not in e[1]]
    print(json.dumps(bad, ensure_ascii=False, indent=1) if bad else "NO ERRORS")

asyncio.run(main())
