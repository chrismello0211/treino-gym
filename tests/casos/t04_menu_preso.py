# -*- coding: utf-8 -*-
"""O menu nunca fica preso fora da tela: arrasto interrompido por um 2o toque, e arrastar pra fechar."""
from base import Ambiente, semente, serie, ex_de_peso, AGORA

NOME = 'Menu: nunca fica preso fora da tela'
TOQUE = """(args)=>{ const [tipo, pts, sel]=args; const alvo=document.querySelector(sel)||document.body;
  const ts=pts.map((p,i)=>new Touch({identifier:i+1, target:alvo, clientX:p[0], clientY:p[1]}));
  alvo.dispatchEvent(new TouchEvent(tipo,{bubbles:true,cancelable:true,touches:(tipo==='touchend'?[]:ts),targetTouches:(tipo==='touchend'?[]:ts),changedTouches:ts})); }"""
EST = "(()=>{ const f=document.getElementById('folha'), r=f.getBoundingClientRect(); return {aberto:f.classList.contains('on'), veu:document.getElementById('veu').classList.contains('on'), topo:Math.round(r.top), desloc:f.style.transform||''}; })()"


def rodar(pw, R):
    ids = ex_de_peso(2)
    ativo = {'id': 'a1', 'titulo': 'Full Body', 'inicio': AGORA - 900000, 'ex': [{'exId': e, 'descanso': 90, 'notas': '', 'series': [serie(40, 10), serie('', '', ok=False)]} for e in ids]}
    A = Ambiente(pw)
    try:
        p = A.celular(semente(None, tg_ativo=ativo), 402, 874)
        p.evaluate("UI.vai('ativo',null,false)"); p.wait_for_timeout(600)
        abre = "(()=>{ const b=document.querySelector('button[aria-label^=\"Mais opções de\"]'); b.click(); })()"
        p.evaluate(abre); p.wait_for_timeout(600)
        topo0 = p.evaluate(EST)['topo']
        x, y = p.evaluate("(()=>{ const r=document.getElementById('folha-cab').getBoundingClientRect(); return [Math.round(r.left+r.width/2), Math.round(r.top+r.height/2)]; })()")
        p.evaluate(TOQUE, ['touchstart', [[x, y]], '#folha-cab'])
        for dy in (20, 140, 300, 460):
            p.evaluate(TOQUE, ['touchmove', [[x, y + dy]], '#folha-cab'])
        p.evaluate(TOQUE, ['touchstart', [[x, y + 460], [x + 60, y + 300]], '#folha-cab'])
        p.evaluate(TOQUE, ['touchend', [[x + 60, y + 300]], '#folha-cab']); p.evaluate(TOQUE, ['touchend', [[x, y + 460]], '#folha-cab'])
        p.wait_for_timeout(400)
        R.ok('segundo toque no meio do arrasto desfaz o deslocamento', p.evaluate(EST)['desloc'] == '', p.evaluate(EST))
        p.evaluate("UI.fechaFolha()"); p.wait_for_timeout(400); p.evaluate(abre); p.wait_for_timeout(1500)
        e = p.evaluate(EST)
        R.ok('o menu reabre no lugar certo', e['aberto'] and e['desloc'] == '' and e['topo'] == topo0, e)
        # o menu ABRE empurrado pra fora (como o defeito do iPhone): a conferencia logo apos abrir corrige
        p.evaluate("UI.fechaFolha()"); p.wait_for_timeout(400)
        p.evaluate(abre); p.evaluate("document.getElementById('folha').style.transform='translateY(900px)'"); p.wait_for_timeout(1300)
        e = p.evaluate(EST)
        R.ok('menu empurrado pra fora por outro motivo volta sozinho', e['aberto'] and e['desloc'] == '' and e['topo'] == topo0, e)
        p.evaluate(TOQUE, ['touchstart', [[x, y]], '#folha-cab'])
        for dy in (20, 120, 220, 300):
            p.evaluate(TOQUE, ['touchmove', [[x, y + dy]], '#folha-cab']); p.wait_for_timeout(30)
        p.evaluate(TOQUE, ['touchend', [[x, y + 300]], '#folha-cab']); p.wait_for_timeout(500)
        e = p.evaluate(EST)
        R.ok('arrastar 300 px pra baixo fecha o menu e o veu', not e['aberto'] and not e['veu'], e)
        R.ok('sem erros de JavaScript', not p.erros, p.erros[:2])
    finally:
        A.fecha()
