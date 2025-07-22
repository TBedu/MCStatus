# MC Server Status API

A Node.js API to check the status of Minecraft servers.

## Features
- Get Minecraft server status by address (supports custom ports)
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

### Endpoint
```
GET /3/:serverAddress
```

### Parameters
- `serverAddress`: Minecraft服务器地址（格式：`host` 或 `host:port`，默认端口25565）

### 请求示例
#### 带端口号
```
GET /3/mc.tbedu.top:25565
```

#### 不带端口号（默认25565）
```
GET /3/mc.tbedu.top
```

### 响应示例
```json
{
  "ip": "118.112.60.42",
  "port": 25565,
  "debug": {
    "ping": true,
    "query": false,
    "bedrock": false,
    "srv": false,
    "animatedmotd": false,
    "cachehit": false,
    "cachetime": 1721631977,
    "cacheexpire": 1721632277,
    "apiversion": 3,
    "error": {}
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
  "software": "Paper",
  "eula_blocked": false
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
API返回的时间戳（cachetime和cacheexpire）使用**上海时区（UTC+8）**。

### Response Format
The response follows the format specified in api.json, including server status, players, version, and MOTD information.

## Configuration
Configuration is done through environment variables in the .env file:
- `PORT`: Server port (default: 3000)
- `RATE_LIMIT_WINDOW_MS`: Rate limit window in milliseconds (default: 900000 = 15 minutes)
- `RATE_LIMIT_MAX`: Maximum requests per IP in the window (default: 100)

## Dependencies
- express: Web framework
- minecraft-server-util: Minecraft server status checker
- express-rate-limit: Rate limiting middleware
- morgan: HTTP request logging
- dotenv: Environment variable management
