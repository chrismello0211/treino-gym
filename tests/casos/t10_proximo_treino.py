# -*- coding: utf-8 -*-
"""Proximo treino: um duelo com a ficha de outra pessoa conta como a ficha de mesmo nome."""
from base import Ambiente, semente, treino, serie, ex_de_peso

NOME = 'Proximo treino depois de um duelo'


def rodar(pw, R):
    ids = ex_de_peso(12, pular=80)
    def rot(rid, tit, ordem, exs): return {'id': rid, 'titulo': tit, 'pasta': 'P', 'ordem': ordem, 'criado': 1, 'ex': [{'exId': i, 'descanso': 60, 'series': [{'tipo': 'N', 'kg': '', 'reps': ''}]} for i in exs]}
    rots = {'pt': rot('pt', 'Peito e Triceps', 0, ids[0:2]), 'cb': rot('cb', 'Costas e Biceps', 1, ids[2:4]), 'br': rot('br', 'Braço completo', 2, ids[4:6]), 'pe': rot('pe', 'Pernas', 3, ids[6:10])}
    tr = {'t0': treino('t0', 1, 'Costas e Biceps', [(ids[2], [serie(40, 10)])], rid='cb'),
          't1': treino('t1', 0, '⚔️ Braço completo', [(ids[10], [serie(30, 10)]), (ids[11], [serie(20, 12)])], duelo='d1')}
    A = Ambiente(pw)
    try:
        p = A.celular(semente(None, 'mari', tg_rotinas=rots, tg_pastas={'P': {'id': 'P', 'nome': 'Trilha', 'ordem': 0}}, tg_treinos=tr))
        R.ok('depois do duelo "Braço completo" (ficha de outra pessoa), o proximo e "Pernas"', p.evaluate("(proximaRotina()||{}).id") == 'pe')
        R.ok('o treino do duelo nao e alterado', p.evaluate("!S.treinos.t1.rid"))
        R.ok('sem erros de JavaScript', not p.erros, p.erros[:2])
    finally:
        A.fecha()
