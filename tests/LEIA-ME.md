# Testes do ForgeX

A bateria abre o app num navegador de verdade (Chromium), com celulares simulados (iPhone e Android) e um Firebase falso em memoria. Nada fala com o banco de verdade.

## Rodar no computador

```
pip install -r tests/requirements.txt
python -m playwright install chromium
node verify.mjs
python tests/rodar.py            # todos os casos
python tests/rodar.py t07 t03    # so alguns casos (pelo nome do arquivo)
```

Para comparar com outra copia do app (por exemplo, a versao anterior): `FORGEX_RAIZ=/caminho/da/copia python tests/rodar.py`.

## No GitHub

O fluxo `.github/workflows/publicar.yml` roda o validador e esta bateria a cada envio. O site so e publicado se tudo passar.

## Casos

| Arquivo | O que garante |
| --- | --- |
| t01_telas | Todas as telas abrem sem erro e sem vazar, em iPhone e Android |
| t02_aparelhos | Barra de abas visivel no Android; compensacao do cronometro so no iPhone |
| t03_editar_treino | Editar treino finalizado com toques reais: busca, adicionar, aviso de exercicio vazio, salvar |
| t04_menu_preso | O menu nunca fica preso fora da tela |
| t05_alvos_toque | Alvos de toque de 44 pontos no treino em andamento e no feed |
| t06_imagens | Imagem que nao carrega mostra substituto, nunca o icone quebrado |
| t07_duelo | Duelo com 3 celulares, convites e regra do placar |
| t08_recordes | Desempate do recorde de carga e comparacao com amigos |
| t09_fila | Fila de envio: foto grande, recusa do banco, login vencido |
| t10_proximo_treino | Proximo treino reconhece duelo com ficha de outra pessoa |

## Ao mudar a versao

```
node scripts/versao.mjs 11.40.0
```
Troca a versao no app, no cache do service worker e no validador de uma vez.
