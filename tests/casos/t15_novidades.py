# -*- coding: utf-8 -*-
"""Janela de novidades: aparece UMA vez; nunca volta (nem reabrindo, nem com ajustes antigos vindos da nuvem)."""
from base import Ambiente, semente, cfg_base, treino, serie, ex_de_peso, toca, AGORA

NOME = 'Janela de novidades (uma unica vez)'
ABERTA = "(()=>{ const f=document.getElementById('folha'); return f.classList.contains('on') && /Novidades no ForgeX/.test(f.textContent); })()"


def rodar(pw, R):
    tr = {'t1': treino('t1', 2, 'Peito', [(ex_de_peso(1)[0], [serie(40, 10)])])}
    # ajustes da nuvem MAIS RECENTES, mas de um aparelho que ainda nao tinha visto a janela (novid antigo)
    nuvem_velha = {'usuarios': {'CHRIS': {'app': {'cfg': dict(cfg_base(novid=6), atualizado=AGORA + 10 ** 7, unidade='kg')}}}}
    A = Ambiente(pw, nuvem_velha)
    try:
        p = A.celular(semente('CHRIS', tg_cfg=cfg_base(novid=6), tg_treinos=tr))
        p.wait_for_timeout(2500)
        R.ok('quem ja usa o app ve a janela de novidades', p.evaluate(ABERTA))
        R.ok('...com as 6 novidades desta versao', p.evaluate("document.querySelectorAll('#folha .nov-l').length") == 6)
        toca(p, "[...document.querySelectorAll('#folha button')].find(b=>/Bora treinar/.test(b.textContent))", 700)
        R.ok('fechar marca como vista (no app e no aparelho)', p.evaluate("S.cfg.novid") == 7 and p.evaluate("localStorage.getItem('tg_novidV')") == '7')
        p.reload(); p.wait_for_timeout(4500)
        R.ok('reabrir o app nao mostra de novo (mesmo com ajustes antigos vindos da nuvem)', not p.evaluate(ABERTA), p.evaluate("S.cfg.novid"))
        R.ok('a mescla com a nuvem nao diminui o numero das novidades', p.evaluate("S.cfg.novid") == 7)
        R.ok('sem erros de JavaScript', not p.erros, p.erros[:2])
    finally:
        A.fecha()
    A = Ambiente(pw)
    try:
        n = A.celular(semente('NOVO', tg_cfg=cfg_base(novid=0)))
        n.wait_for_timeout(3500)
        R.ok('quem nunca treinou nao ve a janela', not n.evaluate(ABERTA))
    finally:
        A.fecha()
