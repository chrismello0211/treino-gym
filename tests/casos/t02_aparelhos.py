# -*- coding: utf-8 -*-
"""Barra de abas visivel no Android instalado; compensacao do cronometro so no iPhone instalado."""
import json
from base import Ambiente, semente, serie, ex_de_peso, AGORA, UA_ANDROID, UA_IPHONE

NOME = 'Aparelhos: barra de abas no Android e cronometro no iPhone'

ABAS = """(()=>{ const t=document.getElementById('tabbar'), r=t.getBoundingClientRect(); return {lift:getComputedStyle(document.documentElement).getPropertyValue('--lift').trim()||'0px', visivel: r.top>=0 && r.bottom<=innerHeight+1}; })()"""


def rodar(pw, R):
    for nome, larg, alt, tela in (('Android instalado, botoes', 360, 728, (360, 800)), ('Android instalado, grande', 412, 835, (412, 915)), ('Android no Chrome', 360, 650, (360, 800))):
        A = Ambiente(pw)
        try:
            p = A.celular(semente('CHRIS'), larg, alt, ua=UA_ANDROID, tela=tela, android_app=('Chrome' not in nome))
            r = p.evaluate(ABAS)
            R.ok('%s: barra de abas visivel e sem compensacao' % nome, r['visivel'] and r['lift'] in ('0px', ''), r)
        finally:
            A.fecha()
    ativo = {'id': 'a1', 'titulo': 'Costas', 'inicio': AGORA - 900000, 'ex': [{'exId': ex_de_peso(1)[0], 'descanso': 90, 'notas': '', 'series': [serie(60, 9), serie('', '', ok=False)]}]}
    A = Ambiente(pw)
    try:
        # iPhone instalado com a base "levantada" 350 px pelo Safari (tela 852, area 502): o cronometro e compensado
        p = A.celular(semente('CHRIS', tg_ativo=ativo), 393, 502, ua=UA_IPHONE, tela=(393, 852), standalone=True)
        p.evaluate("UI.vai('ativo',null,false)"); p.wait_for_timeout(500)
        p.evaluate("(()=>{ const e=S.ativo.ex[0], s=e.series[1]; s.kg=70; s.reps=11; ATIVO.marca(e, s); })()"); p.wait_for_timeout(1800)
        R.ok('iPhone instalado com a base levantada: cronometro compensado 350 px', p.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--lift').trim()") == '350px')
        p.evaluate("(()=>{ const i=[...document.querySelectorAll('#main input')].find(x=>!x.readOnly && !x.disabled); i.focus(); })()"); p.wait_for_timeout(600)
        R.ok('iPhone com teclado aberto (campo em foco): sem compensacao', p.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--lift').trim()") in ('0px', ''))
    finally:
        A.fecha()
