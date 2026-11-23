# -*- coding: utf-8 -*-
"""Conta privada: so seguidores aprovados veem os treinos; quem ja seguia continua vendo; pedido, aprovar."""
from base import Ambiente, semente, AGORA, DIA, toca, espera

NOME = 'Perfil privado (pedidos e aprovacao)'


def rodar(pw, R):
    post = {'id': 't1', 'inicio': AGORA - DIA, 'fim': AGORA - DIA + 3600000, 'titulo': 'Peito e Triceps', 'nome': 'Chris', 'user': 'chris', 'v': 2, 'volume': 5000, 'series': 12, 'recordes': 0, 'atualizado': 1, 'ex': []}
    arv = {'perfis': {'CHRIS': {'user': 'chris', 'nome': 'Chris'}, 'RAFA': {'user': 'rafa', 'nome': 'Rafa'}, 'NOVO': {'user': 'novo', 'nome': 'Novo'}},
           'usernames': {'chris': 'CHRIS', 'rafa': 'RAFA', 'novo': 'NOVO'}, 'seguidores': {'CHRIS': {'RAFA': True}}, 'feed': {'CHRIS': {'t1': post}}}
    A = Ambiente(pw, arv)

    def pode_ler(caminho, quem):   # a mesma regra publicada no banco, pra leitura do feed
        partes = [x for x in caminho.split('/') if x]
        if len(partes) >= 2 and partes[0] == 'feed':
            dono = partes[1]
            if quem == dono or A.fb.get('/perfis/%s/privado' % dono) is not True: return True
            return A.fb.get('/aprovados/%s/%s' % (dono, quem)) is True
        return True
    A.fb.regra_leitura = pode_ler
    perfil = lambda u, n: {'nome': n, 'user': u, 'email': u + '@teste.com', 'criado': 1}
    try:
        C = A.celular(semente('CHRIS', 'chris', 'Chris', tg_perfil=perfil('chris', 'Chris')))
        Rf = A.celular(semente('RAFA', 'rafa', 'Rafa', tg_perfil=perfil('rafa', 'Rafa'), tg_social={'seguindo': {'CHRIS': {'user': 'chris', 'nome': 'Chris'}}}))
        N = A.celular(semente('NOVO', 'novo', 'Novo', tg_perfil=perfil('novo', 'Novo')))
        # Chris liga a conta privada em Ajustes
        C.evaluate("UI.vai('config')"); C.wait_for_timeout(600)
        toca(C, "[...document.querySelectorAll('#main .menu-op')].find(b=>/Conta privada/.test(b.textContent))", 1200)
        C.evaluate("NET.despacha()"); C.wait_for_timeout(1200)
        R.ok('Ajustes liga a conta privada (marca no perfil publico)', A.fb.get('/perfis/CHRIS/privado') is True)
        R.ok('quem ja seguia (Rafael) e aprovado automaticamente', A.fb.get('/aprovados/CHRIS/RAFA') is True)
        R.ok('a caixa em Ajustes mostra Ligado', C.evaluate("[...document.querySelectorAll('#main .menu-op')].find(b=>/Conta privada/.test(b.textContent)).querySelector('.chip').textContent") == 'Ligado')
        Rf.evaluate("FEED.carrega()"); Rf.wait_for_timeout(1500)
        R.ok('Rafael continua vendo os treinos do Chris', len(Rf.evaluate("FEED.amigos.CHRIS||[]")) == 1)
        # alguem novo segue: vira pedido e nao ve nada ainda
        N.evaluate("AMIGOS.seguir('CHRIS',{user:'chris',nome:'Chris'})"); N.wait_for_timeout(1500)
        R.ok('seguir uma conta privada vira pedido', (A.fb.get('/pedidos/CHRIS/NOVO') or {}).get('user') == 'novo')
        N.evaluate("FEED.carrega()"); N.wait_for_timeout(1500)
        R.ok('com o pedido pendente, o feed do Chris nao aparece pro novo seguidor', len(N.evaluate("FEED.amigos.CHRIS||[]")) == 0)
        N.evaluate("UI.vai('perfilAmigo',{uid:'CHRIS'})"); N.wait_for_timeout(900)
        R.ok('o perfil do Chris mostra que e privado', 'Perfil privado' in N.evaluate("document.getElementById('main').textContent"))
        # Chris aprova pela tela de amigos
        C.evaluate("AMIGOS.folha()"); C.wait_for_timeout(1200)
        R.ok('o pedido aparece na tela de amigos do Chris', C.evaluate("!!document.querySelector('#folha .ped-row')"))
        toca(C, "[...document.querySelectorAll('#folha .ped-row button')].find(b=>/Aprovar/.test(b.textContent))", 600)
        C.evaluate("NET.despacha()"); C.wait_for_timeout(1200)
        R.ok('aprovar libera o novo seguidor e apaga o pedido', A.fb.get('/aprovados/CHRIS/NOVO') is True and A.fb.get('/pedidos/CHRIS/NOVO') is None)
        N.evaluate("FEED.carrega()"); N.wait_for_timeout(1500)
        R.ok('depois de aprovado, o novo seguidor ve os treinos', len(N.evaluate("FEED.amigos.CHRIS||[]")) == 1)
        # desligar volta a ser publica
        C.evaluate("UI.fechaFolha(); PRIV.liga(false); NET.despacha()"); C.wait_for_timeout(1200)
        R.ok('desligar a conta privada tira a marca do perfil', A.fb.get('/perfis/CHRIS/privado') is None)
        R.ok('sem erros de JavaScript', not (C.erros or Rf.erros or N.erros), (C.erros[:1], Rf.erros[:1], N.erros[:1]))
    finally:
        A.fecha()
