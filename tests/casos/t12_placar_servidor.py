# -*- coding: utf-8 -*-
"""Placar oficial: o servidor calcula com o MESMO codigo do app; o app pede o oficial e nunca grava o resultado."""
import json, subprocess
from base import Ambiente, semente, serie, ex_de_peso, espera, RAIZ, AGORA

NOME = 'Placar do duelo calculado no servidor'


def _servidor(sala):
    js = "const {calculaOficial}=require(%s); process.stdout.write(JSON.stringify(calculaOficial(JSON.parse(process.argv[1]))));" % json.dumps(str(RAIZ / 'functions' / 'placar-calculo.js'))
    r = subprocess.run(['node', '-e', js, json.dumps(sala)], capture_output=True, text=True, timeout=60)
    if r.returncode: raise RuntimeError(r.stderr[:400])
    return json.loads(r.stdout)


def _sala(sid, modo, jog, exs, status='fim', resultado=None):
    d = {'id': sid, 'a': jog[0][0], 'b': jog[1][0], 'por': jog[0][0], 'modo': modo, 'status': status, 'criado': AGORA - 7200000, 'inicio': AGORA - 7200000, 'fim': AGORA - 60000,
         'nomes': {u: {'user': u.lower()} for u, _ in jog}, 'ex': {}, 'j': {}}
    if len(jog) > 2: d['c'] = jog[2][0]
    for i, (k, exId, extra) in enumerate(exs):
        d['ex'][k] = dict({'exId': exId, 'o': i + 1, 'n': 3, 'por': jog[0][0]}, **extra)
    for u, info in jog:
        d['j'][u] = info
    if resultado: d['resultado'] = resultado
    return d


def rodar(pw, R):
    r = subprocess.run(['node', str(RAIZ / 'scripts' / 'extrai-duelo.mjs'), '--conferir'], capture_output=True, text=True)
    R.ok('o calculo do servidor (functions/duelo-core.js) esta em dia com o app', r.returncode == 0, (r.stdout + r.stderr)[:200])
    E = ex_de_peso(3, pular=120)
    s = serie
    salas = {
        'leg press da Mari (normal antigo errado)': _sala('d1', 'mano', [('C', {'estado': 'concluiu', 's': {'k1': [s(160, 9), s(200, 6), s(220, 6)]}, 'b': {'k1': 0}}), ('M', {'estado': 'concluiu', 's': {'k1': [s(200, 12), s(240, 8), s(260, 6)]}, 'b': {'k1': 37.59}})], [('k1', E[0], {'trPor': 'M'})]),
        'serie 4x acima do normal certo': _sala('d2', 'mano', [('A', {'estado': 'concluiu', 's': {'k1': [s(300, 10)]}, 'b': {'k1': 100}, 'bx': {'k1': E[0]}}), ('B', {'estado': 'concluiu', 's': {'k1': [s(200, 10)]}})], [('k1', E[0], {})]),
        'superacao': _sala('d3', 'superacao', [('A', {'estado': 'concluiu', 's': {'k1': [s(110, 10)], 'k2': [s(50, 10)]}, 'b': {'k1': 100, 'k2': 50}, 'bx': {'k1': E[0], 'k2': E[1]}}), ('B', {'estado': 'concluiu', 's': {'k1': [s(90, 10)], 'k2': [s(60, 10)]}, 'b': {'k1': 80, 'k2': 60}, 'bx': {'k1': E[0], 'k2': E[1]}})], [('k1', E[0], {}), ('k2', E[1], {})]),
        'empate': _sala('d4', 'mano', [('A', {'estado': 'concluiu', 's': {'k1': [s(100, 10)], 'k2': [s(40, 10)]}}), ('B', {'estado': 'concluiu', 's': {'k1': [s(90, 10)], 'k2': [s(50, 10)]}})], [('k1', E[0], {}), ('k2', E[1], {})]),
        '3 pessoas com desistencia': _sala('d5', 'mano', [('A', {'estado': 'concluiu', 's': {'k1': [s(100, 10)]}}), ('B', {'estado': 'desistiu', 's': {'k1': [s(120, 10)]}}), ('C', {'estado': 'concluiu', 's': {'k1': [s(90, 10)]}})], [('k1', E[0], {})]),
    }
    A = Ambiente(pw)
    try:
        p = A.celular(semente('C', 'c'))
        for nome, sala in salas.items():
            srv = _servidor(sala)
            cli = p.evaluate("(d)=>{ const r=DUELO.calcula(d); return {pts:r.pts, por:r.por, venc:r.venc||'', ordem:r.ordem}; }", sala)
            igual = srv['pts'] == cli['pts'] and srv['por'] == cli['por'] and srv['venc'] == cli['venc'] and srv['ordem'] == cli['ordem']
            R.ok('servidor e celular dao o mesmo resultado: %s' % nome, igual, (srv, cli))
        R.ok('leg press da Mari: o oficial da o exercicio pra Mari', _servidor(salas['leg press da Mari (normal antigo errado)'])['venc'] == 'M')
        # duelo antigo terminado, sem resultado oficial: o app pede o calculo (e nao grava resultado)
        velho = _sala('dV', 'mano', [('C', {'estado': 'concluiu', 's': {'k1': [s(100, 10)]}}), ('M', {'estado': 'concluiu', 's': {'k1': [s(110, 10)]}})], [('k1', E[0], {})], resultado={'v': 2, 'modo': 'mano', 'pts': {'C': 1, 'M': 0}, 'ordem': ['C', 'M'], 'venc': 'C', 'wo': False})
        p.evaluate("(d)=>{ DUELO.cur={id:d.id, dados:JSON.parse(JSON.stringify(d))}; UI.vai('duelo',{id:d.id}); }", velho); p.wait_for_timeout(1500)
        p.evaluate("NET.despacha()"); p.wait_for_timeout(1500)
        grav = [g[1] for g in A.fb.gravacoes]
        R.ok('duelo antigo sem resultado oficial: o app pede o calculo ao servidor', any(c.endswith('/duelos/dV/pedido') for c in grav), grav[-6:])
        R.ok('...e nao grava o resultado (so o servidor grava)', not any(c.endswith('/duelos/dV/resultado') for c in grav))
        R.ok('enquanto o oficial nao chega, a tela mostra o calculo atual (M vence 110 x 100)', 'marianne' not in p.evaluate("document.getElementById('main').textContent") and p.evaluate("DUELO.resOficial(DUELO.cur.dados).venc") == 'M')
        # com o resultado oficial na sala, o app usa ele
        oficial = dict(velho); oficial['resultado'] = {'v': 4, 'modo': 'mano', 'pts': {'C': 0, 'M': 1}, 'por': {'k1': 'M'}, 'ordem': ['M', 'C'], 'venc': 'M', 'wo': False, 'srv': 1}
        R.ok('com o resultado oficial na sala, o app usa o oficial', p.evaluate("(d)=>DUELO.resOficial(d).srv===1", oficial))
        # duelo terminando agora: o app grava so o fim (o servidor calcula)
        ativo = _sala('dA', 'mano', [('C', {'estado': 'concluiu', 's': {'k1': [s(100, 10)]}}), ('M', {'estado': 'concluiu', 's': {'k1': [s(90, 10)]}})], [('k1', E[0], {})], status='ativo')
        n0 = len(A.fb.gravacoes)
        p.evaluate("(d)=>{ DUELO.fecha(d); NET.despacha(); }", ativo); p.wait_for_timeout(1500)
        novos = [g[1] for g in A.fb.gravacoes[n0:]]
        R.ok('ao terminar, o app grava so o fim e o status (o resultado vem do servidor)', any(c.endswith('/duelos/dA/status') for c in novos) and not any(c.endswith('/duelos/dA/resultado') for c in novos), novos)
        R.ok('sem erros de JavaScript', not p.erros, p.erros[:2])
    finally:
        A.fecha()
