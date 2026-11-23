# -*- coding: utf-8 -*-
"""Base comum da bateria de testes do ForgeX.

Sobe um servidor local com o app (a pasta do repositorio), simula o Firebase em memoria
(leitura, gravacao, consultas por campo e streaming) e abre "celulares" no Chromium do
Playwright. Nenhum teste fala com o Firebase de verdade.
"""
import json, os, socket, subprocess, sys, threading, time, urllib.parse, http.server, functools
from pathlib import Path

# FORGEX_RAIZ permite rodar a mesma bateria contra outra copia do app (ex.: comparar com a versao anterior)
RAIZ = Path(os.environ.get('FORGEX_RAIZ') or Path(__file__).resolve().parent.parent)
DB = 'https://iron-gym-aa932-default-rtdb.firebaseio.com'
AGORA = int(time.time() * 1000)
DIA = 86400000
UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.2 Mobile/15E148 Safari/604.1'
UA_ANDROID = 'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'

CATALOGO = [x for x in json.load(open(RAIZ / 'exercicios.json', encoding='utf-8')) if not x.get('oc')]
POR_ID = {x['id']: x for x in CATALOGO}


def ex_por_nome(nome):
    for x in CATALOGO:
        if x['n'] == nome:
            return x['id']
    raise SystemExit('exercicio fora do catalogo: ' + nome)


def ex_de_peso(n, pular=0):
    ids = [x['id'] for x in CATALOGO if x.get('t', 'peso_reps') == 'peso_reps' and x.get('e') != 'peso-corporal']
    return ids[pular:pular + n]


# ---------------------------------------------------------------- servidor local
class _Silencioso(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def _porta_livre():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); p = s.getsockname()[1]; s.close(); return p


class Servidor:
    def __init__(self, pasta=RAIZ):
        self.porta = _porta_livre()
        h = functools.partial(_Silencioso, directory=str(pasta))
        self.srv = http.server.ThreadingHTTPServer(('127.0.0.1', self.porta), h)
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()
        self.url = 'http://127.0.0.1:%d' % self.porta

    def fecha(self):
        self.srv.shutdown()


# ---------------------------------------------------------------- Firebase simulado
class FirebaseFalso:
    """Arvore em memoria com GET/PUT/PATCH/DELETE, orderBy+equalTo e streaming (SSE)."""

    def __init__(self, arvore=None):
        self.arvore = arvore or {}
        self.recusar = None          # funcao(metodo, caminho, corpo) -> (status, corpo) ou None
        self.gravacoes = []          # (metodo, caminho, status, tamanho)

    def get(self, caminho):
        n = self.arvore
        for k in [urllib.parse.unquote(x) for x in caminho.split('/') if x]:
            if not isinstance(n, dict) or k not in n:
                return None
            n = n[k]
        return n

    def put(self, caminho, valor):
        ks = [urllib.parse.unquote(x) for x in caminho.split('/') if x]
        n = self.arvore
        for k in ks[:-1]:
            if not isinstance(n.get(k), dict):
                n[k] = {}
            n = n[k]
        if valor is None:
            n.pop(ks[-1], None)
        else:
            n[ks[-1]] = valor

    def rota(self, route, req):
        url = req.url
        if not url.startswith(DB):
            # login/renovacao de token e qualquer outro servico externo: resposta vazia
            return route.fulfill(status=200, content_type='application/json', body='{}')
        u = urllib.parse.urlparse(url)
        caminho = u.path[:-5] if u.path.endswith('.json') else u.path
        q = urllib.parse.parse_qs(u.query)
        if 'text/event-stream' in (req.headers.get('accept') or ''):
            corpo = 'retry: 400\nevent: put\ndata: ' + json.dumps({'path': '/', 'data': self.get(caminho)}) + '\n\n'
            return route.fulfill(status=200, headers={'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache'}, body=corpo)
        if req.method == 'GET':
            v = self.get(caminho)
            if 'orderBy' in q and 'equalTo' in q and isinstance(v, dict):
                campo = json.loads(q['orderBy'][0]); igual = json.loads(q['equalTo'][0])
                v = {k: x for k, x in v.items() if isinstance(x, dict) and x.get(campo) == igual}
            return route.fulfill(status=200, content_type='application/json', body=json.dumps(v))
        texto = req.post_data or ''
        corpo = json.loads(texto) if texto else None
        if self.recusar:
            r = self.recusar(req.method, caminho, texto)
            if r:
                self.gravacoes.append((req.method, caminho, r[0], len(texto)))
                return route.fulfill(status=r[0], content_type='application/json', body=r[1])
        if req.method == 'PUT':
            self.put(caminho, corpo)
        elif req.method == 'PATCH':
            for k, v in (corpo or {}).items():
                self.put(caminho + '/' + k, v)
        elif req.method == 'DELETE':
            self.put(caminho, None)
        self.gravacoes.append((req.method, caminho, 200, len(texto)))
        return route.fulfill(status=200, content_type='application/json', body=json.dumps(corpo))


# ---------------------------------------------------------------- dados de exemplo
def cfg_base(**extra):
    c = {'termos': 9, 'novid': 99, 'atualizado': 1, 'recRecalc3': 1, 'recKg1': 1}
    c.update(extra)
    return c


def semente(uid=None, user='chris', nome='Chris', **extra):
    s = {'tg_cfg': cfg_base(), 'tg_perfil': {'nome': nome, 'user': user, 'criado': 1}}
    if uid:
        s['tg_auth'] = {'uid': uid, 'idToken': 'tok-' + uid, 'refreshToken': 'x', 'exp': AGORA + 10 ** 9}
    s.update(extra)
    return s


def serie(kg, reps, ok=True, tipo='N'):
    return {'tipo': tipo, 'kg': kg, 'reps': reps, 'ok': ok}


def treino(tid, dias_atras, titulo, exs, **extra):
    t = {'id': tid, 'titulo': titulo, 'inicio': AGORA - dias_atras * DIA, 'fim': AGORA - dias_atras * DIA + 3600000,
         'atualizado': 1, 'ex': [{'exId': e, 'series': ss} for e, ss in exs]}
    t.update(extra)
    return t


# ---------------------------------------------------------------- resultado
class Resultado:
    def __init__(self):
        self.falhas = []
        self.passou = 0

    def ok(self, nome, cond, detalhe=None):
        if cond:
            self.passou += 1
            print('  PASS  ' + nome)
        else:
            self.falhas.append(nome)
            print('  FALHA ' + nome + ('' if detalhe is None else '   [' + str(detalhe)[:220] + ']'))


# ---------------------------------------------------------------- celulares
class Ambiente:
    """Um servidor + um Firebase simulado + o navegador. Cada teste abre os celulares que precisar."""

    def __init__(self, pw, arvore=None):
        self.srv = Servidor()
        self.fb = FirebaseFalso(arvore)
        self.nav = pw.chromium.launch()
        self.paginas = []

    def celular(self, seed, largura=393, altura=852, ua=None, tela=None, standalone=False, android_app=False, externo=None, local=None):
        # local(route, url): intercepta arquivos do proprio app (ex.: simular animacao que nao carrega)
        opts = dict(viewport={'width': largura, 'height': altura}, is_mobile=True, has_touch=True)
        if ua: opts['user_agent'] = ua
        if tela: opts['screen'] = {'width': tela[0], 'height': tela[1]}
        ctx = self.nav.new_context(**opts)
        base = self.srv.url
        def _rota(r):
            u = r.request.url
            if u.startswith(base):
                if local:
                    return local(r, u)
                return r.continue_()
            return (externo or self.fb.rota)(r, r.request)
        ctx.route('**/*', _rota)
        extra = ''
        if standalone:
            extra += "Object.defineProperty(navigator,'standalone',{get:()=>true});"
        if android_app:
            extra += ("const mm=window.matchMedia.bind(window); window.matchMedia=q=>{ if(/display-mode:\\s*standalone/.test(q)) "
                      "return {matches:true, media:q, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){}, onchange:null}; return mm(q); };")
        ctx.add_init_script('(()=>{ if(!location.href.startsWith(%s)) return; %s if(sessionStorage.getItem("s")) return; sessionStorage.setItem("s","1"); '
                            'const s=%s; for(const k in s) localStorage.setItem(k, JSON.stringify(s[k])); })()' % (json.dumps(base), extra, json.dumps(seed)))
        p = ctx.new_page()
        p.erros = []
        p.on('pageerror', lambda e: p.erros.append(str(e)))
        p.on('dialog', lambda d: d.accept())
        p.goto(base + '/index.html')
        p.wait_for_function('typeof UI!=="undefined" && !!document.querySelector("#main *")', timeout=20000)
        p.wait_for_timeout(1800)
        self.paginas.append(p)
        return p

    def fecha(self):
        try:
            self.nav.close()
        finally:
            self.srv.fecha()


def espera(p, js, seg=10):
    t0 = time.time()
    while time.time() - t0 < seg:
        try:
            if p.evaluate(js):
                return True
        except Exception:
            pass
        p.wait_for_timeout(200)
    return False


def centro(p, js_elemento):
    """Rola ate o elemento e devolve o centro dele (para tocar como um dedo)."""
    return p.evaluate("(()=>{ const el=(%s); if(!el) return null; el.scrollIntoView({block:'center'}); const r=el.getBoundingClientRect(); "
                      "return [Math.round(r.left+r.width/2), Math.round(r.top+r.height/2)]; })()" % js_elemento)


def toca(p, js_elemento, espera_ms=700):
    xy = centro(p, js_elemento)
    if xy:
        p.touchscreen.tap(*xy)
        p.wait_for_timeout(espera_ms)
    return xy
