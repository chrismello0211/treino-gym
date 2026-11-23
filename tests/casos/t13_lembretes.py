# -*- coding: utf-8 -*-
"""Lembrete de treino e resumo semanal: a decisao do servidor e a tela do app."""
import json, subprocess
from base import Ambiente, semente, treino, serie, ex_de_peso, toca, espera, RAIZ, AGORA, DIA

NOME = 'Lembrete de treino e resumo semanal'
CASOS = r"""
const {decide}=require(process.argv[1]);
const base=Date.UTC(2026,10,23,21,0);  // segunda 23/11/2026, 18:00 em Fortaleza (UTC-3)
const c={treino:{on:true,dias:[1,2,3,4,5],hora:'18:00'},resumo:{on:true},tz:180,proxima:'Pernas',ultimoDia:'2026-11-21',semanaAnt:{chave:'2026-11-16',n:4,vol:12300,rec:2}};
const r={
  noHorario: decide(base,c).map(m=>m.body),
  antes: decide(base-10*60000,c).length, depois: decide(base+20*60000,c).length,
  jaTreinou: decide(base,Object.assign({},c,{ultimoDia:'2026-11-23'})).length,
  jaEnviado: decide(base,Object.assign({},c,{enviadoTreino:'2026-11-23'})).length,
  domingo: decide(base-86400000,c).length,
  desligado: decide(base,Object.assign({},c,{treino:Object.assign({},c.treino,{on:false})})).length,
  resumo: decide(Date.UTC(2026,10,23,11,5),c).map(m=>m.body),
  resumoSemTreino: decide(Date.UTC(2026,10,23,11,5),Object.assign({},c,{semanaAnt:{chave:'2026-11-16',n:0,vol:0,rec:0}})).length
};
process.stdout.write(JSON.stringify(r));
"""


def rodar(pw, R):
    r = subprocess.run(['node', '-e', CASOS, str(RAIZ / 'functions' / 'lembretes-logica.js')], capture_output=True, text=True, timeout=60)
    d = json.loads(r.stdout) if r.returncode == 0 else {}
    R.ok('servidor: no dia e horario certos, avisa com o proximo treino', d.get('noHorario') == ['Hoje é dia de Pernas.'], d or r.stderr[:200])
    R.ok('servidor: fora do horario, nada', d.get('antes') == 0 and d.get('depois') == 0)
    R.ok('servidor: se ja treinou hoje, nao avisa', d.get('jaTreinou') == 0)
    R.ok('servidor: nao manda duas vezes no mesmo dia', d.get('jaEnviado') == 0)
    R.ok('servidor: em dia nao escolhido, nada', d.get('domingo') == 0 and d.get('desligado') == 0)
    R.ok('servidor: resumo de segunda com os numeros da semana anterior', d.get('resumo') == ['4 treinos, 12.300 kg, 2 recordes. Bora pra próxima!'], d.get('resumo'))
    R.ok('servidor: semana sem treino, sem resumo', d.get('resumoSemTreino') == 0)
    ids = ex_de_peso(2)
    tr = {'t1': treino('t1', 0, 'Peito', [(ids[0], [serie(40, 10)])], volume=400, recordes=1)}
    rot = {'r0': {'id': 'r0', 'titulo': 'Pernas', 'pasta': 'P', 'ordem': 0, 'criado': 1, 'ex': [{'exId': ids[1], 'descanso': 60, 'series': [{'tipo': 'N', 'kg': '', 'reps': ''}]}]}}
    A = Ambiente(pw)
    try:
        # o bloco "Conta" de Ajustes (notificacoes e lembretes) aparece so pra quem tem conta com e-mail
        p = A.celular(semente('CHRIS', tg_perfil={'nome': 'Chris', 'user': 'chris', 'email': 'chris@teste.com', 'criado': 1}, tg_treinos=tr, tg_rotinas=rot, tg_pastas={'P': {'id': 'P', 'nome': 'Trilha', 'ordem': 0}}))
        p.evaluate("UI.vai('config')"); p.wait_for_timeout(600)
        toca(p, "[...document.querySelectorAll('#main .menu-op')].find(b=>/Lembrete e resumo/.test(b.textContent))", 700)
        R.ok('Ajustes abre a tela de lembretes, avisando que as notificacoes estao desligadas', 'notificações deste aparelho estão desligadas' in p.evaluate("document.getElementById('folha').textContent"))
        toca(p, "[...document.querySelectorAll('#folha .menu-op')].find(b=>/Lembrete de treino/.test(b.textContent))", 500)
        toca(p, "document.querySelector('#folha .lemb-dia[aria-label=\"sábado\"]')", 400)
        p.evaluate("(()=>{ const i=document.querySelector('#folha .lemb-hora'); i.value='19:30'; i.dispatchEvent(new Event('change',{bubbles:true})); })()"); p.wait_for_timeout(300)
        toca(p, "[...document.querySelectorAll('#folha .menu-op')].find(b=>/Resumo semanal/.test(b.textContent))", 500)
        # a caixa da opcao em Ajustes (atras da janela) ja mostra ligado, sem precisar sair e voltar
        chip = p.evaluate("(()=>{ const b=[...document.querySelectorAll('#main .menu-op')].find(b=>/Lembrete e resumo/.test(b.textContent)); return b? b.querySelector('.chip').textContent : null; })()")
        R.ok('a caixa em Ajustes mostra o lembrete ligado na hora (nao "Desligado")', chip and chip != 'Desligado' and '19:30' in chip, chip)
        p.evaluate("UI.fechaFolha()"); p.wait_for_timeout(500)
        chip2 = p.evaluate("(()=>{ const b=[...document.querySelectorAll('#main .menu-op')].find(b=>/Lembrete e resumo/.test(b.textContent)); return b? b.querySelector('.chip').textContent : null; })()")
        R.ok('...e continua certa depois de fechar a janela', chip2 == chip, chip2)
        ok = espera(p, "true", 1) and p.wait_for_timeout(3500) is None
        g = A.fb.get('/lembretes/CHRIS') or {}
        R.ok('o app grava a configuracao no cantinho do lembrete', (g.get('treino') or {}).get('on') is True and (g.get('treino') or {}).get('hora') == '19:30' and 6 in (g.get('treino') or {}).get('dias', []) and (g.get('resumo') or {}).get('on') is True, g)
        R.ok('...com fuso, proximo treino, ultimo dia e numeros da semana', isinstance(g.get('tz'), int) and g.get('proxima') == 'Pernas' and g.get('ultimoDia') and (g.get('semana') or {}).get('n') == 1 and (g.get('semana') or {}).get('rec') == 1, {k: g.get(k) for k in ('tz', 'proxima', 'ultimoDia', 'semana')})
        R.ok('sem erros de JavaScript', not p.erros, p.erros[:2])
    finally:
        A.fecha()
