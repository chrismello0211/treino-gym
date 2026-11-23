# -*- coding: utf-8 -*-
"""11.40: feed em lotes, um destaque por vez, rotulos de 12 px, carga sugerida e erros registrados."""
from base import Ambiente, semente, treino, serie, ex_por_nome, ex_de_peso, toca, AGORA, DIA

NOME = 'Inicio mais leve, carga sugerida e diagnostico'


def rodar(pw, R):
    ids = ex_de_peso(10)
    tr = {'t%03d' % i: treino('t%03d' % i, i + 1, 'Treino %d' % i, [(e, [serie(40, 10), serie(45, 8)]) for e in ids[:4]], feedPub=True, volume=3000, series=8, recordes=0) for i in range(60)}
    rot = {'r0': {'id': 'r0', 'titulo': 'Peito', 'pasta': 'P', 'ordem': 0, 'criado': 1, 'ex': [{'exId': ids[0], 'descanso': 90, 'series': [{'tipo': 'N', 'kg': '', 'reps': ''}]}]}}
    A = Ambiente(pw)
    try:
        p = A.celular(semente('CHRIS', tg_treinos=tr, tg_rotinas=rot, tg_pastas={'P': {'id': 'P', 'nome': 'Trilha', 'ordem': 0}}), 360, 800)
        p.evaluate("UI.vai('inicio')"); p.wait_for_timeout(900)
        n0 = p.evaluate("FEED._lotes? FEED._lotes.desenhados() : -1"); total = p.evaluate("FEED._lotes? FEED._lotes.total : -1")
        R.ok('feed: abre com um lote (e nao todos os %s cartoes)' % total, 0 < n0 <= 12 and total >= 40, (n0, total))
        for _ in range(8):
            p.evaluate("window.scrollTo(0, document.body.scrollHeight)"); p.wait_for_timeout(350)
        n1 = p.evaluate("FEED._lotes.desenhados()")
        R.ok('feed: rolar carrega os proximos lotes', n1 > n0 + 12, (n0, n1))
        p.evaluate("window.scrollTo(0, Math.round(document.body.scrollHeight*0.6))"); p.wait_for_timeout(400)
        antes = p.evaluate("UI._ancora()")
        p.evaluate("UI.vai('treinoDet',{id:'t001'})"); p.wait_for_timeout(600)
        p.evaluate("UI.volta()"); p.wait_for_timeout(1200)
        depois = p.evaluate("(a)=>{ const el=[...document.querySelectorAll('#main [data-fid]')].find(x=>x.getAttribute('data-fid')===a.id); return el? Math.round(el.getBoundingClientRect().top) : null; }", antes)
        R.ok('feed: voltar de um treino devolve a pessoa ao mesmo cartao, no mesmo lugar', antes and depois is not None and abs(depois - antes['top']) < 30, (antes, depois))
        R.ok('rotulos dos numeros com 12 px ou mais (tela estreita)', p.evaluate("Math.min(...[...document.querySelectorAll('.fstat-k')].slice(0,6).map(e=>parseFloat(getComputedStyle(e).fontSize)))") >= 12)
        # um destaque por vez: com "Hora de evoluir?" no topo, o convite da meta some, o proximo treino fica
        p.evaluate("window.scrollTo(0,0); PROGSUG._b0=PROGSUG.banner; PROGSUG.banner=()=>h('div',{id:'pgfake',class:'card'},'Hora de evoluir?'); UI.vai('inicio')"); p.wait_for_timeout(700)
        txt = p.evaluate("document.getElementById('main').textContent")
        R.ok('um destaque por vez: com "Hora de evoluir?", o convite da meta some e o proximo treino fica', 'Hora de evoluir?' in txt and 'Defina uma meta semanal' not in txt and 'Próximo treino' in txt)
        p.evaluate("PROGSUG.banner=()=>null; UI.vai('inicio')"); p.wait_for_timeout(600)
        R.ok('sem outro destaque, o convite da meta volta', 'Defina uma meta semanal' in p.evaluate("document.getElementById('main').textContent"))
        # erros tratados aparecem no diagnostico; uma etapa da abertura quebrando nao derruba a seguinte
        p.evaluate("passo('teste-quebra', ()=>{ throw new Error('etapa quebrou de proposito'); }); passo('teste-segue', ()=>{ window.__segue=1; })")
        R.ok('abertura: uma etapa quebrando nao impede a seguinte', p.evaluate("window.__segue===1"))
        # o diagnostico copia o texto pra area de transferencia: captura o que seria copiado
        diag = p.evaluate("(()=>{ let cap=''; Object.defineProperty(navigator,'clipboard',{configurable:true, value:{writeText:t=>{ cap=t; return Promise.resolve(); }}}); diagnostico(); return cap; })()")
        R.ok('o erro tratado aparece no diagnostico', 'etapa quebrou de proposito' in diag and 'Erros tratados' in diag, diag[-300:])
        R.ok('sem erros de JavaScript', not p.erros, p.erros[:2])
    finally:
        A.fecha()
    # carga sugerida: ultima vez 40 x 12 em todas as series -> sugere 42,5 (barra) e "Usar" preenche
    BARRA = ex_por_nome('Supino inclinado com barra')
    hist = {'h1': treino('h1', 3, 'Peito', [(BARRA, [serie(40, 12), serie(40, 12), serie(40, 13)])])}
    ativo = {'id': 'a1', 'titulo': 'Peito', 'inicio': AGORA - 600000, 'ex': [{'exId': BARRA, 'descanso': 90, 'notas': '', 'series': [serie('', '', ok=False) for _ in range(3)]}]}
    A = Ambiente(pw)
    try:
        p = A.celular(semente(None, tg_treinos=hist, tg_ativo=ativo))
        p.evaluate("UI.vai('ativo',null,false)"); p.wait_for_timeout(700)
        dica = p.evaluate("(document.querySelector('.sug-carga')||{}).textContent||''")
        R.ok('carga sugerida: depois de 40 kg x 12 em todas, sugere 42,5 kg', '42,5' in dica and '40 kg × 12' in dica, dica[:120])
        toca(p, "[...document.querySelectorAll('.sug-carga button')].find(b=>/Usar/.test(b.textContent))", 700)
        R.ok('"Usar" preenche as series de trabalho e a dica some', p.evaluate("S.ativo.ex[0].series.map(s=>s.kg)") == ['42.5', '42.5', '42.5'] and not p.evaluate("!!document.querySelector('.sug-carga')"), p.evaluate("S.ativo.ex[0].series.map(s=>s.kg)"))
        p.evaluate("(()=>{ S.treinos.h1.ex[0].series=[{tipo:'N',kg:40,reps:10,ok:true},{tipo:'N',kg:40,reps:9,ok:true}]; delete S.ativo.ex[0]._sugFeita; S.ativo.ex[0].series.forEach(s=>s.kg=''); UI.refaz(); })()"); p.wait_for_timeout(400)
        R.ok('sem bater a faixa (40 x 10), nao sugere nada', not p.evaluate("!!document.querySelector('.sug-carga')"))
        R.ok('sem erros de JavaScript', not p.erros, p.erros[:2])
    finally:
        A.fecha()
