# Como ativar o modo online (grátis, uns 10 minutos)

O jogo contra bots funciona sem nada disso. Para jogar online com amigos, o jogo usa o **Firebase**, um serviço do Google que tem um plano gratuito (Spark). O plano grátis aguenta **100 pessoas conectadas ao mesmo tempo** e uns **10 GB de tráfego por mês**, o que dá centenas de partidas por mês. Não precisa de cartão de crédito.

## 1. Criar o projeto

1. Entre em <https://console.firebase.google.com> com sua conta Google.
2. Clique em **Criar um projeto** (ou "Adicionar projeto").
3. Dê um nome, por exemplo `buraco-amigos`.
4. Pode **desativar o Google Analytics** (não é necessário) e clique em **Criar projeto**.

## 2. Ativar o login anônimo

Cada aparelho entra com um "usuário anônimo". Ninguém precisa criar conta.

1. No menu da esquerda: **Criação → Authentication** e clique em **Vamos começar**.
2. Na aba **Método de login**, escolha **Anônimo**, ative e **Salve**.

## 3. Criar o banco de dados

1. No menu da esquerda: **Criação → Realtime Database** e clique em **Criar banco de dados**.
2. Escolha o local (qualquer um serve; `us-central1` é o padrão).
3. Escolha **Iniciar no modo bloqueado** e clique em **Ativar**.
4. Abra a aba **Regras**, apague tudo e cole o conteúdo do arquivo [`database.rules.json`](database.rules.json) deste projeto. Clique em **Publicar**.

Essas regras garantem que cada jogador só consiga ler a própria mão. Também garantem que só o anfitrião mexa na mesa.

## 4. Pegar a configuração do app

1. Clique na engrenagem ao lado de **Visão geral do projeto → Configurações do projeto**.
2. Em **Seus apps**, clique no ícone **`</>`** (Web).
3. Dê um apelido (ex.: `buraco-web`). **Não** precisa marcar o Firebase Hosting. Clique em **Registrar app**.
4. Vai aparecer um bloco parecido com este:

   ```js
   const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "buraco-amigos.firebaseapp.com",
     databaseURL: "https://buraco-amigos-default-rtdb.firebaseio.com",
     projectId: "buraco-amigos",
     storageBucket: "...",
     messagingSenderId: "...",
     appId: "1:...:web:..."
   };
   ```

   Se não aparecer a linha `databaseURL`, copie o endereço que aparece no topo da página do **Realtime Database** (começa com `https://` e termina em `firebaseio.com` ou `firebasedatabase.app`).

## 5. Colar no jogo

Abra o arquivo [`js/net/firebase-config.js`](js/net/firebase-config.js) e troque `export const firebaseConfig = null;` por:

```js
export const firebaseConfig = {
  apiKey: 'AIza...',
  authDomain: 'buraco-amigos.firebaseapp.com',
  databaseURL: 'https://buraco-amigos-default-rtdb.firebaseio.com',
  projectId: 'buraco-amigos',
  appId: '1:...:web:...',
};
```

Esses dados **não são senha**. Eles ficam visíveis no site de qualquer app que usa Firebase, e quem protege o banco são as regras do passo 3.

## 6. Liberar o endereço do site

Em **Authentication → Configurações → Domínios autorizados**, adicione o endereço onde o jogo vai ficar, por exemplo `seu-usuario.github.io`.

## Pronto

Abra o jogo, toque em **Jogar online com amigos** e depois em **Criar uma sala**. Mande o código ou o link de convite para os amigos.

### Como funciona por dentro

- Quem cria a sala é o **anfitrião**: o celular dele roda as regras e os bots.
- Os outros mandam as jogadas e recebem a mesa atualizada pelo Firebase.
- Se o anfitrião fechar o app, a partida fica pausada. Quando ele voltar e tocar em **Voltar para a sala**, ela continua de onde parou.
- Se um convidado cair, o anfitrião pode tocar em **pôr bot** no nome dele para a partida seguir.
- As salas são apagadas quando o anfitrião sai.
