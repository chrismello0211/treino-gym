# -*- coding: utf-8 -*-
"""Editar treino finalizado com toques reais: busca, adicionar exercicio, aviso de exercicio vazio, salvar."""
from base import Ambiente, semente, treino, serie, ex_por_nome, toca, centro

NOME = 'Editar treino finalizado (toques reais)'
BT_ADD = "[...FOLHA2.el.querySelectorAll('.menu-op')].find(x=>x.textContent.includes('+') && x.textContent.includes('exerc'))"
ESTADO = "({lista:document.getElementById('folha').classList.contains('on'), titulo:(document.getElementById('folha-titulo')||{}).textContent||'', edicao:!!FOLHA2.el, foco:(document.activeElement||{}).tagName, leg:!!FOLHA2.el && /Leg press/i.test(FOLHA2.el.textContent)})"


def _adiciona_leg(p):
    toca(p, BT_ADD, 900)
    toca(p, "document.querySelector('#folha input')", 700)
    p.keyboard.type('leg press'); p.wait_for_timeout(700)
    toca(p, "[...document.querySelectorAll('#folha-corpo *')].filter(e=>/^Leg press/i.test((e.textContent||'').trim()) && e.getBoundingClientRect().height>30 && e.getBoundingClientRect().height<110).pop()", 1000)


def rodar(pw, R):
    t1 = treino('t1', 1, 'Costas e Triceps', [(ex_por_nome('Tríceps pulley barra'), [serie(30, 10)])], feedPub=True)
    A = Ambiente(pw)
    try:
        p = A.celular(semente('CHRIS', tg_treinos={'t1': t1}))
        p.evaluate("UI.vai('treinoDet',{id:'t1'})"); p.wait_for_timeout(600)
        p.evaluate("EDTREINO.abre(S.treinos.t1)"); p.wait_for_timeout(800)
        toca(p, BT_ADD, 900)
        toca(p, "document.querySelector('#folha input')", 800)
        e = p.evaluate(ESTADO)
        R.ok('tocar na busca mantem a lista aberta com o cursor no campo', e['lista'] and e['foco'] == 'INPUT', e)
        p.keyboard.type('leg press'); p.wait_for_timeout(700)
        toca(p, "[...document.querySelectorAll('#folha-corpo *')].filter(e=>/^Leg press/i.test((e.textContent||'').trim()) && e.getBoundingClientRect().height>30 && e.getBoundingClientRect().height<110).pop()", 1000)
        e = p.evaluate(ESTADO)
        R.ok('tocar no exercicio adiciona na edicao', e['leg'] and not e['lista'], e)
        # salvar com o exercicio novo vazio: aviso
        toca(p, "[...FOLHA2.el.querySelectorAll('button')].find(x=>/^Salvar/i.test(x.textContent.trim()))", 900)
        e = p.evaluate(ESTADO)
        R.ok('salvar com exercicio sem serie mostra o aviso', e['lista'] and 'sem série' in e['titulo'], e)
        toca(p, "[...document.querySelectorAll('#folha-corpo button')].find(x=>/Voltar e preencher/.test(x.textContent))", 700)
        e = p.evaluate(ESTADO)
        R.ok('"Voltar e preencher" volta pra edicao sem salvar', not e['lista'] and e['edicao'] and len(p.evaluate("S.treinos.t1.ex")) == 1, e)
        toca(p, "[...FOLHA2.el.querySelectorAll('button')].find(x=>/^Salvar/i.test(x.textContent.trim()))", 900)
        toca(p, "[...document.querySelectorAll('#folha-corpo button')].find(x=>/Salvar sem/.test(x.textContent))", 1200)
        R.ok('"Salvar sem ele" salva sem o exercicio vazio', not p.evaluate("!!FOLHA2.el") and [x['exId'] for x in p.evaluate("S.treinos.t1.ex")] == [ex_por_nome('Tríceps pulley barra')])
        # de novo, agora preenchendo a serie: o exercicio fica gravado
        p.evaluate("EDTREINO.abre(S.treinos.t1)"); p.wait_for_timeout(800)
        _adiciona_leg(p)
        p.evaluate("(()=>{ const bl=[...FOLHA2.el.querySelectorAll('*')].filter(e=>/Leg press/i.test(e.textContent) && e.querySelectorAll('input').length>=2).sort((a,b)=>a.textContent.length-b.textContent.length)[0]; [...bl.querySelectorAll('input')].forEach((i,k)=>i.setAttribute('data-t','lp'+k)); })()")
        for k, val in ((0, '120'), (1, '10')):
            toca(p, "document.querySelector('[data-t=lp%d]')" % k, 300); p.keyboard.type(val)
        toca(p, "[...FOLHA2.el.querySelectorAll('button')].find(x=>/^Salvar/i.test(x.textContent.trim()))", 1200)
        nomes = p.evaluate("S.treinos.t1.ex.map(e=>(BIB.ex(e.exId)||{}).n)")
        R.ok('com a serie preenchida, salvar grava o exercicio novo (sem aviso)', any('Leg press' in (n or '') for n in nomes) and not p.evaluate("document.getElementById('folha').classList.contains('on')"), nomes)
        R.ok('sem erros de JavaScript', not p.erros, p.erros[:2])
    finally:
        A.fecha()
