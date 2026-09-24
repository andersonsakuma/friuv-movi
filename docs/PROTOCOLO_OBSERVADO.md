# Protocolo BLE observado — Resfri Ar AK1

## Dispositivo real

```text
Nome: AK1-FEFE0C070750
Serviço: 00001234-0000-1000-8000-00805F9B34FB
Comando: 00001235-0000-1000-8000-00805F9B34FB
Estado: 00001236-0000-1000-8000-00805F9B34FB
```

## Consulta de estado

O aplicativo usa a consulta:

```text
FE FE 03 01 02 00
```

O dispositivo retorna um quadro começando por `FE FE`. A resposta real observada contém o comando `01`, dados de estado e checksum. O aplicativo valida o comprimento, o checksum e os campos antes de mostrar a temperatura estruturada.

## Campos atualmente utilizados

No payload de resposta, o aplicativo utiliza a hipótese compatível com implementações públicas Alpicool/BrassMonkey:

```text
payload[0]  controles bloqueados
payload[1]  ligado
payload[2]  modo: 0=MAX, 1=ECO
payload[4]  temperatura configurada
payload[5]  temperatura máxima permitida
payload[6]  temperatura mínima permitida
payload[9]  unidade: 0=C, 1=F
payload[14] temperatura atual
payload[15] percentual informado pelo módulo
payload[16] tensão inteira
payload[17] décimo da tensão
```

As temperaturas são interpretadas como bytes assinados. No quadro observado, `0A` corresponde a `10 °C` e `0D` corresponde a `13 °C`.

## Setpoint da zona 1

O comando atual é:

```text
FE FE 04 05 TT CS_HI CS_LO
```

`TT` é a temperatura assinada em um byte. O checksum é a soma dos bytes anteriores em big-endian. Exemplo para `7 °C`:

```text
FE FE 04 05 07 02 0C
```

Esse comando só é enviado quando o usuário aciona o botão de ajuste. Antes do primeiro envio de uma sessão, o aplicativo mostra o pacote e pede confirmação.

## O que ainda não está validado

Não assumir como confirmado, sem novos testes reais:

- ligar/desligar;
- ECO/MAX como comando;
- tensão de alimentação como bateria real;
- proteção H1/H2/H3;
- segunda zona;
- reset, bind ou comandos de configuração adicionais.

Qualquer expansão deve registrar o pacote enviado, o retorno recebido e o efeito observado fisicamente.
