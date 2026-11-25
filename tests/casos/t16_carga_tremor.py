# -*- coding: utf-8 -*-
"""Carga-alvo da ficha fora da realidade nao vira sugestao (nem e' gravada no ✓); a tela nao treme ao rolar."""
from base import Ambiente, semente, treino, serie, ex_por_nome, ex_de_peso, toca, AGORA, DIA

NOME = 'Sugestao de carga plausivel e rolagem sem tremor'
PUX = ex_por_nome('Puxada alta')
# area visivel 120 px menor que a tela, como no "elastico" do iPhone / barra do navegador do Android (SEM teclado)
VV_SOBRA = ("(()=>{ const f={ get height(){ return window.innerHeight-120; }, offsetTop:0, width:window.innerWidth, scale:1, "
            "addEventListener(){}, removeEventListener(){} }; Object.defineProperty(window,'visualViewport',{value:f, configurable:true}); "
            "window.__puxou=0; const o=window.scrollTo.bind(window); window.scrollTo=function(){ window.__puxou++; return o.apply(window, arguments); }; })();")


def _ativo(plano3):
    s = lambda pk, pr, tipo='N': {'tipo': tipo, 'kg': '', 'reps': '', 'ok': False, '_planKg': pk, '_planReps': pr}
    return {'id': 'a1', 'titulo': 'Costas e Triceps', 'inicio': AGORA - 600000,
            'ex': [{'exId': PUX, 'descanso': 90, 'notas': '', 'series': [s(75, 12, 'W'), s(90, 8), s(100, 6), s(plano3, 5)]}]}


def rodar(pw, R):
    hist = {'h0': treino('h0', 20, 'Costas', [(PUX, [serie(103, 4)])]),
            'h1': treino('h1', 7, 'Costas', [(PUX, [serie(75, 12, tipo='W'), serie(90, 8), serie(100, 6)])])}
    A = Ambiente(pw)
    try:
        p = A.celular(semente(None, tg_treinos=hist, tg_ativo=_ativo(160)))
        p.evaluate("CORE.reconciliaPRs(); UI.vai('ativo',null,false)"); p.wait_for_timeout(700)
        ph = p.evaluate("[...document.querySelectorAll('.srow')][3].querySelectorAll('input')[0].placeholder")
        R.ok('ficha com 160 kg (recorde 103): a caixa da serie 3 sugere 100 (a serie de cima), nao 160', ph == '100', ph)
        av = p.evaluate("[...document.querySelectorAll('.srow')][3].querySelector('.anterior').textContent")
        R.ok('...e mostra de onde veio o 160, pra corrigir a ficha', 'ficha: 160' in av, av)
        toca(p, "[...document.querySelectorAll('.srow')][3].querySelector('.scheck')", 600)
        s3 = p.evaluate("(()=>{ const s=S.ativo.ex[0].series[3]; return {kg:String(s.kg), ok:s.ok, pr:s.pr||[]}; })()")
        R.ok('marcar o ✓ com a caixa vazia grava 100, nao 160 (sem recorde falso)', s3['ok'] and s3['kg'] == '100' and not s3['pr'], s3)
        p.evaluate("(a)=>{ S.ativo=a; salva('ativo'); UI.vai('ativo',null,false); }", _ativo(110)); p.wait_for_timeout(500)
        ph2 = p.evaluate("[...document.querySelectorAll('.srow')][3].querySelectorAll('input')[0].placeholder")
        R.ok('alvo plausivel da ficha (110, piramide) continua sendo respeitado', ph2 == '110', ph2)
        R.ok('sem erros de JavaScript', not p.erros, p.erros[:2])
    finally:
        A.fecha()
    # tremor: sobra de tela sem teclado, rolando por 4 s
    tr = {'t%02d' % i: treino('t%02d' % i, i + 1, 'Treino %d' % i, [(e, [serie(40, 10)]) for e in ex_de_peso(3)], feedPub=True, volume=1200, series=3, recordes=0) for i in range(30)}
    A = Ambiente(pw)
    try:
        p = A.celular(semente('CHRIS', tg_treinos=tr), antes=VV_SOBRA)
        p.evaluate("UI.vai('inicio')"); p.wait_for_timeout(900)
        p.evaluate("window.__puxou=0")
        for _ in range(60):
            p.evaluate("document.scrollingElement.scrollTop += 25"); p.wait_for_timeout(65)
        R.ok('rolando por 4 s com a tela "sobrando": o app nao puxa a pagina (sem tremor)', p.evaluate("window.__puxou") == 0, p.evaluate("window.__puxou"))
        # o caso legitimo continua: teclado acabou de fechar e a tela ficou presa -> recupera
        p.evaluate("(()=>{ window.__recup=0; const o=window.recuperaViewport; window.recuperaViewport=function(){ window.__recup++; return o.apply(this, arguments); }; })()")
        p.wait_for_timeout(1000)
        p.evaluate("(()=>{ const i=document.createElement('input'); document.body.appendChild(i); i.focus(); i.blur(); i.remove(); })()")
        p.wait_for_timeout(3200)
        R.ok('logo depois de um teclado fechar, a tela presa continua sendo recuperada', p.evaluate("window.__recup") >= 1, p.evaluate("window.__recup"))
        R.ok('sem erros de JavaScript', not p.erros, p.erros[:2])
    finally:
        A.fecha()
