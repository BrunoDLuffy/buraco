# Buraco entre Amigos

Buraco online **sem anúncios**, para jogar com a família e os amigos ou contra bots. Funciona no navegador do celular ou do computador, e dá para instalar na tela inicial como um app.

## O que tem

- **Modos de jogo:** Buraco Aberto, Buraco Fechado, STBL (Sem Trinca, Bate Limpo) e Personalizado. No Personalizado você escolhe o lixo aberto ou fechado, se vale trinca, se precisa de canastra limpa para bater, se entram jokers e o bônus da canastra de Ás a Ás.
- **Contra bots:** 1 contra 1, ou em duplas com um bot de parceiro. Cada bot pode ser **fácil, médio ou difícil**.
- **Online com amigos:** até 4 pessoas por sala, com código de 5 letras e link de convite. Lugares vazios podem ser preenchidos com bots. Assim dá para jogar 2 amigos contra 2 bots, ou cada pessoa com um bot de parceiro.
- **Partida sempre na horizontal.** Se o celular estiver em pé, a mesa gira sozinha. Os menus funcionam nas duas posições.
- **Arte própria:** cartas, verso, mesa de feltro e ícones desenhados em SVG, sem imagens externas. Há 3 cores de mesa e 4 versos de carta.
- A partida contra bots fica salva e dá para continuar depois. Também funciona sem internet depois de aberto uma vez.

## Custos

Nenhum. O site pode ser hospedado de graça no **GitHub Pages**. O modo online usa o plano gratuito do **Firebase**. O passo a passo está em [FIREBASE.md](FIREBASE.md).

## Publicar no GitHub Pages

1. No GitHub, abra o repositório e vá em **Settings → Pages**.
2. Em **Build and deployment → Source**, escolha **Deploy from a branch**.
3. Escolha o branch (ex.: `main`) e a pasta **/ (root)** e salve.
4. Em 1 ou 2 minutos o jogo fica em `https://SEU-USUARIO.github.io/NOME-DO-REPO/`.

## Rodar no computador

```bash
npm start      # abre um servidor em http://localhost:8080
npm test       # testes das regras, dos bots e do modo online
```

Para testar as telas da sala online sem Firebase, abra `http://localhost:8080/?teste-online`. Isso usa um banco simulado só naquele aparelho.

## Organização do código

| Pasta | O que tem |
|---|---|
| `js/engine/` | Regras do jogo: baralho, validação de jogos, turnos, morto, batida e pontuação |
| `js/ai/` | Bots (fácil, médio, difícil) |
| `js/controllers/` | Partida no aparelho (você contra bots) |
| `js/net/` | Salas online (anfitrião, convidados, Firebase) |
| `js/ui/` | Telas, mesa, arte das cartas e sons |
| `tests/` | Testes automáticos (`npm test`) |
