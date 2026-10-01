"""Percurso da Gestão Z3US no ambiente local (PostgREST + proxy) com sessão de admin da plataforma.
Lista → novo tenant (formulário completo) → detalhe → convite → status → billing. Capturas em shots/gestao_*.png.
Uso: python3 scripts/gestao-walk.py"""
import asyncio, json, pathlib, sys
from playwright.async_api import async_playwright

BASE = "http://127.0.0.1:4173"
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "shots"; OUT.mkdir(exist_ok=True)
session = json.load(open("/home/claude/pgrst/session_herbert.json"))
KEY = "sb-localhost-auth-token"
SLUG = sys.argv[1] if len(sys.argv) > 1 else "alvorada"

async def main():
    errors = []
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width": 1600, "height": 1000}, device_scale_factor=1, locale="pt-BR", timezone_id="America/Sao_Paulo")
        await ctx.add_init_script(f"try{{localStorage.setItem({json.dumps(KEY)}, {json.dumps(json.dumps(session))}); localStorage.setItem('z3_theme','dark');}}catch(e){{}}")
        pg = await ctx.new_page()
        pg.on("pageerror", lambda e: errors.append(("pageerror", str(e))))
        pg.on("console", lambda m: errors.append(("console", m.text)) if m.type == "error" else None)
        async def shot(name, full=True, wait=1200):
            await pg.wait_for_timeout(wait); await pg.screenshot(path=str(OUT / f"gestao_{name}.png"), full_page=full); print("shot", name)

        await pg.goto(BASE + "/gestao"); await shot("01_lista")
        assert "Gestão Z3US" in await pg.inner_text("h1"), "lista não abriu"
        await pg.click('main a:has-text("Novo tenant")'); await pg.wait_for_url("**/gestao/novo"); await shot("02_novo_vazio", wait=800)

        await pg.fill('input[placeholder="Nortex Consumo"]', "Alvorada Bebidas")
        await pg.fill('input[placeholder="Nortex Consumo Ltda"]', "Alvorada Bebidas S.A.")
        slug = await pg.input_value('input[placeholder="nortex"]'); print("slug automático:", slug)
        if slug != SLUG: await pg.fill('input[placeholder="nortex"]', SLUG)
        await pg.fill('input[placeholder="nortex.com.br, nortex.com"]', "alvorada.com.br")
        await pg.fill('input[placeholder="Docas, gate e pátio"]', "Recebimento Alvorada")
        await pg.fill('input[placeholder="ITU"]', "jun")
        await pg.fill('input[placeholder="Itu"]', "Jundiaí")
        await pg.click('main button:has-text("Portaria")', timeout=3000)  # adiciona P2
        await pg.fill('input[placeholder="nome@cliente.com.br"]', "carla.souza@alvorada.com.br")
        await pg.fill('input[placeholder="0,00"]', "4.900,00")
        await pg.fill('input[placeholder="financeiro@cliente.com.br"]', "financeiro@alvorada.com.br")
        await shot("03_novo_preenchido", wait=600)
        await pg.click('main button:has-text("Criar tenant")')
        await pg.wait_for_url("**/gestao/*", timeout=15000); await pg.wait_for_timeout(1500)
        assert "/gestao/novo" not in pg.url, "não saiu do formulário"
        await shot("04_detalhe")
        h1 = await pg.inner_text("h1"); print("detalhe:", h1, pg.url)
        assert "Alvorada" in h1

        # convite de operador
        await pg.fill('input[placeholder="nome@cliente.com.br"]', "pedro.alves@alvorada.com.br")
        await pg.select_option("main select >> nth=0", "operator")
        await pg.click('main button:has-text("Convidar")'); await pg.wait_for_timeout(1200)
        # ativar
        await pg.click('main button:has-text("Ativar")'); await pg.wait_for_timeout(1200)
        # billing: marcar em atraso e limpar
        await pg.click('main button:has-text("Marcar em atraso")'); await pg.wait_for_timeout(1000)
        await shot("05_detalhe_atraso")
        await pg.click('main button:has-text("Limpar pendência")'); await pg.wait_for_timeout(1000)
        # item de billing
        await pg.fill('input[placeholder="Novo item"]', "Módulo Horizonte 60 dias")
        await pg.click('main button[aria-label="Adicionar item"]', timeout=3000)
        await pg.wait_for_timeout(1000)
        await shot("06_detalhe_final")
        # lista de novo
        await pg.goto(BASE + "/gestao"); await shot("07_lista_final")
        txt = await pg.inner_text("table")
        assert "Alvorada Bebidas" in txt
        # entrar no tenant
        await pg.goto(BASE + "/gestao"); await pg.click('main a:has-text("Alvorada Bebidas")'); await pg.wait_for_timeout(800)
        await pg.click('main button:has-text("Entrar neste tenant")'); await pg.wait_for_url("**/app/hoje**", timeout=10000); await pg.wait_for_timeout(1500)
        await shot("08_entrou_no_tenant", full=False)
        header = await pg.inner_text("header"); print("header:", header.replace("\n", " | ")[:200])
        await b.close()
    print("ERROS:", errors if errors else "nenhum")
    return 1 if errors else 0

sys.exit(asyncio.run(main()))
