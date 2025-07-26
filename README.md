# MC Server Status API

A Node.js API to check the status of Minecraft servers.

## Features
- Get Minecraft server status by address (supports custom ports)
- Support for both Java Edition and Bedrock Edition servers
- API call statistics (total, daily, and yesterday counts)
- Rate limiting to prevent abuse
- Request logging for monitoring
- Environment-based configuration

## Installation

1. Clone this repository
2. Install dependencies:
   ```
   npm install
   ```
3. Create a .env file with your configuration (see .env.example)
4. Start the server:
   ```
   node index.js
   ```

## API Usage

### Java Edition Endpoint
```
GET /3/:serverAddress
```

### Bedrock Edition Endpoint
```
GET /bedrock/3/:serverAddress
```

### Parameters
- `serverAddress`: Minecraft服务器地址（格式：`host` 或 `host:port`）
  - Java版默认端口：25565
  - 基岩版默认端口：19132

### 请求示例
#### Java版（带端口号）
```
GET /3/mc.tbedu.top:25565
```

#### Java版（不带端口号）
```
GET /3/mc.tbedu.top
```

#### 基岩版（带端口号）
```
GET /bedrock/3/mc.tbedu.top:19132
```

#### 基岩版（不带端口号）
```
GET /bedrock/3/mc.tbedu.top
```

### Java版响应示例
```json
{
  "ip": "118.112.60.42",
  "port": 25565,
  "latency": 45,
  "debug": {
    "ping": true,
    "srv": false,
    "animatedmotd": false,
    "cachetime": 1721631977,
    "apiversion": 3
  },
  "motd": {
    "raw": ["§fMinecraft Server§r"],
    "clean": ["Minecraft Server"],
    "html": ["<span style=\"color: #FFFFFF\">Minecraft Server</span>"]
  },
  "players": {
    "online": 12,
    "max": 100
  },
  "version": "1.21.8",
  "online": true,
  "hostname": "mc.tbedu.top",
  "icon": "data:image/png;base64,...",
  "software": "Paper"
}
```

### 基岩版响应示例
```json
{
  "ip": "118.112.60.42",
  "port": 19132,
  "debug": {
    "ping": true,
    "animatedmotd": false,
    "cachetime": 1721631977,
    "apiversion": 3
  },
  "motd": {
    "raw": ["Minecraft Bedrock Server"],
    "clean": ["Minecraft Bedrock Server"],
    "html": ["<span style=\"color: #FFFFFF\">Minecraft Bedrock Server</span>"]
  },
  "players": {
    "online": 8,
    "max": 50
  },
  "version": "1.21.0",
  "online": true,
  "hostname": "mc.tbedu.top"
}
```

### 错误处理
- **400 Bad Request**: 主机名解析失败
- **500 Internal Server Error**: 服务器连接错误
- **503 Service Unavailable**: 当服务器地址不带端口且需要SRV解析时
  ```json
  {
    "error": "本API暂不支持检测SRV解析后的服务器地址"
  }
  ```

### 时区说明
API返回的时间戳（cachetime）使用**上海时区（UTC+8）**。

## Configuration
Configuration is done through environment variables in the .env file:
- `PORT`: Server port (default: 3000)
- `RATE_LIMIT_WINDOW_MS`: Rate limit window in milliseconds (default: 60000 = 1 minute)
- `RATE_LIMIT_MAX`: Maximum requests per IP in the window (default: 100)
- `TRUST_PROXY`: Set to 'true' if running behind a reverse proxy

## Dependencies
- express: Web framework
- minecraft-server-util: Minecraft server status checker
- express-rate-limit: Rate limiting middleware
- morgan: HTTP request logging
- dotenv: Environment variable management
- cors: Cross-origin resource sharing
- moment-timezone: Time zone handling
- rotating-file-stream: Log file rotation
- fs: File system operations
- path: Path handling utilities
