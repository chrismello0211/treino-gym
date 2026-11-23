# -*- coding: utf-8 -*-
"""Fila de envio: foto grande e recomprimida; recusa de regra sai da fila; login vencido continua."""
from base import Ambiente, semente

NOME = 'Fila de envio (fotos e recusas do banco)'
GERA = """(()=>{ const c=document.createElement('canvas'); c.width=1400; c.height=1400; const g=c.getContext('2d'); const d=g.createImageData(1400,1400);
  for(let i=0;i<d.data.length;i+=4){ d.data[i]=Math.random()*255; d.data[i+1]=Math.random()*255; d.data[i+2]=Math.random()*255; d.data[i+3]=255; }
  g.putImageData(d,0,0); return c.toDataURL('image/jpeg',0.92); })()"""


def rodar(pw, R):
    A = Ambiente(pw)
    def regras(metodo, caminho, texto):
        if '/fotos/' in caminho and len(texto) >= 300000: return (401, '{"error":"Permission denied"}')
        if '/perfis/OUTRO' in caminho: return (401, '{"error":"Permission denied"}')
        if '/perfis/CHRIS/token' in caminho: return (401, '{"error":"Auth token is expired"}')
        return None
    A.fb.recusar = regras
    try:
        p = A.celular(semente('CHRIS'))
        grande = p.evaluate(GERA)
        p.evaluate("(v)=>{ S.fila=[{path:'/fotos/CHRIS/t1', val:v}]; salva('fila'); NET.despacha(); }", grande)
        ok = False
        for _ in range(30):
            p.wait_for_timeout(500)
            if any(g[1] == '/fotos/CHRIS/t1' and g[2] == 200 for g in A.fb.gravacoes): ok = True; break
        subiu = [g for g in A.fb.gravacoes if g[1] == '/fotos/CHRIS/t1' and g[2] == 200]
        R.ok('foto acima do limite e recomprimida e sobe abaixo de 300.000 caracteres', ok and subiu[0][3] < 300000, (len(grande), A.fb.gravacoes[-3:]))
        R.ok('...e sai da fila', p.evaluate("!(S.fila||[]).some(f=>f.path==='/fotos/CHRIS/t1')"))
        p.evaluate("(()=>{ S.fila=[{path:'/perfis/OUTRO/nome', val:'x'}]; salva('fila'); })()")
        for _ in range(6): p.evaluate("NET.despacha()"); p.wait_for_timeout(600)
        R.ok('recusa de regra (401 Permission denied) sai da fila depois de 3 tentativas', p.evaluate("!(S.fila||[]).length") and sum(1 for g in A.fb.gravacoes if '/perfis/OUTRO' in g[1]) == 3)
        p.evaluate("(()=>{ S.fila=[{path:'/perfis/CHRIS/token', val:'x'}]; salva('fila'); })()")
        for _ in range(4): p.evaluate("NET.despacha()"); p.wait_for_timeout(600)
        R.ok('login vencido (401 de token) continua na fila', p.evaluate("(S.fila||[]).some(f=>f.path==='/perfis/CHRIS/token')"))
        R.ok('sem erros de JavaScript', not p.erros, p.erros[:2])
    finally:
        A.fecha()
