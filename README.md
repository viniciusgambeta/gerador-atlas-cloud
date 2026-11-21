# Gerador

Estúdio que roda no seu computador para criar **imagens, vídeos e áudios** com os modelos do [Atlas Cloud](https://www.atlascloud.ai). Você escolhe os modelos, escreve o que quer e compara os resultados lado a lado, numa linha do tempo.

Ele também funciona como **servidor MCP**: o Claude e o ChatGPT instalados no seu computador conseguem gerar pelo Gerador, a seu pedido.

- Sem login e sem instalar pacotes: só precisa do Node.js.
- Tudo o que você gera fica numa pasta do seu computador.
- Você paga só o que usar no Atlas Cloud, direto para eles. O custo de cada geração aparece na tela.

## Instalar

Você precisa de três coisas: um computador com Windows ou Mac, o Node.js e uma conta no Atlas Cloud com saldo.

1. **Baixe o Gerador.** Nesta página, clique no botão verde **Code** e depois em **Download ZIP**. Extraia o arquivo numa pasta que você vá manter (por exemplo, `Documentos\Gerador`).
2. **Instale o Node.js.** Entre em https://nodejs.org, baixe a versão **LTS** e instale com as opções padrão.
3. **Abra o Gerador.** Dê dois cliques em **`Abrir Gerador.bat`** (Windows) ou **`Abrir Gerador.command`** (Mac). O navegador abre em `http://localhost:7777`.
4. **Cole a sua API key.** Crie a chave em https://www.atlascloud.ai/console/api-keys e cole na tela de Configurações, que abre sozinha na primeira vez.

Dicas:

- **Atalho na área de trabalho (Windows):** clique com o botão direito em `Abrir Gerador.bat` → *Enviar para* → *Área de trabalho (criar atalho)*.
- **Aviso do Windows na primeira vez:** se aparecer "O Windows protegeu o computador", clique em *Mais informações* → *Executar assim mesmo*.
- **No Mac:** se o arquivo não abrir com dois cliques, clique com o botão direito → *Abrir*.

No Windows o Gerador roda em segundo plano: a janela preta aparece por um instante e fecha sozinha, e ele continua ligado mesmo com a aba do navegador fechada. Para desligar, use **Configurações → Encerrar**. No Mac ele roda na janela do Terminal; feche a janela para desligar.

## Usar

No topo do painel há três abas. As três funcionam do mesmo jeito: escolha os modelos, escreva o pedido e aperte **Gerar** (`Ctrl + Enter`).

### Imagens

- **Texto → imagem**: escreva o prompt e gere.
- **Com referência**: adicione uma ou mais imagens (clicar, arrastar ou colar com `Ctrl + V`) para editar uma imagem, manter um personagem ou seguir um estilo.
- **Proporção e qualidade**: cada modelo usa o valor mais próximo do que ele aceita.
- **No visualizador** (clique na imagem): cortar e ajustar, **aumentar a resolução**, **tirar o fundo**, usar como referência, levar para um vídeo.

### Vídeos

| Modo | O que faz | O que precisa |
|---|---|---|
| **Texto** | cria o vídeo só com o prompt | prompt |
| **Imagem** | anima uma imagem | imagem inicial; a final é opcional |
| **Referência** | usa imagens e vídeos de personagem, objeto, estilo ou movimento | imagens, vídeos ou os dois |
| **Editar** | altera um vídeo existente pelo prompt | um vídeo; imagens de apoio são opcionais |
| **Estender** | continua um vídeo existente | um vídeo |

- **Duração**: livre, dentro do que cada modelo aceita. Quando um modelo vai usar outro valor, isso aparece embaixo do controle.
- **Cortar um vídeo de entrada**: clique na miniatura para escolher onde o trecho começa e termina. Precisa do **ffmpeg** instalado (`winget install ffmpeg` no Windows).
- **No visualizador**: editar, estender e **aumentar a resolução**.

### Áudio

| Modo | O que faz |
|---|---|
| **Fala** | lê um texto com a voz que você escolher. Dá para ouvir uma amostra de cada voz, mudar a velocidade e indicar o idioma |
| **Música** | cria uma música a partir de uma descrição. A letra é opcional, e há a opção só instrumental |
| **Efeitos** | cria um efeito sonoro ou um som ambiente, com duração e opção de loop |
| **Transcrever** | passa um áudio (ou o áudio de um vídeo) para texto |

- **Vídeo falante**: em qualquer áudio gerado, o botão de filme pede uma foto (ou um vídeo) e cria um vídeo em que a pessoa fala aquele áudio. O resultado aparece na aba Vídeos.

### Na linha do tempo

| Ação | Como |
|---|---|
| Buscar uma geração antiga | campo **Buscar no histórico**, no topo |
| Ver o prompt | clicar em **Prompt** |
| Refazer, ou refazer com outro modelo | botões à direita de cada geração |
| Levar de volta para o painel e ajustar | lápis |
| Usar só um modelo | duplo clique no modelo |
| Apagar | lixeira, e confirmar no segundo clique |

- **Modelos**: a lista vem ao vivo do Atlas Cloud. Em **Configurações** você liga os que quer ver em cada aba.
- **Custo**: o botão Gerar mostra uma estimativa. Depois de gerar, aparece o valor cobrado; quando o Atlas não informa, fica a estimativa com `≈`.

## Conectar ao Claude e ao ChatGPT (MCP)

MCP é o jeito de um assistente de IA usar um programa do seu computador. Com o Gerador conectado, você pede no chat "gere uma imagem de…" e o assistente gera pelo Gerador, com os modelos e o saldo que você definiu.

### O jeito fácil

1. Abra o Gerador e vá em **Configurações → Agentes de IA**.
2. Clique em **Conectar agora**. Ele procura os assistentes instalados e se registra neles.
3. **Feche o assistente por completo e abra de novo.** No Claude Desktop, feche pelo ícone perto do relógio (*Sair*), não só a janela.
4. Teste com um pedido assim: *"liste os modelos de imagem do Gerador e gere um gato astronauta no mais barato"*.

Sem abrir o Gerador, dá no mesmo: dois cliques em **`Conectar agentes.bat`** (Windows) ou **`Conectar agentes.command`** (Mac).

### Onde funciona

| Assistente | Funciona? |
|---|---|
| Claude Desktop (app instalado) | sim |
| Claude Code | sim |
| ChatGPT para desktop e Codex | sim |
| Cursor | sim |
| ChatGPT ou Claude **no navegador** | não: no navegador eles só alcançam serviços na internet, não programas do seu computador |

### O que o assistente consegue fazer

| Ferramenta | O que faz |
|---|---|
| `listar_modelos` | lista os modelos ligados, com preço, vozes e o que cada um aceita |
| `gerar_imagem` | gera imagens, com ou sem imagens de referência |
| `gerar_video` | gera, edita ou estende vídeos, nos cinco modos da aba Vídeos |
| `gerar_audio` | fala, música, efeito sonoro ou transcrição |
| `consultar_geracao` | acompanha uma geração e devolve o caminho dos arquivos e o custo |
| `listar_geracoes` | lista as gerações recentes, para reaproveitar um resultado |
| `ver_saldo` | mostra o saldo e quanto os assistentes já gastaram hoje |

O que o assistente gera aparece na linha do tempo, marcado com o nome dele.

### O que fica sob o seu controle

- **Limites de gasto**: um valor máximo por geração e outro por dia (o padrão é US$ 3 e US$ 15). Acima disso o Gerador recusa e explica ao assistente.
- **Modelos**: o assistente só usa os modelos que você ligou nas Configurações.
- **Liga e desliga**: uma chave nas Configurações corta o acesso de todos os assistentes.
- **Só no seu computador**: o Gerador não aceita pedidos de outros sites nem de outras máquinas.

### Conectar à mão

O botão **Conectar agora** faz exatamente isto. Só é preciso seguir à mão se você usa outro assistente ou prefere conferir. Troque `CAMINHO` pela pasta onde o Gerador está (o caminho completo aparece em Configurações → Agentes de IA → *Conectar outro agente à mão*).

**Claude Desktop**: *Configurações → Desenvolvedor → Editar configuração* abre o arquivo `claude_desktop_config.json`. Acrescente:

```json
{
  "mcpServers": {
    "gerador": { "command": "node", "args": ["CAMINHO\\mcp.js"] }
  }
}
```

**ChatGPT para desktop e Codex**: no arquivo `config.toml` da pasta `.codex`, dentro da sua pasta de usuário, acrescente no fim:

```toml
[mcp_servers.gerador]
command = "node"
args = ["CAMINHO\\mcp.js"]
```

**Claude Code**:

```
claude mcp add --scope user gerador -- node "CAMINHO\mcp.js"
```

**Outros assistentes**: os que iniciam um comando usam `node "CAMINHO\mcp.js"`; os que conectam por endereço usam `http://localhost:7777/mcp` (nesse caso o Gerador precisa estar aberto).

### Se não funcionar

| O que acontece | O que fazer |
|---|---|
| O assistente não mostra o Gerador | feche o assistente por completo e abra de novo; depois confira em Configurações → Agentes de IA se a chave está ligada |
| "Node não encontrado" | instale o Node.js LTS e conecte de novo |
| O assistente diz que passou do limite | aumente o limite em Configurações → Agentes de IA |
| O assistente diz que o modelo não está ligado | ligue o modelo em Configurações, na aba certa (imagens, vídeos ou áudio) |
| Para desconectar | apague a entrada `gerador` do arquivo de configuração do assistente. O conector guarda uma cópia do arquivo original ao lado dele, terminada em `.antes-do-gerador` |

## Onde ficam as coisas

Tudo fica na pasta `data/`, dentro da pasta do Gerador:

- `data/images/`, `data/videos/` e `data/audio/`: o que foi gerado, separado por dia
- `data/refs/`: imagens, vídeos e áudios que você enviou como entrada
- `data/config.json`: sua API key e suas escolhas
- `data/db.json`: o histórico da linha do tempo
- `data/gerador.log`: mensagens do app quando ele roda em segundo plano

**Não compartilhe a pasta `data/`**: ela tem a sua API key. Para passar o Gerador a outra pessoa, mande o link desta página.

Para atualizar o Gerador, baixe a versão nova e copie a sua pasta `data/` para dentro dela.

## Para quem quer mexer no código

O Gerador é um servidor Node.js sem dependências e uma página em JavaScript puro.

| Arquivo | O que tem |
|---|---|
| `server.js` | o servidor: rotas, fila de gerações, arquivos |
| `lib/atlas.js` | as chamadas à API do Atlas Cloud |
| `lib/mapper.js`, `lib/vmapper.js`, `lib/amapper.js` | leem o schema de cada modelo de imagem, vídeo e áudio e montam o pedido |
| `lib/tools.js` | ferramentas de um clique: aumentar resolução, tirar fundo, vídeo falante |
| `lib/mcp.js`, `lib/agent.js`, `mcp.js` | o servidor MCP, as ferramentas dos assistentes e a ponte por linha de comando |
| `conectar-agentes.js` | registra o Gerador nos assistentes instalados |
| `public/` | a tela: `app.js` (imagens e base), `video.js`, `audio.js`, `app.css` |

Para rodar em outra porta: `PORT=8080 node server.js`.
