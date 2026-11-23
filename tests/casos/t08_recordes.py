# -*- coding: utf-8 -*-
"""Recordes: empate na carga vale a serie com mais repeticoes; comparacao usa o resumo do amigo."""
from base import Ambiente, semente, treino, serie, ex_por_nome, AGORA, DIA

NOME = 'Recordes e comparacao com amigos'


def rodar(pw, R):
    DES = ex_por_nome('Desenvolvimento na máquina')
    tr = {'t0': treino('t0', 20, 'Ombro', [(DES, [serie(90, 8)])]), 't1': treino('t1', 10, 'Ombro', [(DES, [serie(101, 4)])]),
          't2': treino('t2', 3, 'Ombro', [(DES, [serie(101, 6)])]), 't3': treino('t3', 1, 'Ombro', [(DES, [serie(101, 3)])])}
    A = Ambiente(pw)
    try:
        p = A.celular(semente('RAFA', 'rafael_chaves09', tg_treinos=tr))
        p.evaluate("CORE.reconciliaPRs()")
        p.evaluate("UI.vai('exercicio',{id:%r})" % DES); p.wait_for_timeout(700)
        tela = p.evaluate("[...document.querySelectorAll('.pr-base')].map(x=>x.textContent).slice(0,2)")
        R.ok('maior carga e 1RM mostram a mesma serie (101 kg x 6)', tela == ['101 kg × 6 reps', '101 kg × 6 reps'], tela)
        R.ok('101 x 3 depois nao tira o recorde de 101 x 6', p.evaluate("S.prs[%r].kg.tid" % DES) == 't2')
        R.ok('sem medalha de carga por so empatar a carga', p.evaluate("S.treinos.t2.ex[0].series[0].pr||[]").count('kg') == 0)
        p.evaluate("salva('prs')"); p.wait_for_timeout(2500)
        resumo = A.fb.get('/rotinasPub/RAFA/_prs') or {}
        R.ok('o resumo publico dos recordes e publicado', any(v.get('kg') == 101 for v in resumo.values()), resumo)
        # um amigo compara: ve os numeros do resumo (iguais aos do celular do Rafael)
        post = {'id': 't2', 'inicio': AGORA - 3 * DIA, 'fim': AGORA - 3 * DIA + 3600000, 'titulo': 'Ombro', 'nome': 'Rafa', 'user': 'rafael_chaves09', 'v': 2, 'volume': 600, 'series': 1, 'recordes': 0, 'atualizado': 1,
                'ex': [{'id': DES, 'n': 'Desenvolvimento na máquina', 'g': 'ombros', 's': 1, 'sr': [{'k': '90', 'r': '8', 't': 'N'}]}]}
        A.fb.put('/feed/RAFA/t2', post)
        c = A.celular(semente('CHRIS', 'chris_mello', tg_social={'seguindo': {'RAFA': {'user': 'rafael_chaves09', 'nome': 'Rafa'}}},
                              tg_treinos={'c1': treino('c1', 1, 'Ombro', [(DES, [serie(80, 8)])])}))
        c.evaluate("CORE.reconciliaPRs(); UI.vai('comparaEx',{uid:'RAFA', nome:'Desenvolvimento na máquina'})"); c.wait_for_timeout(1500)
        txt = c.evaluate("document.getElementById('main').textContent")
        R.ok('a comparacao mostra 101 kg do Rafael (e nao os 90 do feed)', '101 kg' in txt, txt[:160])
        R.ok('sem erros de JavaScript', not p.erros and not c.erros, (p.erros[:1], c.erros[:1]))
    finally:
        A.fecha()
