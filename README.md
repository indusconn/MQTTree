# MQTTree

**MQTTree** is a Windows-first desktop app for exploring MQTT brokers as a live folder-style topic tree.

It connects to EMQX, HiveMQ, Mosquitto, and compatible MQTT brokers using secure MQTT, secure WebSockets, or plain MQTT for local/public testing.

## Highlights

- Folder-style MQTT topic hierarchy built from received messages.
- Multiple broker tabs with isolated connection state, logs, subscriptions, and history.
- MQTT over TLS/SSL on port `8883`.
- WebSocket over TLS/SSL on port `8084`.
- Plain MQTT on port `1883` for local or public test brokers.
- MQTT `3.1.1` and MQTT `5.0`.
- QoS `0`, `1`, and `2`.
- Retained messages, duplicate flag, timestamps, MQTT 5 properties, and Last Will support.
- Anonymous login, username/password, custom CA, and mutual TLS.
- Text, formatted JSON, and hexadecimal payload views.
- Publishing tools with QoS, retain flag, content type, and reusable templates.
- Detailed connection, subscription, publish, reconnect, and error logs.
- 10,000-message in-memory ring buffer per connection.
- Capture pause/resume without disconnecting.
- Passwords and key passphrases encrypted with Electron `safeStorage`.

## Why MQTTree?

MQTT does not provide a standard "list all topics" API. MQTTree discovers topics by subscribing to filters and building the tree from messages the broker sends back.

For example, a topic like:

```text
factory/line-1/temperature
```

appears as:

```text
factory
+-- line-1
    +-- temperature
```

## Screens and workflow

Typical workflow:

1. Create or edit a broker connection.
2. Choose transport: MQTT/TLS, WSS/TLS, or plain MQTT.
3. Configure authentication and TLS certificates if needed.
4. Choose default subscription filters.
5. Connect and inspect the live topic tree.
6. Select a topic to view payload, metadata, history, and publish replies.

## Subscription filters

The app builds the hierarchy from subscription filters.

Examples:

```text
factory/#
$SYS/#
devices/+/telemetry
test/my-name/#
```

Avoid using `#` on large or public brokers unless you know the account is allowed to subscribe to everything. Many brokers reject it or send too much traffic.

If you see this log:

```text
Subscribe error: Unspecified error
ErrorWithSubackPacket
filter: "#"
```

it usually means the broker accepted the connection but rejected the `#` subscription. Edit the connection and replace `#` with a narrower filter such as `$SYS/#`, `test/your-name/#`, or the topic prefix your broker account is allowed to access.

## Built-in Mosquitto test connection

MQTTree includes a quick test profile for:

```text
test.mosquitto.org:1883
```

The test profile uses:

```text
$SYS/#
```

instead of `#` to avoid the public broker firehose.

## Requirements

For running the packaged app:

- Windows 10 or newer.

For development:

- Node.js 20 or newer.
- npm.
- Docker Desktop only if you want to run the EMQX TLS/WSS integration tests.

## Install dependencies

```powershell
npm.cmd install --cache .npm-cache
```

Use `npm.cmd` on Windows PowerShell. The `npm.ps1` shim may be blocked by execution policy.

## Run in development

```powershell
npm.cmd run dev
```

## Run tests

```powershell
npm.cmd test
npm.cmd run typecheck
```

Run the EMQX integration tests:

```powershell
npm.cmd run test:integration
```

The integration test script starts a disposable TLS-enabled EMQX container, uses ports `8883` and `8084`, creates a short-lived localhost certificate under `.integration-temp`, and cleans up afterward.

## Build

```powershell
npm.cmd run build
```

## Package for Windows

Portable executable:

```powershell
npm.cmd run package
```

Unpacked app directory:

```powershell
npm.cmd run package:dir
```

NSIS installer:

```powershell
npm.cmd run package:nsis
```

Build artifacts are written to the configured release directory.

## Project structure

```text
src/
+-- main/       Electron main process: MQTT, TLS, profiles, logs, buffering
+-- preload/    Restricted typed bridge exposed to the renderer
+-- renderer/   React UI: connection forms, topic tree, inspector, logs
+-- shared/     Shared contracts, validation, IPC names, utilities
```

## Security model

MQTT clients, TLS files, reconnect logic, message buffers, profile storage, and secret handling live in Electron's main process.

The React renderer runs with:

- Node integration disabled.
- Context isolation enabled.
- A restricted typed preload API.
- Main-process validation for renderer requests.

Captured broker traffic is kept in memory only and is not persisted.

## Notes

- Topic discovery depends on received messages and retained messages.
- The broker account must be authorized for the subscription filters you configure.
- Public brokers can be noisy; start with narrow filters.
- MQTTree is a desktop inspection tool, not a broker bridge or persistent traffic recorder.

## License


