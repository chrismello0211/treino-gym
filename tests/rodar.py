# -*- coding: utf-8 -*-
"""Roda a bateria de testes do ForgeX no navegador (Chromium do Playwright).

    python tests/rodar.py            # todos os casos
    python tests/rodar.py duelo t03  # so os casos cujo nome contem "duelo" ou "t03"

Sai com codigo 1 se algum caso falhar: no GitHub isso impede a publicacao do site.
"""
import importlib, sys, time, traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from playwright.sync_api import sync_playwright  # noqa: E402
from base import Resultado  # noqa: E402

CASOS = Path(__file__).resolve().parent / 'casos'


def main():
    filtros = sys.argv[1:]
    arquivos = sorted(f for f in CASOS.glob('t*.py') if not filtros or any(x in f.stem for x in filtros))
    if not arquivos:
        print('Nenhum caso de teste encontrado' + (' para: ' + ' '.join(filtros) if filtros else ''))
        sys.exit(1)
    R = Resultado()
    t0 = time.time()
    with sync_playwright() as pw:
        for f in arquivos:
            mod = importlib.import_module('casos.' + f.stem)
            print('\n== %s' % getattr(mod, 'NOME', f.stem))
            t1 = time.time()
            try:
                mod.rodar(pw, R)
            except Exception:
                R.ok('%s rodou sem quebrar' % f.stem, False, traceback.format_exc(limit=3))
            print('   (%.1f s)' % (time.time() - t1))
    print('\n%d verificacoes passaram, %d falharam, em %.0f s' % (R.passou, len(R.falhas), time.time() - t0))
    if R.falhas:
        print('FALHARAM:')
        for n in R.falhas:
            print('  - ' + n)
        sys.exit(1)
    print('TUDO PASSOU')


if __name__ == '__main__':
    main()
