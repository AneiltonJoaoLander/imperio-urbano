# 🏙️ Império Urbano

Jogo de tabuleiro de compra e venda de propriedades (inspirado nos clássicos do gênero) para **2 a 6 jogadores online**, feito só com HTML, CSS e JavaScript — sem build, sem backend próprio.

## Como jogar

1. Abra a página, digite seu nome e clique em **Criar sala**.
2. Compartilhe o **código** (ou o **link**) com seus amigos; eles clicam em **Entrar**.
3. O anfitrião inicia a partida. Vence quem sobrar sem falir!

Regras implementadas: dados e dobros (3 dobros = cadeia), compra de propriedades, **leilão** quando se recusa comprar, aluguel (grupo de cor completo dobra), estações e companhias, casas e hotéis (construção uniforme), **hipoteca**, impostos, cartas de Sorte e Caixa Comunitária, cadeia (fiança, dobro, cartão de saída), **negociação** entre jogadores (dinheiro + propriedades), dívidas, falência e desistência, chat.

## Arquitetura online (cliente ↔ servidor ↔ cliente)

```
 Cliente B ──WebRTC──┐
                     ├──► Anfitrião (servidor autoritativo: roda js/game.js)
 Cliente C ──WebRTC──┘         │ valida cada ação e envia o estado completo
                               ▼ a todos os clientes
```

* O navegador de quem cria a sala é o **servidor autoritativo**: só ele executa a lógica (`js/game.js`); os clientes enviam *ações* (`rolar`, `comprar`, `dar lance`…) e recebem o estado.
* Transporte: [PeerJS](https://peerjs.com) (WebRTC). O servidor público de sinalização do PeerJS apenas apresenta os navegadores uns aos outros; depois a comunicação é direta.
* **Reconexão**: cada jogador tem um token secreto; se a página recarregar ou a rede cair, o jogador volta ao mesmo lugar. O anfitrião também pode **retomar a sala** após recarregar (o estado é salvo no `localStorage`).
* Se o anfitrião fechar a aba definitivamente, a partida acaba (é o "servidor").

> Observação: em redes muito restritivas (NAT simétrico/firewalls corporativos) a conexão WebRTC direta pode falhar, pois não há servidor TURN. Nesses casos, tente outra rede ou use dados móveis.

## Estrutura

```
index.html        página única
css/style.css     visual e layout responsivo
js/game.js        regras (puro, roda no navegador e no Node)
js/net.js         rede (anfitrião/cliente sobre PeerJS)
js/app.js         interface e sessão
tests/sim.js      simulação com bots aleatórios (node tests/sim.js 100)
```

## Rodar localmente

```bash
python -m http.server 8000   # ou qualquer servidor estático
# abra http://localhost:8000
```
