# -*- coding: utf-8 -*-
"""Imagem que nao carrega mostra um substituto na hora, nunca o icone de imagem quebrada."""
import base64
from base import Ambiente, semente, treino, serie, ex_de_peso

NOME = 'Imagens: substituto quando a animacao nao carrega'
GIF_1PX = base64.b64decode('R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==')
QUEBRADAS = "[...document.querySelectorAll('#main img')].filter(i=>i.complete && i.naturalWidth===0 && i.getBoundingClientRect().width>0 && !i.classList.contains('img-falha')).length"


def rodar(pw, R):
    ids = ex_de_peso(4)
    hist = {'h1': treino('h1', 1, 'Peito', [(e, [serie(40, 10)]) for e in ids], feedPub=True)}

    def sem_animacao(route, url):
        # toda animacao de exercicio falha; a nova tentativa (?r=) tambem, a menos que liberada
        if '/g/' in url:
            if '?r=' in url and estado['libera']:
                return route.fulfill(status=200, content_type='image/gif', body=GIF_1PX)
            return route.abort()
        if 'nao-existe' in url:
            return route.abort()
        return route.continue_()
    estado = {'libera': False}
    A = Ambiente(pw)
    try:
        p = A.celular(semente('CHRIS', tg_treinos=hist), local=sem_animacao)
        p.evaluate("UI.vai('treinoDet',{id:'h1'})"); p.wait_for_timeout(350)
        R.ok('miniaturas: nenhuma imagem quebrada logo depois de abrir a tela', p.evaluate(QUEBRADAS) == 0, p.evaluate(QUEBRADAS))
        R.ok('miniaturas: as iniciais do exercicio aparecem no lugar', p.evaluate("document.querySelectorAll('#main .thumb-ini').length") >= 4)
        # a nova tentativa da certo: a animacao volta pro lugar
        estado['libera'] = True
        p.evaluate("UI.vai('treinoDet',{id:'h1'})"); p.wait_for_timeout(2200)
        R.ok('miniaturas: se a nova tentativa der certo, a animacao volta', p.evaluate("[...document.querySelectorAll('#main img.thumb')].filter(i=>i.naturalWidth>0).length") >= 4)
        estado['libera'] = False
        p.evaluate("UI.vai('exercicio',{id:'%s'})" % ids[0]); p.wait_for_timeout(900)
        R.ok('tela do exercicio: a imagem grande mostra o substituto', p.evaluate("!!document.querySelector('#main .ex-hero-falha')") and p.evaluate(QUEBRADAS) == 0)
        p.evaluate("(()=>{ const i=document.createElement('img'); i.id='teste-img'; i.src='nao-existe.png'; i.style.width='40px'; i.style.height='40px'; document.getElementById('main').appendChild(i); })()"); p.wait_for_timeout(700)
        R.ok('qualquer outra imagem que falhe mostra o halter neutro', p.evaluate("(()=>{ const i=document.getElementById('teste-img'); return i.classList.contains('img-falha') && i.src.indexOf('data:image/svg')===0 && i.naturalWidth>0; })()"))
        # no feed, as iniciais tem o tamanho da miniatura (antes eram maiores e o cartao pulava ao trocar)
        p.evaluate("UI.vai('inicio')"); p.wait_for_timeout(900)
        tam = p.evaluate("(()=>{ const i=document.querySelector('#main .feed-ex .thumb-ini'); if(!i) return null; const r=i.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })()")
        R.ok('feed: as iniciais tem o mesmo tamanho da miniatura (44 x 44)', tam == [44, 44], tam)
        R.ok('sem erros de JavaScript', not p.erros, p.erros[:2])
    finally:
        A.fecha()
