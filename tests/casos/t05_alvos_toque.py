# -*- coding: utf-8 -*-
"""Alvos de toque: tocar ate 21 pontos do centro (area de 44) ainda acerta o botao, sem roubar o vizinho."""
from base import Ambiente, semente, serie, treino, ex_de_peso, AGORA

NOME = 'Alvos de toque de 44 pontos (treino em andamento e feed)'

# elementos de conteudo: so os visiveis fora das barras (topo e abas cobrem o que passa por baixo); os do topo: onde estao
ACERTA = """(args)=>{ const [sel, eixos]=args; const doTopo=sel.indexOf('#topo')===0;
  const els=[...document.querySelectorAll(sel)].filter(e=>{ const r=e.getBoundingClientRect(); return r.width>0 && (doTopo? r.top>=0 : (r.top>90 && r.bottom<innerHeight-110)); });
  const el=els[0]; if(!el) return {achou:false};
  const r=el.getBoundingClientRect(), cx=r.left+r.width/2, cy=r.top+r.height/2, d=21;
  const pts=[]; if(eixos.includes('v')) pts.push([cx,cy-d],[cx,cy+d]); if(eixos.includes('h')) pts.push([cx-d,cy],[cx+d,cy]);
  const erros=pts.filter(([x,y])=>{ const hit=document.elementFromPoint(x,y); return !(hit && (hit===el || el.contains(hit))); }).map(([x,y])=>{ const hit=document.elementFromPoint(x,y); return [Math.round(x-cx),Math.round(y-cy),hit? (hit.className||hit.tagName):null]; });
  return {achou:true, tam:Math.round(r.width)+'x'+Math.round(r.height), erros}; }"""


def rodar(pw, R):
    ids = ex_de_peso(2)
    ativo = {'id': 'a1', 'titulo': 'Peito', 'inicio': AGORA - 900000,
             'ex': [{'exId': e, 'descanso': 90, 'notas': '', 'series': [serie(40, 10, ok=j < 1) for j in range(3)]} for e in ids]}
    hist = {'h1': treino('h1', 3, 'Peito', [(ids[0], [serie(38, 10), serie(40, 8)])], feedPub=True),
            'h2': treino('h2', 2, 'Costas', [(ids[1], [serie(30, 12)])], feedPub=True)}
    A = Ambiente(pw)
    try:
        p = A.celular(semente('CHRIS', tg_ativo=ativo, tg_treinos=hist))
        p.evaluate("UI.vai('ativo',null,false)"); p.wait_for_timeout(800)
        for nome, sel, eixos in (('marcar serie (check)', '.scheck', 'vh'), ('tipo da serie', '.stipo', 'vh'), ('campos de carga e repeticoes', '.srow input', 'v'),
                                 ('"anterior" (copia a serie passada)', '.anterior.tem', 'v'), ('"Adicionar serie"', '.add-serie', 'v'), ('linha do descanso', '.desc-linha', 'v'),
                                 ('"..." do exercicio', 'button[aria-label^="Mais opções de"]', 'vh'), ('botoes do topo', '#topo .btn-mini', 'v')):
            r = p.evaluate(ACERTA, [sel, eixos])
            R.ok('treino em andamento: %s acerta a 21 pontos do centro' % nome, r.get('achou') and not r.get('erros'), r)
        vizinhos = p.evaluate("""(()=>{ const cs=[...document.querySelectorAll('.scheck')].filter(e=>{ const r=e.getBoundingClientRect(); return r.width>0 && r.top>90 && r.bottom<innerHeight-110; }); let ruim=0;
            cs.forEach(c=>{ const r=c.getBoundingClientRect(); const hit=document.elementFromPoint(r.left+r.width/2, r.top+r.height/2); if(!(hit===c || c.contains(hit))) ruim++; }); return {total:cs.length, roubados:ruim}; })()""")
        R.ok('o check de cada serie continua com o proprio centro (ninguem rouba o toque do vizinho)', vizinhos['total'] >= 3 and vizinhos['roubados'] == 0, vizinhos)
        p.evaluate("S.ativo=null; salva('ativo'); UI.vai('inicio')"); p.wait_for_timeout(900)
        for nome, sel, eixos in (('"..." do cartao do feed', '.feed-mais', 'vh'), ('curtir e comentar', '.heart', 'v')):
            r = p.evaluate(ACERTA, [sel, eixos])
            R.ok('feed: %s acerta a 21 pontos do centro' % nome, r.get('achou') and not r.get('erros'), r)
        R.ok('sem erros de JavaScript', not p.erros, p.erros[:2])
    finally:
        A.fecha()
