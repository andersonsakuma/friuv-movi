# Amazônia Bee · Geladeira de mel

Aplicativo para Android que acompanha a geladeira **Resfri Ar AK1** por Bluetooth e controla o estoque de mel em kg, por lote.

- Temperatura interna e configurada em tempo real (consulta automática a cada 5 s).
- Ajuste da temperatura configurada (zona 1) com confirmação na primeira alteração da sessão e conferência do valor devolvido pela geladeira.
- Faixa de conservação configurável (padrão 4–8 °C, mel in natura) com alerta após tempo contínuo fora da faixa.
- Lotes de mel: entrada em kg, espécie da abelha, meliponário, comunidade, data da colheita, umidade, responsável.
- Saídas por lote com destino (beneficiamento, venda, análise, doação, descarte), sugestão do lote mais antigo primeiro, estorno e opção de desfazer.
- Histórico de 30 dias de temperatura com gráfico, mínimas, máximas, média e tempo na faixa.
- Cópia de segurança (.json) e planilhas CSV prontas para Excel (separador `;` e vírgula decimal).
- Funciona sem internet depois da primeira abertura. Tema claro para uso sob sol e tema escuro.
- Modo demonstração com geladeira simulada e dados de exemplo, separado dos dados reais.

## Dados que já vêm cadastrados

| Item | Valor |
|---|---|
| Geladeira | `AK1-FEFE0C070750` · `50:07:07:0C:FE:C0` |
| Serviço / comando / estado | `1234` / `1235` / `1236` |
| Consulta de estado | `FE FE 03 01 02 00` |
| Setpoint zona 1 | `FE FE 04 05 TT CS_HI CS_LO` |
| Último estado validado | 10 °C interna · 13 °C configurada (Etapa 1) |
| RSSI observado | −62 a −66 dBm |

O protocolo está em [`docs/PROTOCOLO_OBSERVADO.md`](docs/PROTOCOLO_OBSERVADO.md). Os comandos ligar/desligar, ECO/MAX, H1/H2/H3 e segunda zona continuam fora do app até serem validados.

## Como publicar (uma vez)

O Bluetooth pelo navegador só funciona em endereço **HTTPS**. O jeito mais simples é o GitHub Pages, gratuito:

1. Crie um repositório no GitHub (por exemplo `geladeira-mel`).
2. Envie **todo o conteúdo desta pasta** para a raiz do repositório (`index.html` precisa ficar na raiz).
3. Em **Settings → Pages**, escolha *Deploy from a branch*, branch `main`, pasta `/ (root)` e salve.
4. Em um ou dois minutos o endereço fica disponível: `https://USUARIO.github.io/geladeira-mel/`.

Também funciona em Netlify, Cloudflare Pages ou qualquer hospedagem com HTTPS. Todos os caminhos são relativos.

## Como instalar no celular Android

1. Abra o endereço no **Google Chrome** do Android (versão atual).
2. Menu ⋮ → **Instalar app** (ou *Adicionar à tela inicial*).
3. Abra pelo ícone da abelha. Na primeira vez, informe nome da geladeira, capacidade em kg e responsável.
4. Toque em **Conectar geladeira** e escolha `AK1-FEFE0C070750` no seletor do sistema.

Antes de conectar: feche o app oficial da geladeira e o nRF Connect (o módulo aceita uma conexão por vez), ative Bluetooth e Localização e fique perto da unidade.

Depois da primeira autorização, o app tenta reconectar sozinho ao abrir, quando o Chrome permite. Se a conexão cair, ele tenta de novo em 5, 10, 15… até 30 s.

**iPhone:** o Safari não oferece Bluetooth pelo navegador. O controle de estoque funciona, a conexão com a geladeira não.

### APK para distribuir (opcional)

Com o app já publicado em HTTPS, é possível gerar um APK sem Android Studio:

1. Acesse `https://www.pwabuilder.com`, cole o endereço publicado e gere o pacote **Android**.
2. Instale o APK gerado nos celulares (permitir instalação de fontes desconhecidas) ou publique na Play Store.

O APK abre o mesmo app em tela cheia e usa o Chrome do aparelho para o Bluetooth.

## Testar no computador Windows

O Chrome e o Edge do Windows também acessam Bluetooth em `http://localhost`:

```powershell
.\servidor_local.bat
```

Depois abra `http://localhost:8080` no Chrome ou no Edge. Requer Python 3 instalado.

## Onde ficam os dados

Tudo fica **somente no aparelho** (IndexedDB do navegador). Desinstalar o app ou limpar os dados do Chrome apaga os lotes. Use **Ajustes → Cópia de segurança** com frequência e guarde o arquivo `.json` no Drive ou no computador. **Restaurar cópia** carrega o arquivo em outro celular.

Leituras de temperatura são gravadas no máximo uma vez por minuto (ou quando a temperatura muda) e mantidas por 30 dias.

## Estrutura

```text
index.html              interface
manifest.webmanifest    instalação como app
sw.js                   funcionamento sem internet
css/app.css             identidade visual (cores dos logotipos Amazônia Bee e IPÊ FIS)
js/protocol.js          protocolo AK1 — porta fiel de etapa1/python/app.py
js/ble.js               Web Bluetooth, simulador e regras de segurança do controle
js/db.js                armazenamento local
js/app.js               telas, lotes, alertas, gráficos e exportações
assets/                 logotipos e ícones
fonts/                  Barlow e Barlow Condensed (licença OFL)
docs/                   protocolo observado
tests/                  testes de paridade com o Python
servidor_local.bat      servidor local para testes no Windows
```

## Testes do protocolo

`tests/vetores.json` foi gerado a partir do `app.py` original: 256 pacotes de setpoint, 3.000 quadros (válidos, checksum errado, comando errado, tamanho errado) e um fluxo de 200 quadros fragmentados com ruído. O JavaScript reproduz exatamente o resultado do Python:

```bash
node tests/protocol.test.js
# OK: 256 setpoints, 3000 quadros, 155 estados em fluxo fragmentado
```

Para gerar de novo a partir de outra versão do `app.py`:

```bash
python tests/gen_vectors.py caminho/para/app.py tests/vetores.json
```

## Regras de segurança mantidas do app Python

- Consulta de estado sem alterar nada; setpoint só por ação do usuário.
- Controle liberado só depois de um quadro de estado válido (checksum conferido), com controles desbloqueados e dentro da faixa mínima/máxima informada pela geladeira.
- Primeira alteração de cada sessão mostra o pacote HEX e pede confirmação.
- Depois do envio, o app consulta a geladeira até 4 vezes; se o valor não voltar igual, avisa para parar os testes e preservar o log.
- Log técnico completo em **Ajustes → Diagnóstico técnico**, com botão para copiar.

## Referências de conservação

- Portaria SAR/SC nº 37/2020 (mel de abelha sem ferrão): mel in natura mantido de 4 a 8 °C no armazenamento e na comercialização.
- Embrapa, curso de colheita e processamento de mel de abelhas sem ferrão: refrigeração de 0 a 10 °C evita a fermentação.

Confirme a norma vigente no estado onde o mel será comercializado e ajuste a faixa em **Ajustes → Conservação do mel**.
