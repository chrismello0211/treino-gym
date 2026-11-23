# -*- coding: utf-8 -*-
"""Duelo com 3 celulares: ficha unica, convites, e a regra de quem leva cada exercicio."""
import json
from base import Ambiente, semente, serie, ex_de_peso, espera, AGORA

NOME = 'Duelo: 3 celulares, convites e regra do placar'


def rodar(pw, R):
    E = ex_de_peso(5, pular=40)
    rot = {'r1': {'id': 'r1', 'titulo': 'Braco completo', 'ex': [{'exId': i, 'descanso': 60, 'series': [{'tipo': 'N', 'kg': '', 'reps': ''}] * 3} for i in E[:4]]}}
    arv = {'config': {'duelo3': True}, 'perfis': {'CHRIS': {'user': 'chris_mello'}, 'RAFA': {'user': 'rafael_chaves09'}, 'MARI': {'user': 'marianne_marques'}}}
    seg = lambda eu: {'seguindo': {u: {'user': n} for u, n in (('CHRIS', 'chris_mello'), ('RAFA', 'rafael_chaves09'), ('MARI', 'marianne_marques')) if u != eu}}
    A = Ambiente(pw, arv)
    try:
        M = A.celular(semente('MARI', 'marianne_marques', tg_rotinas=rot, tg_social=seg('MARI')))
        C = A.celular(semente('CHRIS', 'chris_mello', tg_social=seg('CHRIS')), 360, 800)
        Rf = A.celular(semente('RAFA', 'rafael_chaves09', tg_social=seg('RAFA')))
        ST = lambda i: A.fb.get('/duelos/%s/status' % i)
        convida = "DUELO.desafiar([{uid:'CHRIS',user:'chris_mello'},{uid:'RAFA',user:'rafael_chaves09'}],'mano','r1')"
        M.evaluate(convida); M.wait_for_timeout(900); d1 = M.evaluate("DUELO.cur && DUELO.cur.id")
        C.evaluate("DUELO.verConvites(true)"); C.wait_for_timeout(1000)
        velho = C.evaluate("JSON.parse(JSON.stringify((DUELO._convites||[]).find(x=>x.id===%r)||null))" % d1)
        M.evaluate(convida); M.wait_for_timeout(1500); d2 = M.evaluate("DUELO.cur && DUELO.cur.id")
        R.ok('convite repetido cancela o anterior', d1 != d2 and ST(d1) == 'cancelado' and ST(d2) == 'convite', (ST(d1), ST(d2)))
        C.evaluate("(d)=>DUELO.aceitar(d)", velho); C.wait_for_timeout(1000)
        R.ok('aceitar um convite velho (cancelado) e recusado', not C.evaluate("!!S.ativo") and ST(d1) == 'cancelado')
        for p in (C, Rf):
            p.evaluate("(async()=>{ const d=await NET.get('/duelos/%s'); DUELO.aceitar(d); })()" % d2); p.wait_for_timeout(1300)
        R.ok('os tres entram no duelo', all(espera(p, "S.ativo && S.ativo.duelo===%r" % d2) for p in (M, C, Rf)))
        ficha = "S.ativo.ex.filter(e=>!(((DUELO.dados()||{}).ex||{})[e._dk]||{}).rm).map(e=>e.exId)"
        def iguais():
            for _ in range(40):
                f = [p.evaluate(ficha) for p in (M, C, Rf)]
                if f[0] == f[1] == f[2]: return True, f[0]
                M.wait_for_timeout(300)
            return False, [p.evaluate(ficha) for p in (M, C, Rf)]
        Rf.evaluate("(x)=>{ S.ativo.ex.push({exId:x, descanso:60, notas:'', series:[{tipo:'N',kg:'',reps:'',ok:false}]}); salva('ativo'); UI.refaz(); }", E[4])
        ok_, f = iguais()
        R.ok('exercicio adicionado pelo Rafael aparece pros tres (ficha igual)', ok_ and E[4] in f, f)
        Rf.evaluate("(x)=>{ S.ativo.ex.splice(S.ativo.ex.findIndex(e=>e.exId===x),1); salva('ativo'); UI.refaz(); }", E[3]); Rf.wait_for_timeout(500)
        ok_, f = iguais()
        R.ok('exercicio removido sai da ficha dos tres', ok_ and E[3] not in f, f)
        R.ok('ninguem aparece como desistente', all(A.fb.get('/duelos/%s/j/%s/estado' % (d2, u)) == 'treinando' for u in ('MARI', 'CHRIS', 'RAFA')))
        # regra: toda serie conta (sem o antigo filtro de 1,6x o normal); 1RM estimado decide
        sala = {'id': 'dR', 'a': 'CHRIS', 'b': 'MARI', 'por': 'MARI', 'modo': 'mano', 'status': 'fim', 'criado': AGORA, 'inicio': AGORA, 'fim': AGORA,
                'nomes': {'CHRIS': {'user': 'chris_mello'}, 'MARI': {'user': 'marianne_marques'}},
                'ex': {'k1': {'exId': E[0], 'o': 1, 'n': 3, 'por': 'MARI', 'trPor': 'MARI'}},
                'j': {'MARI': {'estado': 'concluiu', 's': {'k1': [serie(200, 12), serie(240, 8), serie(260, 6)]}, 'b': {'k1': 37.59}},
                      'CHRIS': {'estado': 'concluiu', 's': {'k1': [serie(160, 9), serie(200, 6), serie(220, 6)]}, 'b': {'k1': 0}}},
                'resultado': {'v': 2, 'modo': 'mano', 'pts': {'CHRIS': 1, 'MARI': 0}, 'ordem': ['CHRIS', 'MARI'], 'venc': 'CHRIS', 'wo': False}}
        r = C.evaluate("(d)=>{ const m=DUELO.mano(d); return {k1:m.por.k1, notaMari:DUELO.perfMano(d,'MARI','k1').lista[0]}; }", sala)
        R.ok('leg press da Mari: 260x6 (312) vence 220x6 (264), mesmo com o normal antigo baixo', r['k1'] == 'MARI' and round(r['notaMari']) == 312, r)
        sala2 = json.loads(json.dumps(sala)); sala2['ex']['k1'].pop('trPor'); sala2['j']['MARI']['b'] = {'k1': 100}; sala2['j']['MARI']['bx'] = {'k1': E[0]}
        sala2['j']['MARI']['s']['k1'] = [serie(300, 10)]
        R.ok('serie 4x acima do normal certo conta (o app nao supoe erro de digitacao)', C.evaluate("(d)=>DUELO.mano(d).por.k1", sala2) == 'MARI')
        # duelo antigo aberto num celular sem duelo em andamento
        L = A.celular(semente('CHRIS', 'chris_mello'))
        L.evaluate("(d)=>{ DUELO.cur={id:d.id, dados:JSON.parse(JSON.stringify(d))}; UI.vai('duelo',{id:d.id}); }", sala); L.wait_for_timeout(900)
        R.ok('resultado gravado com regra antiga e refeito ao abrir', L.evaluate("(DUELO.cur.dados.resultado||{}).v") == 4, L.evaluate("DUELO.cur && DUELO.cur.dados.resultado"))
        R.ok('placar explica o criterio', L.evaluate("/Cada exercício vale 1 ponto/.test(document.getElementById('main').textContent)"))
        R.ok('sem erros de JavaScript', not (M.erros or C.erros or Rf.erros), (M.erros[:1], C.erros[:1], Rf.erros[:1]))
    finally:
        A.fecha()
