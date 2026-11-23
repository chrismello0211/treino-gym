# -*- coding: utf-8 -*-
"""Todas as telas abrem sem erro, sem vazar pra fora da tela, em iPhone e Android."""
import json, random
from base import Ambiente, semente, treino, serie, ex_de_peso, AGORA, DIA

NOME = 'Telas: todas abrem sem erro (iPhone e Android)'


def _dados():
    random.seed(3)
    ids = ex_de_peso(30)
    tr = {}
    for i in range(60):
        tr['t%03d' % i] = treino('t%03d' % i, i + 1, random.choice(['Peito', 'Costas', 'Pernas']),
                                 [(e, [serie(40, 10), serie(45, 8)]) for e in random.sample(ids, 5)], feedPub=True)
    rot = {'r0': {'id': 'r0', 'titulo': 'Peito', 'pasta': 'P', 'ordem': 0, 'criado': 1,
                  'ex': [{'exId': e, 'descanso': 90, 'series': [{'tipo': 'N', 'kg': '', 'reps': ''}] * 3} for e in ids[:5]]}}
    ativo = {'id': 'a1', 'titulo': 'Peito', 'inicio': AGORA - 900000,
             'ex': [{'exId': e, 'descanso': 90, 'notas': '', 'series': [serie(40, 10, ok=j < 1) for j in range(3)]} for e in ids[:3]]}
    return ids, tr, rot, ativo


def rodar(pw, R):
    ids, tr, rot, ativo = _dados()
    telas = [('inicio', "UI.vai('inicio')"), ('treino', "UI.vai('treino')"), ('perfil', "UI.vai('perfil')"), ('ajustes', "UI.vai('config')"),
             ('medicoes', "UI.vai('medidas')"), ('calendario', "UI.vai('calendario')"), ('duelos', "UI.vai('duelos')"), ('ranking', "UI.vai('ranking')"),
             ('exercicio', "UI.vai('exercicio',{id:'%s'})" % ids[0]), ('treino feito', "UI.vai('treinoDet',{id:'t000'})"), ('ficha', "UI.vai('rotinaVer',{rid:'r0'})"),
             ('estatisticas', "UI.vai('stats')"), ('top exercicios', "UI.vai('topExercicios')"), ('relatorio', "UI.vai('relatorioMensal')"),
             ('mapa semanal', "UI.vai('mapaSemanal')"), ('meus treinos', "UI.vai('meusTreinos')"), ('explorar', "UI.vai('explorar')"),
             ('fotos', "UI.vai('fotosProg')"), ('treino em andamento', "S.ativo=%s; salva('ativo'); UI.vai('ativo',null,false)" % json.dumps(ativo)),
             ('busca de exercicio', "PICKER.abre(()=>{})")]
    for larg, alt, nome in ((393, 852, 'iPhone'), (360, 800, 'Android')):
        A = Ambiente(pw)
        try:
            p = A.celular(semente('CHRIS', tg_treinos=tr, tg_rotinas=rot, tg_pastas={'P': {'id': 'P', 'nome': 'Trilha', 'ordem': 0}}), larg, alt)
            ruins = []
            for rot_tela, js in telas:
                p.evaluate("try{UI.fechaFolha();FOLHA2.fecha()}catch(e){}")
                p.evaluate(js); p.wait_for_timeout(450)
                if p.evaluate("/Algo deu errado nesta tela/.test(document.getElementById('main').textContent)"): ruins.append(rot_tela + ': erro')
                if p.evaluate("document.documentElement.scrollWidth>innerWidth+1"): ruins.append(rot_tela + ': vaza')
            R.ok('%s: %d telas abrem sem erro e sem vazar' % (nome, len(telas)), not ruins, ruins)
            # topo do treino em andamento: nenhum numero ou rotulo cortado (os rotulos cresceram pra 12 px na 11.40)
            p.evaluate("try{UI.fechaFolha();FOLHA2.fecha()}catch(e){}; S.ativo=%s; salva('ativo'); UI.vai('ativo',null,false)" % json.dumps(ativo)); p.wait_for_timeout(500)
            cortados = p.evaluate("[...document.querySelectorAll('.cab-ta .k, .cab-ta .v')].filter(e=>e.scrollWidth>e.clientWidth+1).map(e=>e.textContent.trim())")
            R.ok('%s: topo do treino sem numero ou rotulo cortado' % nome, not cortados, cortados)
            R.ok('%s: sem erros de JavaScript' % nome, not p.erros, p.erros[:2])
        finally:
            A.fecha()
